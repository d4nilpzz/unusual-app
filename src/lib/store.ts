import { appDataDir, join } from '@tauri-apps/api/path'
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from '@tauri-apps/plugin-fs'
import type {
  AppConfig,
  CalendarData,
  ItemType,
  KanbanData,
  Project,
  ProjectItem,
} from '../types'

let rootDirCache: string | null = null

async function rootDir(): Promise<string> {
  if (rootDirCache) return rootDirCache
  const base = await appDataDir()
  const dir = await join(base, 'projects')
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true })
  }
  rootDirCache = dir
  return dir
}

async function projectDir(projectId: string): Promise<string> {
  const root = await rootDir()
  return join(root, projectId)
}

async function itemsDir(projectId: string): Promise<string> {
  return join(await projectDir(projectId), 'items')
}

async function metaPath(projectId: string): Promise<string> {
  return join(await projectDir(projectId), 'meta.json')
}

function newId(): string {
  return crypto.randomUUID()
}

interface ProjectMeta {
  id: string
  name: string
  createdAt: number
  items: ProjectItem[]
}

async function readMeta(projectId: string): Promise<ProjectMeta> {
  const path = await metaPath(projectId)
  const raw = await readTextFile(path)
  return JSON.parse(raw) as ProjectMeta
}

async function writeMeta(meta: ProjectMeta): Promise<void> {
  const path = await metaPath(meta.id)
  await writeTextFile(path, JSON.stringify(meta, null, 2))
}

export async function listProjects(): Promise<Project[]> {
  const root = await rootDir()
  const entries = await readDir(root)
  const projects: Project[] = []
  for (const entry of entries) {
    if (!entry.isDirectory) continue
    try {
      const meta = await readMeta(entry.name!)
      projects.push({ id: meta.id, name: meta.name, createdAt: meta.createdAt })
    } catch {
      // skip malformed project folders
    }
  }
  projects.sort((a, b) => a.createdAt - b.createdAt)
  return projects
}

export async function createProject(name: string): Promise<Project> {
  const id = newId()
  const dir = await projectDir(id)
  await mkdir(dir, { recursive: true })
  await mkdir(await itemsDir(id), { recursive: true })
  const meta: ProjectMeta = { id, name, createdAt: Date.now(), items: [] }
  await writeMeta(meta)
  return { id, name, createdAt: meta.createdAt }
}

export async function renameProject(projectId: string, name: string): Promise<void> {
  const meta = await readMeta(projectId)
  meta.name = name
  await writeMeta(meta)
}

export async function deleteProject(projectId: string): Promise<void> {
  const dir = await projectDir(projectId)
  await remove(dir, { recursive: true })
}

export async function listItems(projectId: string): Promise<ProjectItem[]> {
  const meta = await readMeta(projectId)
  return meta.items.sort((a, b) => a.createdAt - b.createdAt)
}

async function itemFileName(item: Pick<ProjectItem, 'id' | 'type'>): Promise<string> {
  return item.type === 'markdown' ? `${item.id}.md` : `${item.id}.json`
}

const DEFAULT_KANBAN: KanbanData = {
  columns: [
    { id: 'todo', title: 'To do', cardIds: [] },
    { id: 'doing', title: 'In progress', cardIds: [] },
    { id: 'done', title: 'Done', cardIds: [] },
  ],
  cards: {},
}

export async function createItem(
  projectId: string,
  name: string,
  type: ItemType,
): Promise<ProjectItem> {
  const meta = await readMeta(projectId)
  const now = Date.now()
  const item: ProjectItem = { id: newId(), name, type, createdAt: now, updatedAt: now }
  meta.items.push(item)
  await writeMeta(meta)

  const dir = await itemsDir(projectId)
  await mkdir(dir, { recursive: true })
  const filePath = await join(dir, await itemFileName(item))
  if (type === 'markdown') {
    await writeTextFile(filePath, `# ${name}\n\n`)
  } else if (type === 'kanban') {
    await writeTextFile(filePath, JSON.stringify(DEFAULT_KANBAN, null, 2))
  } else if (type === 'calendar') {
    const empty: CalendarData = { events: [] }
    await writeTextFile(filePath, JSON.stringify(empty, null, 2))
  } else {
    await writeTextFile(filePath, JSON.stringify({}, null, 2))
  }
  return item
}

