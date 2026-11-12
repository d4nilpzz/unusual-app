//! Minimal GitHub REST client: OAuth device flow + Git Data API.
//!
//! Everything here runs in the Rust process so the access token never
//! reaches the webview.

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const API: &str = "https://api.github.com";
const UA: &str = "unusual-app";
const ACCEPT: &str = "application/vnd.github+json";

pub type Result<T> = std::result::Result<T, String>;

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(UA)
        .build()
        .expect("failed to build http client")
}

async fn read_error(res: reqwest::Response) -> String {
    let status = res.status();
    let body = res.text().await.unwrap_or_default();

    #[derive(Deserialize)]
    struct ApiError {
        message: Option<String>,
    }

    let message = serde_json::from_str::<ApiError>(&body)
        .ok()
        .and_then(|e| e.message)
        .unwrap_or_else(|| body.chars().take(200).collect());
    format!("GitHub {}: {}", status.as_u16(), message)
}

// ---------------------------------------------------------------- device flow

#[derive(Serialize, Deserialize, Clone)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

pub async fn device_start(client_id: &str, scope: &str) -> Result<DeviceCode> {
    let res = http()
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", client_id), ("scope", scope)])
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    res.json::<DeviceCode>()
        .await
        .map_err(|e| format!("unexpected response from GitHub: {e}"))
}

/// A token plus, when the OAuth app expires tokens, what it takes to renew it.
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Credentials {
    pub access_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    /// Unix seconds. `None` means the app does not expire tokens.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    /// True for tokens issued by the device flow, which belong to an app
    /// installation. A pasted personal access token has none, so checks
    /// about installations do not apply to it.
    #[serde(default)]
    pub via_device_flow: bool,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
    error: Option<String>,
    error_description: Option<String>,
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

impl TokenResponse {
    fn into_credentials(self) -> Option<Credentials> {
        let access_token = self.access_token?;
        Some(Credentials {
            access_token,
            refresh_token: self.refresh_token,
            // Renew a minute early so a sync never starts with a token that
            // expires mid-request.
            expires_at: self.expires_in.map(|secs| now_secs() + secs - 60),
            via_device_flow: true,
        })
    }
}

/// One poll tick. `Pending` means "keep polling"; `SlowDown` means
/// "keep polling, but add a second to the interval".
pub enum PollOutcome {
    Pending,
    SlowDown,
    Granted(Credentials),
    Denied(String),
}

pub async fn device_poll(client_id: &str, device_code: &str) -> Result<PollOutcome> {
    let res = http()
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    let body = res
        .json::<TokenResponse>()
        .await
        .map_err(|e| format!("unexpected response from GitHub: {e}"))?;

    let error = body.error.clone().unwrap_or_default();
    let description = body.error_description.clone();

    if let Some(credentials) = body.into_credentials() {
        return Ok(PollOutcome::Granted(credentials));
    }

    Ok(match error.as_str() {
        "authorization_pending" => PollOutcome::Pending,
        "slow_down" => PollOutcome::SlowDown,
        "expired_token" => PollOutcome::Denied(
            "the code expired before it was approved - start again".into(),
        ),
        "access_denied" => PollOutcome::Denied("access was denied on GitHub".into()),
        other => PollOutcome::Denied(description.unwrap_or_else(|| other.to_string())),
    })
}

/// Device-flow tokens refresh with the client id alone - no client secret,
/// which is what makes token expiry usable in a desktop app at all.
/// Refresh tokens rotate, so the new pair replaces the old one entirely.
pub async fn refresh(client_id: &str, refresh_token: &str) -> Result<Credentials> {
    let res = http()
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id),
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    let body = res
        .json::<TokenResponse>()
        .await
        .map_err(|e| format!("unexpected response from GitHub: {e}"))?;

    let error = body.error.clone().unwrap_or_default();
    let description = body.error_description.clone();

    body.into_credentials().ok_or_else(|| match error.as_str() {
        "bad_refresh_token" => "the GitHub session expired - connect again".to_string(),
        other => description.unwrap_or_else(|| other.to_string()),
    })
}

// ------------------------------------------------------------------- the user

#[derive(Serialize, Deserialize, Clone)]
pub struct Account {
    pub login: String,
}

pub async fn account(token: &str) -> Result<Account> {
    let res = http()
        .get(format!("{API}/user"))
        .header("Accept", ACCEPT)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    res.json::<Account>()
        .await
        .map_err(|e| format!("unexpected response from GitHub: {e}"))
}

