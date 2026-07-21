import { ArrowLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'

interface EditorHeaderProps {
  name: string
  onBack: () => void
  onRename?: (name: string) => void
  right?: ReactNode
}

export function EditorHeader({ name, onBack, onRename, right }: EditorHeaderProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)

  const commit = () => {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed && trimmed !== name && onRename) onRename(trimmed)
    else setValue(name)
  }

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          onClick={onBack}
          className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
          title="Back"
        >
          <ArrowLeft size={16} />
        </button>
        {editing ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setValue(name)
                setEditing(false)
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none"
          />
        ) : (
          <span
            onClick={() => onRename && setEditing(true)}
            className={`truncate text-sm font-medium text-zinc-200 ${
              onRename ? 'cursor-text rounded px-1.5 py-1 hover:bg-zinc-900' : ''
            }`}
            title={onRename ? 'Click to rename' : undefined}
          >
            {name}
          </span>
        )}
      </div>
      {right}
    </header>
  )
}
