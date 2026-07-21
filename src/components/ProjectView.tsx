import { FileText, LayoutDashboard, PenTool, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ItemType, Project, ProjectItem } from '../types'
import { ItemCard } from './ItemCard'

interface ProjectViewProps {
  project: Project
  items: ProjectItem[]
  onOpenItem: (item: ProjectItem) => void
  onCreateItem: (type: ItemType) => void
  onRenameItem: (item: ProjectItem) => void
  onDeleteItem: (item: ProjectItem) => void
}

const NEW_ITEM_OPTIONS: { type: ItemType; label: string; icon: typeof PenTool }[] = [
  { type: 'whiteboard', label: 'Whiteboard', icon: PenTool },
  { type: 'kanban', label: 'Board', icon: LayoutDashboard },
  { type: 'markdown', label: 'Note', icon: FileText },
]

export function ProjectView({
  project,
  items,
  onOpenItem,
  onCreateItem,
  onRenameItem,
  onDeleteItem,
}: ProjectViewProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <h1 className="text-base font-semibold text-zinc-100">{project.name}</h1>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white"
          >
            <Plus size={15} /> New
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-10 z-10 w-40 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 shadow-xl">
              {NEW_ITEM_OPTIONS.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  onClick={() => {
                    setMenuOpen(false)
                    onCreateItem(type)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-zinc-600">
            <p className="text-sm">This project is empty.</p>
            <p className="mt-1 text-xs">Create a whiteboard, a board, or a note.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onOpen={() => onOpenItem(item)}
                onRename={() => onRenameItem(item)}
                onDelete={() => onDeleteItem(item)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