/// Where the app has been installed. A user can authorise the app without
/// installing it, and that token reaches no repository at all - so an empty
/// list is the difference between "not connected" and "connected but blind".
pub async fn installations(token: &str) -> Result<Vec<String>> {
    #[derive(Deserialize)]
    struct Account {
        login: Option<String>,
    }
    #[derive(Deserialize)]
    struct Installation {
        account: Option<Account>,
    }
    #[derive(Deserialize)]
    struct Installations {
        installations: Vec<Installation>,
    }

    let res = http()
        .get(format!("{API}/user/installations"))
        .header("Accept", ACCEPT)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    let body = res
        .json::<Installations>()
        .await
        .map_err(|e| format!("unexpected response from GitHub: {e}"))?;

    Ok(body
        .installations
        .into_iter()
        .filter_map(|i| i.account.and_then(|a| a.login))
        .collect())
}

// ----------------------------------------------------------------- repository

#[derive(Deserialize)]
pub struct Repo {
    pub full_name: String,
    pub default_branch: String,
}

pub async fn get_repo(token: &str, full_name: &str) -> Result<Option<Repo>> {
    let res = http()
        .get(format!("{API}/repos/{full_name}"))
        .header("Accept", ACCEPT)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    res.json::<Repo>()
        .await
        .map(Some)
        .map_err(|e| format!("unexpected response from GitHub: {e}"))
}

/// Creates a private repo with an initial commit, so the branch ref always
/// exists and the sync never has to special-case an empty repository.
pub async fn create_repo(token: &str, name: &str) -> Result<Repo> {
    let res = http()
        .post(format!("{API}/user/repos"))
        .header("Accept", ACCEPT)
        .bearer_auth(token)
        .json(&serde_json::json!({
            "name": name,
            "private": true,
            "auto_init": true,
            "description": "Unusual app data - synced automatically.",
        }))
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    res.json::<Repo>()
        .await
        .map_err(|e| format!("unexpected response from GitHub: {e}"))
}

// --------------------------------------------------------------- git data api

/// `None` when the repository has no commits yet - a repo created by hand
/// without a README has no branch at all, and asking for its head is a 409
/// rather than a 404.
pub async fn head_commit(token: &str, repo: &str, branch: &str) -> Result<Option<String>> {
    #[derive(Deserialize)]
    struct RefObject {
        sha: String,
    }
    #[derive(Deserialize)]
    struct GitRef {
        object: RefObject,
    }

    let res = http()
        .get(format!("{API}/repos/{repo}/git/ref/heads/{branch}"))
        .header("Accept", ACCEPT)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    if res.status() == reqwest::StatusCode::CONFLICT
        || res.status() == reqwest::StatusCode::NOT_FOUND
    {
        return Ok(None);
    }
    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    res.json::<GitRef>()
        .await
        .map(|r| Some(r.object.sha))
        .map_err(|e| format!("unexpected response from GitHub: {e}"))
}

/// Every blob in a commit's tree, as `path -> blob sha`.
pub async fn tree_of_commit(
    token: &str,
    repo: &str,
    commit: &str,
) -> Result<BTreeMap<String, String>> {
    #[derive(Deserialize)]
    struct TreeRef {
        sha: String,
    }
    #[derive(Deserialize)]
    struct Commit {
        tree: TreeRef,
    }
    #[derive(Deserialize)]
    struct Entry {
        path: String,
        #[serde(rename = "type")]
        kind: String,
        sha: String,
    }
    #[derive(Deserialize)]
    struct Tree {
        tree: Vec<Entry>,
        #[serde(default)]
        truncated: bool,
    }

    let res = http()
        .get(format!("{API}/repos/{repo}/git/commits/{commit}"))
        .header("Accept", ACCEPT)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;
    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    let commit = res
        .json::<Commit>()
        .await
        .map_err(|e| format!("unexpected response from GitHub: {e}"))?;

    let res = http()
        .get(format!(
            "{API}/repos/{repo}/git/trees/{}?recursive=1",
            commit.tree.sha
        ))
        .header("Accept", ACCEPT)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;
    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    let tree = res
        .json::<Tree>()
        .await
        .map_err(|e| format!("unexpected response from GitHub: {e}"))?;

    if tree.truncated {
        return Err("this repository has too many files to sync in one request".into());
    }

    Ok(tree
        .tree
        .into_iter()
        .filter(|e| e.kind == "blob")
        .map(|e| (e.path, e.sha))
        .collect())
}

pub async fn read_blob(token: &str, repo: &str, sha: &str) -> Result<Vec<u8>> {
    #[derive(Deserialize)]
    struct Blob {
        content: String,
        encoding: String,
    }

    let res = http()
        .get(format!("{API}/repos/{repo}/git/blobs/{sha}"))
        .header("Accept", ACCEPT)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;
    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    let blob = res
        .json::<Blob>()
        .await
        .map_err(|e| format!("unexpected response from GitHub: {e}"))?;

    if blob.encoding != "base64" {
        return Err(format!("unsupported blob encoding: {}", blob.encoding));
    }
    let cleaned: String = blob.content.chars().filter(|c| !c.is_whitespace()).collect();
    base64::engine::general_purpose::STANDARD
        .decode(cleaned)
        .map_err(|e| format!("corrupt blob: {e}"))
}