export async function renameItem(
  projectId: string,
  itemId: string,
  name: string,
): Promise<void> {
  const meta = await readMeta(projectId)
  const item = meta.items.find((i) => i.id === itemId)
  if (!item) return
  item.name = name
  item.updatedAt = Date.now()
  await writeMeta(meta)
}

export async function deleteItem(projectId: string, itemId: string): Promise<void> {
  const meta = await readMeta(projectId)
  const item = meta.items.find((i) => i.id === itemId)
  meta.items = meta.items.filter((i) => i.id !== itemId)
  await writeMeta(meta)
  if (item) {
    const dir = await itemsDir(projectId)
    const filePath = await join(dir, await itemFileName(item))
    if (await exists(filePath)) await remove(filePath)
  }
}

async function touchItem(projectId: string, itemId: string): Promise<void> {
  const meta = await readMeta(projectId)
  const item = meta.items.find((i) => i.id === itemId)
  if (!item) return
  item.updatedAt = Date.now()
  await writeMeta(meta)
}

export async function loadItemJson<T>(
  projectId: string,
  itemId: string,
  itemType: ItemType,
): Promise<T | null> {
  const dir = await itemsDir(projectId)
  const filePath = await join(dir, await itemFileName({ id: itemId, type: itemType }))
  if (!(await exists(filePath))) return null
  const raw = await readTextFile(filePath)
  return JSON.parse(raw) as T
}

export async function saveItemJson(
  projectId: string,
  itemId: string,
  itemType: ItemType,
  data: unknown,
): Promise<void> {
  const dir = await itemsDir(projectId)
  const filePath = await join(dir, await itemFileName({ id: itemId, type: itemType }))
  await writeTextFile(filePath, JSON.stringify(data, null, 2))
  await touchItem(projectId, itemId)
}

export interface CalendarEventRef {
  projectId: string
  itemId: string
  itemName: string
}

export async function listAllCalendarItems(): Promise<CalendarEventRef[]> {
  const projects = await listProjects()
  const refs: CalendarEventRef[] = []
  for (const project of projects) {
    const items = await listItems(project.id)
    for (const item of items) {
      if (item.type === 'calendar') {
        refs.push({ projectId: project.id, itemId: item.id, itemName: item.name })
      }
    }
  }
  return refs
}

export const DEFAULT_CONFIG: AppConfig = {
  priorities: [
    { id: 'low', label: 'Low', color: 'neutral' },
    { id: 'medium', label: 'Medium', color: 'yellow' },
    { id: 'high', label: 'High', color: 'red' },
  ],
  markdownShortcuts: {
    duplicateLine: 'ctrl+d',
    moveLineUp: 'shift+up',
    moveLineDown: 'shift+down',
    deleteLine: 'ctrl+shift+k',
    toggleBold: 'ctrl+b',
    toggleItalic: 'ctrl+i',
    toggleCode: 'ctrl+e',
    insertLink: 'ctrl+k',
    indent: 'tab',
    outdent: 'shift+tab',
    toggleBulletList: 'ctrl+shift+l',
    toggleTodoList: 'ctrl+shift+t',
  },
}

async function configPath(): Promise<string> {
  const base = await appDataDir()
  return join(base, 'config.json')
}

export async function loadConfig(): Promise<AppConfig> {
  const path = await configPath()
  if (!(await exists(path))) {
    await writeTextFile(path, JSON.stringify(DEFAULT_CONFIG, null, 2))
    return DEFAULT_CONFIG
  }
  const raw = await readTextFile(path)
  const parsed = JSON.parse(raw) as Partial<AppConfig>
  return {
    priorities: parsed.priorities ?? DEFAULT_CONFIG.priorities,
    markdownShortcuts: {
      ...DEFAULT_CONFIG.markdownShortcuts,
      ...parsed.markdownShortcuts,
    },
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const path = await configPath()
  await writeTextFile(path, JSON.stringify(config, null, 2))
}

export async function loadMarkdown(projectId: string, itemId: string): Promise<string> {
  const dir = await itemsDir(projectId)
  const filePath = await join(dir, `${itemId}.md`)
  if (!(await exists(filePath))) return ''
  return readTextFile(filePath)
}

export async function saveMarkdown(
  projectId: string,
  itemId: string,
  content: string,
): Promise<void> {
  const dir = await itemsDir(projectId)
  const filePath = await join(dir, `${itemId}.md`)
  await writeTextFile(filePath, content)
  await touchItem(projectId, itemId)
}
