import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { KanbanCard, KanbanColumn, Priority } from '../../types'
import { Card } from './Card'

interface ColumnProps {
  column: KanbanColumn
  cards: KanbanCard[]
  priorities: Priority[]
  onAddCard: (text: string) => void
  onChangeCard: (cardId: string, text: string) => void
  onDeleteCard: (cardId: string) => void
  onChangeCardPriority: (cardId: string, priorityId: string | undefined) => void
  onRenameColumn: (title: string) => void
  onDeleteColumn: () => void
}

export function Column({
  column,
  cards,
  priorities,
  onAddCard,
  onChangeCard,
  onDeleteCard,
  onChangeCardPriority,
  onRenameColumn,
  onDeleteColumn,
}: ColumnProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'column' },
  })
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [titleEditing, setTitleEditing] = useState(false)
  const [title, setTitle] = useState(column.title)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const submitCard = () => {
    const trimmed = draft.trim()
    if (trimmed) onAddCard(trimmed)
    setDraft('')
    setAdding(false)
  }

  const commitTitle = () => {
    setTitleEditing(false)
    const trimmed = title.trim()
    if (trimmed && trimmed !== column.title) onRenameColumn(trimmed)
    else setTitle(column.title)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex h-full w-72 shrink-0 flex-col rounded-xl border border-zinc-800 bg-zinc-950/60"
    >
      <div className="flex items-center justify-between px-2 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <button
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab touch-none rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 active:cursor-grabbing"
            title="Drag column"
          >
            <GripVertical size={14} />
          </button>
          {titleEditing ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => e.key === 'Enter' && commitTitle()}
              className="w-full rounded bg-zinc-900 px-1.5 py-0.5 text-sm font-medium text-zinc-100 outline-none"
            />
          ) : (
            <span
              onClick={() => setTitleEditing(true)}
              className="truncate text-sm font-medium text-zinc-200"
            >
              {column.title}
            </span>
          )}
        </div>
        <div className="shrink-0">
          <DropdownMenu
            button={{
              label: 'More options',
              icon: <MoreHorizontal size={14} />,
              isIconOnly: true,
              variant: 'ghost',
              size: 'sm',
            }}
            items={[{ label: 'Delete', icon: <Trash2 size={12} />, onClick: onDeleteColumn }]}
          />
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              priorities={priorities}
              onChange={(text) => onChangeCard(card.id, text)}
              onDelete={() => onDeleteCard(card.id)}
              onChangePriority={(priorityId) => onChangeCardPriority(card.id, priorityId)}
            />
          ))}
        </SortableContext>
      </div>

      <div className="px-2 pb-2">
        {adding ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={submitCard}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submitCard()
              }
              if (e.key === 'Escape') {
                setAdding(false)
                setDraft('')
              }
            }}
            placeholder="Write a card..."
            className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm text-zinc-100 outline-none"
            rows={2}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
          >
            <Plus size={13} /> Add card
          </button>
        )}
      </div>
    </div>
  )
}
