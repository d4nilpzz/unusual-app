import { getVersion } from '@tauri-apps/api/app'
import { LayoutGrid } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ConfirmModal, PromptModal } from './components/Modal'
import { ProjectView } from './components/ProjectView'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import * as store from './lib/store'
import type { AppConfig, ItemType, Project, ProjectItem } from './types'
import { KanbanView } from './views/KanbanView'
import { MarkdownView } from './views/MarkdownView'
import { WhiteboardView } from './views/WhiteboardView'

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

  const handleSaveConfig = async (next: AppConfig) => {
    await store.saveConfig(next)
    setConfig(next)
  }

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
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
