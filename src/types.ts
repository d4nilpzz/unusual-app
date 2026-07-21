export type ItemType = 'whiteboard' | 'kanban' | 'markdown'

export interface Project {
  id: string
  name: string
  createdAt: number
}

export interface ProjectItem {
  id: string
  name: string
  type: ItemType
  createdAt: number
  updatedAt: number
}

export interface KanbanCard {
  id: string
  text: string
  createdAt: string
  priorityId?: string
}

export interface KanbanColumn {
  id: string
  title: string
  cardIds: string[]
}

export interface KanbanData {
  columns: KanbanColumn[]
  cards: Record<string, KanbanCard>
}

export type PriorityColor =
  | 'neutral'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'teal'
  | 'yellow'

export interface Priority {
  id: string
  label: string
  color: PriorityColor
}

export interface MarkdownShortcuts {
  duplicateLine: string
  moveLineUp: string
  moveLineDown: string
  deleteLine: string
  toggleBold: string
  toggleItalic: string
  toggleCode: string
  insertLink: string
  indent: string
  outdent: string
  toggleBulletList: string
  toggleTodoList: string
}

export interface AppConfig {
  priorities: Priority[]
  markdownShortcuts: MarkdownShortcuts
}
