import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Folder, FolderPlus, MoreHorizontal, Pencil, Settings, Trash2 } from 'lucide-react'
import type { Project } from '../types'

interface SidebarProps {
  projects: Project[]
  selectedId: string | null
  version: string
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
  onOpenSettings: () => void
}

export function Sidebar({
  projects,
  selectedId,
  version,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onOpenSettings,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-4">
        <span className="text-sm font-semibold tracking-wide text-zinc-100">Projects</span>
        <button
          onClick={onCreate}
          title="New project"
          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
        >
          <FolderPlus size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {projects.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-zinc-600">
            No projects yet.
            <br />
            Create one with the + icon.
          </p>
        )}
        {projects.map((p) => (
          <div
            key={p.id}
            className={`group relative mb-0.5 flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer ${
              selectedId === p.id
                ? 'bg-zinc-800 text-zinc-50'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
            }`}
            onClick={() => onSelect(p.id)}
          >
            <Folder size={15} className="ml-1 shrink-0 opacity-70" />
            <span className="flex-1 truncate">{p.name}</span>
            <div
              className="opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenu
                button={{
                  label: 'More options',
                  icon: <MoreHorizontal size={14} />,
                  isIconOnly: true,
                  variant: 'ghost',
                  size: 'sm',
                }}
                items={[
                  { label: 'Rename', icon: <Pencil size={13} />, onClick: () => onRename(p.id) },
                  { label: 'Delete', icon: <Trash2 size={13} />, onClick: () => onDelete(p.id) },
                ]}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-zinc-800 p-2">
        <IconButton
          label="Settings"
          icon={<Settings size={16} />}
          variant="ghost"
          tooltip="Settings"
          onClick={onOpenSettings}
        />
        {version && <span className="pr-1 text-xs text-zinc-600">v{version}</span>}
      </div>
    </aside>
  )
}
