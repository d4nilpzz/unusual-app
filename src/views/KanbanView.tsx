import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Column } from '../components/kanban/Column'
import { Card } from '../components/kanban/Card'
import { EditorHeader } from '../components/EditorHeader'
import { loadItemJson, saveItemJson, renameItem } from '../lib/store'
import type { KanbanData, Priority, ProjectItem } from '../types'

interface KanbanViewProps {
  projectId: string
  item: ProjectItem
  priorities: Priority[]
  onBack: () => void
  onRenamed: (name: string) => void
}

const EMPTY: KanbanData = {
  columns: [
    { id: 'todo', title: 'Por hacer', cardIds: [] },
    { id: 'doing', title: 'En progreso', cardIds: [] },
    { id: 'done', title: 'Hecho', cardIds: [] },
  ],
  cards: {},
}

function findColumnOfCard(data: KanbanData, cardId: string) {
  return data.columns.find((c) => c.cardIds.includes(cardId))
}

// Prefer whatever droppable the pointer is physically over (so the entire
// card/column area is a valid drop zone), falling back to nearest-center
// matching for edge cases like dragging into an empty column.
const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  if (pointerCollisions.length > 0) return pointerCollisions
  return closestCenter(args)
}

export function KanbanView({ projectId, item, priorities, onBack, onRenamed }: KanbanViewProps) {
  const [data, setData] = useState<KanbanData | null>(null)
  const [active, setActive] = useState<{ id: string; type: 'card' | 'column' } | null>(null)
  const [addingColumn, setAddingColumn] = useState(false)
  const [columnDraft, setColumnDraft] = useState('')
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  useEffect(() => {
    let cancelled = false
    loadItemJson<KanbanData>(projectId, item.id, 'kanban').then((loaded) => {
      if (cancelled) return
      setData(loaded && loaded.columns ? loaded : EMPTY)
    })
    return () => {
      cancelled = true
    }
  }, [projectId, item.id])

  const persist = (next: KanbanData) => {
    setData(next)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      saveItemJson(projectId, item.id, 'kanban', next)
    }, 400)
  }

  if (!data) return null

  const handleDragStart = (e: DragStartEvent) => {
    const type = (e.active.data.current?.type as 'card' | 'column') ?? 'card'
    setActive({ id: String(e.active.id), type })
  }

  const handleDragEnd = (e: DragEndEvent) => {
    const current = active
    setActive(null)
    const { active: activeArg, over } = e
    if (!over) return
    const activeId = String(activeArg.id)
    const overId = String(over.id)
    if (activeId === overId) return

    if (current?.type === 'column') {
      const fromIndex = data.columns.findIndex((c) => c.id === activeId)
      let toIndex = data.columns.findIndex((c) => c.id === overId)
      if (toIndex === -1) {
        // pointer landed on a card instead of directly on a column
        const col = findColumnOfCard(data, overId)
        toIndex = col ? data.columns.findIndex((c) => c.id === col.id) : -1
      }
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return
      persist({ ...data, columns: arrayMove(data.columns, fromIndex, toIndex) })
      return
    }

    const sourceCol = findColumnOfCard(data, activeId)
    if (!sourceCol) return

    const isOverColumn = data.columns.some((c) => c.id === overId)
    const targetCol = isOverColumn
      ? data.columns.find((c) => c.id === overId)!
      : findColumnOfCard(data, overId)
    if (!targetCol) return

    const next: KanbanData = {
      ...data,
      columns: data.columns.map((c) => ({ ...c, cardIds: [...c.cardIds] })),
    }
    const srcCol = next.columns.find((c) => c.id === sourceCol.id)!
    const dstCol = next.columns.find((c) => c.id === targetCol.id)!

    const fromIndex = srcCol.cardIds.indexOf(activeId)
    srcCol.cardIds.splice(fromIndex, 1)

    if (isOverColumn) {
      dstCol.cardIds.push(activeId)
    } else {
      const toIndex = dstCol.cardIds.indexOf(overId)
      dstCol.cardIds.splice(toIndex, 0, activeId)
    }

    persist(next)
  }

  const addCard = (columnId: string, text: string) => {
    const id = crypto.randomUUID()
    const next: KanbanData = {
      columns: data.columns.map((c) =>
        c.id === columnId ? { ...c, cardIds: [...c.cardIds, id] } : c,
      ),
      cards: { ...data.cards, [id]: { id, text, createdAt: new Date().toISOString() } },
    }
    persist(next)
  }

  const changeCard = (cardId: string, text: string) => {
    persist({
      ...data,
      cards: { ...data.cards, [cardId]: { ...data.cards[cardId], text } },
    })
  }

  const changeCardPriority = (cardId: string, priorityId: string | undefined) => {
    persist({
      ...data,
      cards: { ...data.cards, [cardId]: { ...data.cards[cardId], priorityId } },
    })
  }

  const deleteCard = (cardId: string) => {
    const cards = { ...data.cards }
    delete cards[cardId]
    persist({
      columns: data.columns.map((c) => ({
        ...c,
        cardIds: c.cardIds.filter((id) => id !== cardId),
      })),
      cards,
    })
  }

  const renameColumn = (columnId: string, title: string) => {
    persist({
      ...data,
      columns: data.columns.map((c) => (c.id === columnId ? { ...c, title } : c)),
    })
  }

  const deleteColumn = (columnId: string) => {
    const col = data.columns.find((c) => c.id === columnId)
    const cards = { ...data.cards }
    col?.cardIds.forEach((id) => delete cards[id])
    persist({ columns: data.columns.filter((c) => c.id !== columnId), cards })
  }

  const addColumn = () => {
    const trimmed = columnDraft.trim()
    if (trimmed) {
      persist({
        ...data,
        columns: [...data.columns, { id: crypto.randomUUID(), title: trimmed, cardIds: [] }],
      })
    }
    setColumnDraft('')
    setAddingColumn(false)
  }

  const handleRenameBoard = async (name: string) => {
    await renameItem(projectId, item.id, name)
    onRenamed(name)
  }

  const activeCard = active?.type === 'card' ? data.cards[active.id] : null
  const activeColumn = active?.type === 'column' ? data.columns.find((c) => c.id === active.id) : null

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <EditorHeader name={item.name} onBack={onBack} onRename={handleRenameBoard} />
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={data.columns.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex h-full items-start gap-3">
              {data.columns.map((col) => (
                <Column
                  key={col.id}
                  column={col}
                  cards={col.cardIds.map((id) => data.cards[id]).filter(Boolean)}
                  priorities={priorities}
                  onAddCard={(text) => addCard(col.id, text)}
                  onChangeCard={changeCard}
                  onDeleteCard={deleteCard}
                  onChangeCardPriority={changeCardPriority}
                  onRenameColumn={(title) => renameColumn(col.id, title)}
                  onDeleteColumn={() => deleteColumn(col.id)}
                />
              ))}

              <div className="w-72 shrink-0">
                {addingColumn ? (
                  <input
                    autoFocus
                    value={columnDraft}
                    onChange={(e) => setColumnDraft(e.target.value)}
                    onBlur={addColumn}
                    onKeyDown={(e) => e.key === 'Enter' && addColumn()}
                    placeholder="Column title"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none"
                  />
                ) : (
                  <button
                    onClick={() => setAddingColumn(true)}
                    className="flex w-full items-center gap-1.5 rounded-xl border border-dashed border-zinc-800 px-3 py-2.5 text-sm text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                  >
                    <Plus size={14} /> Add column
                  </button>
                )}
              </div>
            </div>
          </SortableContext>

          <DragOverlay>
            {activeCard ? (
              <Card
                card={activeCard}
                priorities={priorities}
                onChange={() => {}}
                onDelete={() => {}}
                onChangePriority={() => {}}
              />
            ) : activeColumn ? (
              <div className="flex h-12 w-72 items-center rounded-xl border border-zinc-700 bg-zinc-900/90 px-3 text-sm font-medium text-zinc-200 shadow-2xl">
                {activeColumn.title}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  )
}
