import { FileText, LayoutDashboard, PenTool, Pencil, Trash2 } from 'lucide-react'
import type { ProjectItem } from '../types'

const ICONS = {
  whiteboard: PenTool,
  kanban: LayoutDashboard,
  markdown: FileText,
} as const

const LABELS = {
  whiteboard: 'Whiteboard',
  kanban: 'Board',
  markdown: 'Note',
} as const

interface ItemCardProps {
  item: ProjectItem
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}

export function ItemCard({ item, onOpen, onRename, onDelete }: ItemCardProps) {
  const Icon = ICONS[item.type]
  return (
    <button
      onClick={onOpen}
      className="group relative flex aspect-4/3 flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-900"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300">
          <Icon size={16} />
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
          <span
            onClick={(e) => {
              e.stopPropagation()
              onRename()
            }}
            role="button"
            className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Pencil size={14} />
          </span>
          <span
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            role="button"
            className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
          >
            <Trash2 size={14} />
          </span>
        </div>
      </div>
      <div>
        <p className="truncate text-sm font-medium text-zinc-100">{item.name}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{LABELS[item.type]}</p>
      </div>
    </button>
  )
}