pub async fn write_blob(token: &str, repo: &str, content: &[u8]) -> Result<String> {
    #[derive(Deserialize)]
    struct Created {
        sha: String,
    }

    let res = http()
        .post(format!("{API}/repos/{repo}/git/blobs"))
        .header("Accept", ACCEPT)
        .bearer_auth(token)
        .json(&serde_json::json!({
            "content": base64::engine::general_purpose::STANDARD.encode(content),
            "encoding": "base64",
        }))
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;
    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    res.json::<Created>()
        .await
        .map(|c| c.sha)
        .map_err(|e| format!("unexpected response from GitHub: {e}"))
}

/// Writes a whole tree at once. Listing every path (rather than layering onto
/// `base_tree`) means deletions need no special handling.
pub async fn write_tree(
    token: &str,
    repo: &str,
    files: &BTreeMap<String, String>,
) -> Result<String> {
    #[derive(Deserialize)]
    struct Created {
        sha: String,
    }

    let entries: Vec<_> = files
        .iter()
        .map(|(path, sha)| {
            serde_json::json!({
                "path": path,
                "mode": "100644",
                "type": "blob",
                "sha": sha,
            })
        })
        .collect();

    let res = http()
        .post(format!("{API}/repos/{repo}/git/trees"))
        .header("Accept", ACCEPT)
        .bearer_auth(token)
        .json(&serde_json::json!({ "tree": entries }))
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;
    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    res.json::<Created>()
        .await
        .map(|c| c.sha)
        .map_err(|e| format!("unexpected response from GitHub: {e}"))
}

/// `parent` is `None` for the very first commit in an empty repository.
pub async fn commit(
    token: &str,
    repo: &str,
    message: &str,
    tree: &str,
    parent: Option<&str>,
) -> Result<String> {
    #[derive(Deserialize)]
    struct Created {
        sha: String,
    }

    let parents: Vec<&str> = parent.into_iter().collect();

    // GitHub only counts a commit towards your contribution graph when the
    // author's email is one verified on your account. Signing sync commits
    // with an address that is deliberately not yours keeps a year of
    // automated backups out of the graph, while the history stays intact.
    let author = serde_json::json!({
        "name": "Unusual",
        "email": "sync@unusual.local",
    });

    let res = http()
        .post(format!("{API}/repos/{repo}/git/commits"))
        .header("Accept", ACCEPT)
        .bearer_auth(token)
        .json(&serde_json::json!({
            "message": message,
            "tree": tree,
            "parents": parents,
            "author": author,
            "committer": author,
        }))
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;
    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    res.json::<Created>()
        .await
        .map(|c| c.sha)
        .map_err(|e| format!("unexpected response from GitHub: {e}"))
}

/// Gives a brand-new repository its first commit.
///
/// The Git Data API refuses to write blobs or trees into a repository with
/// no commits ("Git Repository is empty"), so the only way in is the
/// Contents API, which can create a file and the branch in one call.
pub async fn bootstrap(token: &str, repo: &str, branch: &str) -> Result<()> {
    const README: &str = "# Unusual data\n\n\
        This repository is managed by the Unusual app. It holds your projects,\n\
        boards, notes and calendars as plain files, one commit per sync.\n\n\
        Editing these files here is fine - the app merges your changes back in.\n";

    let res = http()
        .put(format!("{API}/repos/{repo}/contents/README.md"))
        .header("Accept", ACCEPT)
        .bearer_auth(token)
        .json(&serde_json::json!({
            "message": "Initial commit",
            "content": base64::engine::general_purpose::STANDARD.encode(README),
            "branch": branch,
        }))
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    Ok(())
}

/// Creates the branch itself, for a repository that had no commits.
pub async fn create_branch(token: &str, repo: &str, branch: &str, commit: &str) -> Result<()> {
    let res = http()
        .post(format!("{API}/repos/{repo}/git/refs"))
        .header("Accept", ACCEPT)
        .bearer_auth(token)
        .json(&serde_json::json!({
            "ref": format!("refs/heads/{branch}"),
            "sha": commit,
        }))
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;
    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    Ok(())
}

/// Fast-forward only: if another device pushed since we read HEAD, this fails
/// and the caller re-runs the whole sync against the new HEAD.
pub async fn move_branch(token: &str, repo: &str, branch: &str, commit: &str) -> Result<()> {
    let res = http()
        .patch(format!("{API}/repos/{repo}/git/refs/heads/{branch}"))
        .header("Accept", ACCEPT)
        .bearer_auth(token)
        .json(&serde_json::json!({ "sha": commit, "force": false }))
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;
    if !res.status().is_success() {
        return Err(read_error(res).await);
    }
    Ok(())
}
