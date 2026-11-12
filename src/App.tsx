import { getVersion } from '@tauri-apps/api/app'
import { LayoutGrid } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmModal, PromptModal } from './components/Modal'
import { ProjectView } from './components/ProjectView'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { checkCalendarReminders } from './lib/notifications'
import * as store from './lib/store'
import * as sync from './lib/sync'
import type { AppConfig, ItemType, Project, ProjectItem } from './types'
import { CalendarView } from './views/CalendarView'
import { KanbanView } from './views/KanbanView'
import { MarkdownView } from './views/MarkdownView'
import { WhiteboardView } from './views/WhiteboardView'

const REMINDER_CHECK_INTERVAL_MS = 30 * 60 * 1000
/** Long enough that a burst of edits becomes one commit, short enough
 *  that closing the laptop rarely loses a round trip. */
const AUTOSYNC_DEBOUNCE_MS = 8 * 1000
const AUTOSYNC_INTERVAL_MS = 10 * 60 * 1000
/** The editors autosave 500ms after the last keystroke, so Ctrl+S waits for
 *  that write to land before pushing. */
const SAVE_FLUSH_MS = 700

type ModalState =
  | { kind: 'none' }
  | { kind: 'new-project' }
  | { kind: 'rename-project'; project: Project }
  | { kind: 'delete-project'; project: Project }
  | { kind: 'rename-item'; item: ProjectItem }
  | { kind: 'delete-item'; item: ProjectItem }

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [items, setItems] = useState<ProjectItem[]>([])
  const [openItem, setOpenItem] = useState<ProjectItem | null>(null)
  const [modal, setModal] = useState<ModalState>({ kind: 'none' })
  const [config, setConfig] = useState<AppConfig>(store.DEFAULT_CONFIG)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [dataVersion, setDataVersion] = useState(0)
  const [version, setVersion] = useState('')

  useEffect(() => {
    Promise.all([store.listProjects(), store.loadConfig(), getVersion()]).then(
      ([list, loadedConfig, appVersion]) => {
        setProjects(list)
        setConfig(loadedConfig)
        setVersion(appVersion)
        if (list.length > 0) setSelectedProjectId(list[0].id)
        setReady(true)
      },
    )
  }, [])

  /** Re-reads everything after a sync pulled changes from another device. */
  const reloadFromDisk = useCallback(async () => {
    const [list, loadedConfig] = await Promise.all([store.listProjects(), store.loadConfig()])
    setProjects(list)
    setConfig(loadedConfig)
    setSelectedProjectId((current) =>
      current && list.some((p) => p.id === current) ? current : (list[0]?.id ?? null),
    )
    setDataVersion((version) => version + 1)
  }, [])

  const syncRunning = useRef(false)

  const runSync = useCallback(async () => {
    if (syncRunning.current) return
    syncRunning.current = true
    try {
      const status = await sync.getStatus()
      if (!status.connected) return
      const report = await sync.syncNow()
      if (report.pulled > 0 || report.removed > 0) await reloadFromDisk()
    } catch {
      // Offline, rate limited, or mid-reconnect. Settings shows the reason.
    } finally {
      syncRunning.current = false
    }
  }, [reloadFromDisk])

  // Pull on open, push after edits settle, and check again periodically so a
  // second device shows up without restarting the app.
  useEffect(() => {
    if (!ready) return

    let debounce: ReturnType<typeof setTimeout> | undefined

    void runSync()
    const interval = setInterval(runSync, AUTOSYNC_INTERVAL_MS)
    const unsubscribe = store.onDataChanged(() => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(runSync, AUTOSYNC_DEBOUNCE_MS)
    })

    return () => {
      clearInterval(interval)
      unsubscribe()
      if (debounce) clearTimeout(debounce)
    }
  }, [ready, runSync])

  // Ctrl+S pushes straight away instead of waiting out the debounce.
  useEffect(() => {
    if (!ready) return

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      setTimeout(() => void runSync(), SAVE_FLUSH_MS)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [ready, runSync])

  // Refresh the item list after a pull without disturbing an open editor.
  useEffect(() => {
    if (dataVersion === 0 || !selectedProjectId) return
    store.listItems(selectedProjectId).then(setItems)
  }, [dataVersion, selectedProjectId])

  const handleSaveConfig = async (next: AppConfig) => {
    await store.saveConfig(next)
    setConfig(next)
  }

  useEffect(() => {
    checkCalendarReminders()
    const interval = setInterval(checkCalendarReminders, REMINDER_CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!selectedProjectId) {
      setItems([])
      return
    }
    store.listItems(selectedProjectId).then(setItems)
    setOpenItem(null)
  }, [selectedProjectId])

  const refreshItems = async (projectId: string) => {
    setItems(await store.listItems(projectId))
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null

  const handleCreateProject = async (name: string) => {
    const project = await store.createProject(name)
    setProjects((prev) => [...prev, project])
    setSelectedProjectId(project.id)
    setModal({ kind: 'none' })
  }

  const handleRenameProject = async (name: string) => {
    if (modal.kind !== 'rename-project') return
    await store.renameProject(modal.project.id, name)
    setProjects((prev) =>
      prev.map((p) => (p.id === modal.project.id ? { ...p, name } : p)),
    )
    setModal({ kind: 'none' })
  }

  const handleDeleteProject = async () => {
    if (modal.kind !== 'delete-project') return
    const id = modal.project.id
    await store.deleteProject(id)
    setProjects((prev) => prev.filter((p) => p.id !== id))
    if (selectedProjectId === id) {
      const remaining = projects.filter((p) => p.id !== id)
      setSelectedProjectId(remaining[0]?.id ?? null)
    }
    setModal({ kind: 'none' })
  }

  const handleCreateItem = async (type: ItemType) => {
    if (!selectedProjectId) return
    const labels: Record<ItemType, string> = {
      whiteboard: 'New whiteboard',
      kanban: 'New board',
      markdown: 'New note',
      calendar: 'New calendar',
    }
    const item = await store.createItem(selectedProjectId, labels[type], type)
    await refreshItems(selectedProjectId)
    setOpenItem(item)
  }

  const handleDeleteItem = async () => {
    if (modal.kind !== 'delete-item' || !selectedProjectId) return
    await store.deleteItem(selectedProjectId, modal.item.id)
    if (openItem?.id === modal.item.id) setOpenItem(null)
    await refreshItems(selectedProjectId)
    setModal({ kind: 'none' })
  }

  const handleRenameItem = async (name: string) => {
    if (modal.kind !== 'rename-item' || !selectedProjectId) return
    await store.renameItem(selectedProjectId, modal.item.id, name)
    if (openItem?.id === modal.item.id) setOpenItem({ ...openItem, name })
    await refreshItems(selectedProjectId)
    setModal({ kind: 'none' })
  }

  const handleItemRenamedInline = async (name: string) => {
    if (!openItem || !selectedProjectId) return
    setOpenItem({ ...openItem, name })
    await refreshItems(selectedProjectId)
  }

  if (!ready) return null

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100">
      <Sidebar
        projects={projects}
        selectedId={selectedProjectId}
        version={version}
        onSelect={(id) => setSelectedProjectId(id)}
        onCreate={() => setModal({ kind: 'new-project' })}
        onRename={(id) => {
          const project = projects.find((p) => p.id === id)
          if (project) setModal({ kind: 'rename-project', project })
        }}
        onDelete={(id) => {
          const project = projects.find((p) => p.id === id)
          if (project) setModal({ kind: 'delete-project', project })
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {!selectedProject ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-zinc-600">
            <LayoutGrid size={28} className="mb-3 opacity-50" />
            <p className="text-sm">Create a project to get started</p>
          </div>
        ) : openItem ? (
          openItem.type === 'whiteboard' ? (
            <WhiteboardView
              projectId={selectedProject.id}
              item={openItem}
              onBack={() => setOpenItem(null)}
              onRenamed={handleItemRenamedInline}
            />
          ) : openItem.type === 'kanban' ? (
            <KanbanView
              projectId={selectedProject.id}
              item={openItem}
              priorities={config.priorities}
              onBack={() => setOpenItem(null)}
              onRenamed={handleItemRenamedInline}
            />
          ) : openItem.type === 'calendar' ? (
            <CalendarView
              projectId={selectedProject.id}
              item={openItem}
              onBack={() => setOpenItem(null)}
              onRenamed={handleItemRenamedInline}
            />
          ) : (
            <MarkdownView
              projectId={selectedProject.id}
              item={openItem}
              shortcuts={config.markdownShortcuts}
              onBack={() => setOpenItem(null)}
              onRenamed={handleItemRenamedInline}
            />
          )
        ) : (
          <ProjectView
            project={selectedProject}
            items={items}
            onOpenItem={setOpenItem}
            onCreateItem={handleCreateItem}
            onRenameItem={(item) => setModal({ kind: 'rename-item', item })}
            onDeleteItem={(item) => setModal({ kind: 'delete-item', item })}
          />
        )}
      </main>

      {modal.kind === 'new-project' && (
        <PromptModal
          title="New project"
          label="Project name"
          confirmLabel="Create"
          onConfirm={handleCreateProject}
          onCancel={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'rename-project' && (
        <PromptModal
          title="Rename project"
          defaultValue={modal.project.name}
          confirmLabel="Save"
          onConfirm={handleRenameProject}
          onCancel={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'delete-project' && (
        <ConfirmModal
          title={`Delete "${modal.project.name}"`}
          description="All whiteboards, boards, and notes inside this project will be deleted. This action cannot be undone."
          onConfirm={handleDeleteProject}
          onCancel={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'rename-item' && (
        <PromptModal
          title="Rename"
          defaultValue={modal.item.name}
          confirmLabel="Save"
          onConfirm={handleRenameItem}
          onCancel={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'delete-item' && (
        <ConfirmModal
          title={`Delete "${modal.item.name}"`}
          description="This action cannot be undone."
          onConfirm={handleDeleteItem}
          onCancel={() => setModal({ kind: 'none' })}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          config={config}
          onSave={handleSaveConfig}
          onSynced={reloadFromDisk}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
