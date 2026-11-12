//! Syncs the app data directory with a private GitHub repository.
//!
//! The whole data folder is plain text (`config.json`, `projects/*/meta.json`,
//! `projects/*/items/*`), so a sync is just a three-way merge between:
//!
//! * `local`  - what is on disk now
//! * `remote` - the tree at the branch head
//! * `base`   - the tree as it was after this device's last sync
//!
//! `base` is what makes it a merge rather than a guess: it tells us which
//! side actually changed. Every sync ends in exactly one commit, so the
//! repository history doubles as a backup of every previous state.

use crate::github;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Public identifier of the GitHub App. Not a secret: it only names which
/// app is asking, and the device flow needs no client secret.
const CLIENT_ID: &str = match option_env!("UNUSUAL_GITHUB_CLIENT_ID") {
    Some(id) => id,
    None => "Iv23liLXRthKHzI3H2tj",
};

/// The app's URL slug, used to send the user somewhere they can install it
/// or change which repositories it may touch.
const APP_SLUG: &str = match option_env!("UNUSUAL_GITHUB_APP_SLUG") {
    Some(slug) => slug,
    None => "unusual-app",
};

/// A GitHub App takes its permissions from its registration, not from the
/// request. The only value it accepts here guarantees a refresh token even
/// if token expiry was turned off on the app.
const SCOPE: &str = "offline_access";
const DEFAULT_REPO: &str = "unusual-data";
const KEYRING_SERVICE: &str = "unusual-app";
const KEYRING_USER: &str = "github";
const STATE_FILE: &str = "sync.json";

type Result<T> = std::result::Result<T, String>;

/// Where to send the user to install the app, or to change which
/// repositories it can reach.
fn install_url() -> String {
    format!("https://github.com/apps/{APP_SLUG}/installations/new")
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ----------------------------------------------------------------- credentials

fn keyring() -> Result<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("could not reach the system keychain: {e}"))
}

fn save_credentials(credentials: &github::Credentials) -> Result<()> {
    let json = serde_json::to_string(credentials).map_err(|e| e.to_string())?;
    keyring()?
        .set_password(&json)
        .map_err(|e| format!("could not store the token in the keychain: {e}"))
}

fn read_credentials() -> Result<Option<github::Credentials>> {
    match keyring()?.get_password() {
        Ok(json) => serde_json::from_str(&json)
            .map(Some)
            .map_err(|e| format!("stored credentials are unreadable: {e}")),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("could not read the keychain: {e}")),
    }
}

fn forget_credentials() -> Result<()> {
    match keyring()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("could not clear the keychain: {e}")),
    }
}

/// Returns a usable access token, renewing it first when the OAuth app
/// expires tokens. Refresh tokens rotate, so the new pair is stored.
async fn current_credentials() -> Result<github::Credentials> {
    let credentials = read_credentials()?.ok_or("not connected to GitHub")?;

    let expired = credentials.expires_at.is_some_and(|at| now_secs() >= at);
    if !expired {
        return Ok(credentials);
    }

    let refresh_token = credentials
        .refresh_token
        .ok_or("the GitHub session expired - connect again")?;
    let renewed = github::refresh(CLIENT_ID, &refresh_token).await?;
    save_credentials(&renewed)?;
    Ok(renewed)
}

// ----------------------------------------------------------------- sync state

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct SyncState {
    repo: Option<String>,
    branch: Option<String>,
    last_commit: Option<String>,
    /// `path -> blob sha` as of this device's last successful sync.
    #[serde(default)]
    base: BTreeMap<String, String>,
    last_sync: Option<i64>,
}

fn data_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not locate the data folder: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("could not create the data folder: {e}"))?;
    Ok(dir)
}

fn read_state(app: &AppHandle) -> Result<SyncState> {
    let path = data_dir(app)?.join(STATE_FILE);
    if !path.exists() {
        return Ok(SyncState::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    // A corrupt state file costs one redundant merge, not data: start over.
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

fn write_state(app: &AppHandle, state: &SyncState) -> Result<()> {
    let path = data_dir(app)?.join(STATE_FILE);
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("could not save sync state: {e}"))
}

// -------------------------------------------------------------- local snapshot

/// Git's own blob hash, so local and remote shas are directly comparable
/// without uploading anything.
fn blob_sha(content: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(format!("blob {}\0", content.len()).as_bytes());
    hasher.update(content);
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn is_synced_path(relative: &str) -> bool {
    relative == "config.json" || relative.starts_with("projects/")
}

fn collect_files(root: &Path, dir: &Path, out: &mut BTreeMap<String, Vec<u8>>) -> Result<()> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(()),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            collect_files(root, &path, out)?;
            continue;
        }

        let relative = path
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");

        if !is_synced_path(&relative) {
            continue;
        }
        let content = std::fs::read(&path).map_err(|e| format!("could not read {relative}: {e}"))?;
        out.insert(relative, content);
    }
    Ok(())
}

