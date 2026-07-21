import { Badge } from '@astryxdesign/core/Badge'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Timestamp } from '@astryxdesign/core/Timestamp'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Flag, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { KanbanCard, Priority } from '../../types'

interface CardProps {
  card: KanbanCard
  priorities: Priority[]
  onChange: (text: string) => void
  onDelete: () => void
  onChangePriority: (priorityId: string | undefined) => void
}

export function Card({ card, priorities, onChange, onDelete, onChangePriority }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card' },
  })
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(card.text)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const commit = () => {
    setEditing(false)
    const trimmed = text.trim()
    if (trimmed && trimmed !== card.text) onChange(trimmed)
    else setText(card.text)
  }

  const activePriority = priorities.find((p) => p.id === card.priorityId)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-sm text-zinc-200 shadow-sm hover:border-zinc-700"
      onClick={() => setEditing(true)}
    >
      {editing ? (
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              commit()
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full resize-none bg-transparent text-sm text-zinc-100 outline-none"
          rows={2}
        />
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="whitespace-pre-wrap break-words">{card.text}</p>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="shrink-0 rounded p-0.5 text-zinc-600 opacity-0 hover:bg-zinc-800 hover:text-red-400 group-hover:opacity-100"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}

      <div
        className="mt-2 flex items-center justify-between gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Timestamp value={card.createdAt} format="date" color="secondary" />
        <DropdownMenu
          button={{
            label: activePriority ? `Priority: ${activePriority.label}` : 'No priority',
            variant: 'ghost',
            size: 'sm',
            icon: activePriority ? undefined : <Flag size={12} />,
            children: activePriority ? (
              <Badge variant={activePriority.color} label={activePriority.label} />
            ) : undefined,
          }}
          items={[
            ...priorities.map((p) => ({
              label: p.label,
              onClick: () => onChangePriority(p.id),
            })),
            { type: 'divider' as const },
            { label: 'No priority', onClick: () => onChangePriority(undefined) },
          ]}
        />
      </div>
    </div>
  )
}