fn local_snapshot(app: &AppHandle) -> Result<BTreeMap<String, Vec<u8>>> {
    let root = data_dir(app)?;
    let mut files = BTreeMap::new();
    collect_files(&root, &root, &mut files)?;
    Ok(files)
}

fn write_local(app: &AppHandle, relative: &str, content: &[u8]) -> Result<()> {
    let path = data_dir(app)?.join(relative);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| format!("could not write {relative}: {e}"))
}

fn delete_local(app: &AppHandle, relative: &str) -> Result<()> {
    let root = data_dir(app)?;
    let path = root.join(relative);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("could not delete {relative}: {e}"))?;
    }
    // Drop the project folder once its last file is gone.
    let mut parent = path.parent().map(|p| p.to_path_buf());
    while let Some(dir) = parent {
        if dir == root || !dir.starts_with(&root) {
            break;
        }
        let is_empty = std::fs::read_dir(&dir)
            .map(|mut entries| entries.next().is_none())
            .unwrap_or(false);
        if !is_empty {
            break;
        }
        let _ = std::fs::remove_dir(&dir);
        parent = dir.parent().map(|p| p.to_path_buf());
    }
    Ok(())
}

// ------------------------------------------------------------- meta.json merge

/// `meta.json` is the one file where last-write-wins would really hurt: two
/// devices each adding a note would silently drop one of them. Merging the
/// item list by id keeps both, and uses `base` to tell a deletion (gone on one
/// side, untouched on the other) from an addition.
fn merge_meta(base: Option<&[u8]>, local: &[u8], remote: &[u8]) -> Option<Vec<u8>> {
    let mut merged: serde_json::Value = serde_json::from_slice(local).ok()?;
    let remote_json: serde_json::Value = serde_json::from_slice(remote).ok()?;
    let base_json: Option<serde_json::Value> = base.and_then(|b| serde_json::from_slice(b).ok());

    fn items(value: &serde_json::Value) -> BTreeMap<String, serde_json::Value> {
        value
            .get("items")
            .and_then(|i| i.as_array())
            .map(|array| {
                array
                    .iter()
                    .filter_map(|item| {
                        let id = item.get("id")?.as_str()?.to_string();
                        Some((id, item.clone()))
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    fn updated_at(item: &serde_json::Value) -> i64 {
        item.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(0)
    }

    let local_items = items(&merged);
    let remote_items = items(&remote_json);
    let base_items = base_json.as_ref().map(items).unwrap_or_default();

    let ids: BTreeSet<&String> = local_items.keys().chain(remote_items.keys()).collect();
    let mut result = Vec::new();

    for id in ids {
        match (local_items.get(id), remote_items.get(id)) {
            // Present on both sides: the more recent edit wins.
            (Some(l), Some(r)) => {
                result.push(if updated_at(r) > updated_at(l) {
                    r.clone()
                } else {
                    l.clone()
                });
            }
            // Only here: new locally, unless the other side deleted it.
            (Some(l), None) => {
                if !base_items.contains_key(id) {
                    result.push(l.clone());
                }
            }
            (None, Some(r)) => {
                if !base_items.contains_key(id) {
                    result.push(r.clone());
                }
            }
            (None, None) => {}
        }
    }

    result.sort_by_key(|item| {
        item.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0)
    });

    // The project name follows whichever side actually renamed it.
    let base_name = base_json
        .as_ref()
        .and_then(|b| b.get("name"))
        .and_then(|n| n.as_str())
        .map(|s| s.to_string());
    let local_name = merged.get("name").and_then(|n| n.as_str()).map(String::from);
    if local_name == base_name {
        if let Some(remote_name) = remote_json.get("name") {
            merged["name"] = remote_name.clone();
        }
    }

    merged["items"] = serde_json::Value::Array(result);
    serde_json::to_vec_pretty(&merged).ok()
}

// ------------------------------------------------------------------ the merge

/// What the branch should contain for one path after merging.
enum Resolution {
    /// Already in the remote tree under this sha - nothing to upload.
    Remote(String),
    /// Bytes that only exist locally and still need a blob.
    Upload(Vec<u8>),
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub repo: String,
    pub pulled: usize,
    pub pushed: usize,
    pub removed: usize,
    /// Files changed on both sides. The local version was kept; the other one
    /// is still recoverable from the repository history.
    pub conflicts: Vec<String>,
    pub commit: Option<String>,
    pub at: i64,
}

async fn run_sync(app: &AppHandle) -> Result<SyncReport> {
    let credentials = current_credentials().await?;
    let token = credentials.access_token.clone();
    let mut state = read_state(app)?;

    // Authorising the app and installing it are separate steps, and a token
    // from an uninstalled app reaches no repository at all. Say so plainly
    // instead of letting it surface as a confusing 404 later. A pasted
    // personal access token has no installation, so this does not apply.
    if credentials.via_device_flow && github::installations(&token).await?.is_empty() {
        return Err(format!(
            "Unusual is authorised but not installed on your account yet. \
             Install it at {} and allow it to create its own repository.",
            install_url()
        ));
    }

    // Resolve (or create) the repository on first use.
    let account = github::account(&token).await?;
    let repo_name = state
        .repo
        .clone()
        .unwrap_or_else(|| format!("{}/{}", account.login, DEFAULT_REPO));

    let repo = match github::get_repo(&token, &repo_name).await? {
        Some(repo) => repo,
        None => github::create_repo(&token, DEFAULT_REPO).await.map_err(|e| {
            format!(
                "{e}\n\nCould not create {repo_name}. Either give the app the \
                 \"Repository creation\" permission, or create the repository \
                 yourself and grant the app access to it at {}.",
                install_url()
            )
        })?,
    };
    let branch = repo.default_branch.clone();
    state.repo = Some(repo.full_name.clone());
    state.branch = Some(branch.clone());

    // The Git Data API refuses to write objects into a repository with no
    // commits, so give it one before anything else touches it.
    let mut head = github::head_commit(&token, &repo.full_name, &branch).await?;
    if head.is_none() {
        github::bootstrap(&token, &repo.full_name, &branch)
            .await
            .map_err(|e| format!("{e} [initialising the repository]"))?;
        head = github::head_commit(&token, &repo.full_name, &branch).await?;
    }

    let remote_all = match &head {
        Some(head) => github::tree_of_commit(&token, &repo.full_name, head).await?,
        None => BTreeMap::new(),
    };
    // Files the app does not manage - a README, a LICENSE, anything added by
    // hand - are carried into the new commit untouched rather than merged
    // into the data folder or deleted.
    let (remote, carried): (BTreeMap<String, String>, BTreeMap<String, String>) =
        remote_all
            .clone()
            .into_iter()
            .partition(|(path, _)| is_synced_path(path));
    let local = local_snapshot(app)?;
    let base = state.base.clone();

    let mut tree: BTreeMap<String, Resolution> = BTreeMap::new();
    let mut to_write: Vec<(String, Vec<u8>)> = Vec::new();
    let mut to_delete: Vec<String> = Vec::new();
    let mut conflicts: Vec<String> = Vec::new();

    let paths: BTreeSet<&String> = base
        .keys()
        .chain(local.keys())
        .chain(remote.keys())
        .collect();

    for path in paths {
        let base_sha = base.get(path);
        let remote_sha = remote.get(path);
        let local_bytes = local.get(path);
        let local_sha = local_bytes.map(|b| blob_sha(b));

        let local_changed = local_sha.as_ref() != base_sha;
        let remote_changed = remote_sha != base_sha;

        match (local_changed, remote_changed) {
            // Untouched since the last sync.
            (false, false) => {
                if let Some(sha) = remote_sha {
                    tree.insert(path.clone(), Resolution::Remote(sha.clone()));
                }
            }
            // Only this device moved: push it (or push the deletion by
            // leaving the path out of the tree).
            (true, false) => {
                if let Some(bytes) = local_bytes {
                    tree.insert(path.clone(), Resolution::Upload(bytes.clone()));
                }
            }
            // Only the remote moved: take it.
            (false, true) => match remote_sha {
                Some(sha) => {
                    let bytes = github::read_blob(&token, &repo.full_name, sha).await?;
                    to_write.push((path.clone(), bytes));
                    tree.insert(path.clone(), Resolution::Remote(sha.clone()));
                }
                None => to_delete.push(path.clone()),
            },
            // Both moved.
            (true, true) => {
                let same = local_sha.as_ref() == remote_sha;
                if same {
                    if let Some(sha) = remote_sha {
                        tree.insert(path.clone(), Resolution::Remote(sha.clone()));
                    }
                    continue;
                }

                match (local_bytes, remote_sha) {
                    (Some(local_bytes), Some(remote_sha)) => {
                        let remote_bytes =
                            github::read_blob(&token, &repo.full_name, remote_sha).await?;

                        // Item lists merge properly; nothing is dropped.
                        let merged = if path.ends_with("/meta.json") {
                            let base_bytes = match base_sha {
                                Some(sha) => {
                                    github::read_blob(&token, &repo.full_name, sha).await.ok()
                                }
                                None => None,
                            };
                            merge_meta(base_bytes.as_deref(), local_bytes, &remote_bytes)
                        } else {
                            None
                        };

                        if let Some(merged) = merged {
                            to_write.push((path.clone(), merged.clone()));
                            tree.insert(path.clone(), Resolution::Upload(merged));
                        } else if path == "config.json" && base_sha.is_none() {
                            // First sync on this device: the local file is
                            // almost certainly the untouched default, so the
                            // settings already in the repo win.
                            to_write.push((path.clone(), remote_bytes));
                            tree.insert(path.clone(), Resolution::Remote(remote_sha.clone()));
                        } else {
                            // Keep what is in front of the user. The other
                            // version stays in the repository history.
                            conflicts.push(path.clone());
                            tree.insert(path.clone(), Resolution::Upload(local_bytes.clone()));
                        }
                    }
                    // Deleted here, edited there: keep the edit rather than
                    // destroy work done on another device.
                    (None, Some(remote_sha)) => {
                        let bytes = github::read_blob(&token, &repo.full_name, remote_sha).await?;
                        to_write.push((path.clone(), bytes));
                        tree.insert(path.clone(), Resolution::Remote(remote_sha.clone()));
                        conflicts.push(path.clone());
                    }
                    // Deleted there, edited here: keep the edit.
                    (Some(local_bytes), None) => {
                        tree.insert(path.clone(), Resolution::Upload(local_bytes.clone()));
                        conflicts.push(path.clone());
                    }
                    (None, None) => {}
                }
            }
        }
    }

    // Apply the remote side locally first: pulling is idempotent, so a
    // failure further down costs nothing.
    let pulled = to_write.len();
    let removed = to_delete.len();
    for (path, bytes) in &to_write {
        write_local(app, path, bytes)?;
    }
    for path in &to_delete {
        delete_local(app, path)?;
    }

    // Upload whatever the remote does not have yet.
    let mut final_tree: BTreeMap<String, String> = carried;
    let mut pushed = 0usize;
    for (path, resolution) in tree {
        match resolution {
            Resolution::Remote(sha) => {
                final_tree.insert(path, sha);
            }
            Resolution::Upload(bytes) => {
                let sha = blob_sha(&bytes);
                // The blob may already exist from an earlier commit.
                if remote.get(&path) != Some(&sha) {
                    pushed += 1;
                }
                let uploaded = github::write_blob(&token, &repo.full_name, &bytes)
                    .await
                    .map_err(|e| format!("{e} [uploading {path}]"))?;
                final_tree.insert(path, uploaded);
            }
        }
    }

    let mut commit_sha = None;
    // Never commit an empty tree: that would be a snapshot that wipes the
    // repository, and at this point it means the data folder was unreadable
    // rather than genuinely emptied.
    if final_tree != remote_all && !final_tree.is_empty() {
        let device = std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_else(|_| "a device".into());
        let message = format!("Sync from {device}");
        let tree_sha = github::write_tree(&token, &repo.full_name, &final_tree)
            .await
            .map_err(|e| format!("{e} [building the file tree]"))?;
        let sha = github::commit(
            &token,
            &repo.full_name,
            &message,
            &tree_sha,
            head.as_deref(),
        )
        .await
        .map_err(|e| format!("{e} [creating the commit]"))?;
        match &head {
            Some(_) => github::move_branch(&token, &repo.full_name, &branch, &sha)
                .await
                .map_err(|e| format!("{e} [moving the branch]"))?,
            None => github::create_branch(&token, &repo.full_name, &branch, &sha)
                .await
                .map_err(|e| format!("{e} [creating the branch]"))?,
        }
        commit_sha = Some(sha);
    }

    state.base = final_tree;
    state.last_commit = commit_sha.clone().or(head);
    state.last_sync = Some(now_secs());
    write_state(app, &state)?;

    Ok(SyncReport {
        repo: repo.full_name,
        pulled,
        pushed,
        removed,
        conflicts,
        commit: commit_sha,
        at: state.last_sync.unwrap_or_else(now_secs),
    })
}

// -------------------------------------------------------------------- commands

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub connected: bool,
    /// Authorised but not installed anywhere: the token works, yet it can
    /// reach no repository. The UI offers the install link for this.
    pub installed: bool,
    pub login: Option<String>,
    pub repo: Option<String>,
    pub last_sync: Option<i64>,
    /// False when no client id was built in, in which case the UI offers
    /// the personal access token field instead.
    pub can_use_device_flow: bool,
    pub install_url: String,
}

#[tauri::command]
pub async fn sync_status(app: AppHandle) -> Result<SyncStatus> {
    let state = read_state(&app)?;
    let credentials = read_credentials()?;

    let mut login = None;
    // Nothing to install unless an app issued the token, so default to true
    // and let the device-flow case prove otherwise.
    let mut installed = true;
    if credentials.is_some() {
        if let Ok(current) = current_credentials().await {
            login = github::account(&current.access_token).await.ok().map(|a| a.login);
            if current.via_device_flow {
                installed = github::installations(&current.access_token)
                    .await
                    .map(|list| !list.is_empty())
                    .unwrap_or(false);
            }
        }
    }

    Ok(SyncStatus {
        connected: credentials.is_some(),
        installed,
        login,
        repo: state.repo,
        last_sync: state.last_sync,
        can_use_device_flow: !CLIENT_ID.is_empty(),
        install_url: install_url(),
    })
}

#[tauri::command]
pub async fn sync_connect_start() -> Result<github::DeviceCode> {
    if CLIENT_ID.is_empty() {
        return Err("this build has no GitHub client id - paste a token instead".into());
    }
    github::device_start(CLIENT_ID, SCOPE).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollResult {
    pub status: String,
    pub login: Option<String>,
    pub message: Option<String>,
}

#[tauri::command]
pub async fn sync_connect_poll(device_code: String) -> Result<PollResult> {
    let outcome = github::device_poll(CLIENT_ID, &device_code).await?;
    Ok(match outcome {
        github::PollOutcome::Pending => PollResult {
            status: "pending".into(),
            login: None,
            message: None,
        },
        github::PollOutcome::SlowDown => PollResult {
            status: "slowDown".into(),
            login: None,
            message: None,
        },
        github::PollOutcome::Denied(message) => PollResult {
            status: "denied".into(),
            login: None,
            message: Some(message),
        },
        github::PollOutcome::Granted(credentials) => {
            let account = github::account(&credentials.access_token).await?;
            save_credentials(&credentials)?;
            PollResult {
                status: "granted".into(),
                login: Some(account.login),
                message: None,
            }
        }
    })
}

/// Fallback for builds without a client id, and for anyone who would rather
/// hand over a scoped personal access token than authorise an app.
#[tauri::command]
pub async fn sync_connect_token(token: String) -> Result<String> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("the token is empty".into());
    }
    let account = github::account(&token).await?;
    save_credentials(&github::Credentials {
        access_token: token,
        refresh_token: None,
        expires_at: None,
        via_device_flow: false,
    })?;
    Ok(account.login)
}

#[tauri::command]
pub async fn sync_disconnect(app: AppHandle) -> Result<()> {
    forget_credentials()?;
    // Keep the repo name but drop the merge base, so reconnecting re-reads
    // the remote from scratch instead of trusting a stale snapshot.
    let mut state = read_state(&app)?;
    state.base.clear();
    state.last_commit = None;
    write_state(&app, &state)
}

#[tauri::command]
pub async fn sync_now(app: AppHandle) -> Result<SyncReport> {
    static RUNNING: std::sync::Mutex<bool> = std::sync::Mutex::new(false);

    {
        let mut running = RUNNING.lock().map_err(|_| "sync state is poisoned")?;
        if *running {
            return Err("a sync is already running".into());
        }
        *running = true;
    }

    let result = match run_sync(&app).await {
        // Another device pushed between reading HEAD and moving the branch.
        // Everything is re-read, so one clean retry resolves it.
        Err(message) if message.contains("422") || message.contains("fast forward") => {
            run_sync(&app).await
        }
        other => other,
    };

    if let Ok(mut running) = RUNNING.lock() {
        *running = false;
    }
    result
}
