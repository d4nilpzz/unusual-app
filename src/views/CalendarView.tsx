import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorHeader } from '../components/EditorHeader'
import { EventDialog } from '../components/calendar/EventDialog'
import { loadItemJson, renameItem, saveItemJson } from '../lib/store'
import type { CalendarData, CalendarEvent, ProjectItem } from '../types'

interface CalendarViewProps {
  projectId: string
  item: ProjectItem
  onBack: () => void
  onRenamed: (name: string) => void
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildMonthMatrix(viewDate: Date): Date[] {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay())
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i))
  }
  return days
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'create'; date: string }
  | { kind: 'edit'; event: CalendarEvent }

export function CalendarView({ projectId, item, onBack, onRenamed }: CalendarViewProps) {
  const [data, setData] = useState<CalendarData | null>(null)
  const [viewDate, setViewDate] = useState(() => new Date())
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' })
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wheelLocked = useRef(false)

  const handleWheel = (e: React.WheelEvent) => {
    if (wheelLocked.current) return
    if (Math.abs(e.deltaY) < 10) return
    wheelLocked.current = true
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + (e.deltaY > 0 ? 1 : -1), 1))
    setTimeout(() => {
      wheelLocked.current = false
    }, 350)
  }

  useEffect(() => {
    let cancelled = false
    loadItemJson<CalendarData>(projectId, item.id, 'calendar').then((loaded) => {
      if (cancelled) return
      setData(loaded && loaded.events ? loaded : { events: [] })
    })
    return () => {
      cancelled = true
    }
  }, [projectId, item.id])

  const persist = (next: CalendarData) => {
    setData(next)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      saveItemJson(projectId, item.id, 'calendar', next)
    }, 300)
  }

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of data?.events ?? []) {
      const list = map.get(event.date) ?? []
      list.push(event)
      map.set(event.date, list)
    }
    return map
  }, [data])

  const days = useMemo(() => buildMonthMatrix(viewDate), [viewDate])
  const today = dateKey(new Date())
  const currentMonth = viewDate.getMonth()

  const handleSaveEvent = (fields: Omit<CalendarEvent, 'id' | 'lastNotifiedDate'>) => {
    if (!data) return
    if (dialog.kind === 'edit') {
      persist({
        events: data.events.map((e) =>
          e.id === dialog.event.id ? { ...e, ...fields, lastNotifiedDate: undefined } : e,
        ),
      })
    } else {
      persist({
        events: [...data.events, { id: crypto.randomUUID(), ...fields }],
      })
    }
    setDialog({ kind: 'none' })
  }

  const handleDeleteEvent = () => {
    if (!data || dialog.kind !== 'edit') return
    persist({ events: data.events.filter((e) => e.id !== dialog.event.id) })
    setDialog({ kind: 'none' })
  }

  const handleRename = async (name: string) => {
    await renameItem(projectId, item.id, name)
    onRenamed(name)
  }

  if (!data) return null

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <EditorHeader name={item.name} onBack={onBack} onRename={handleRename} />

      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <IconButton
            label="Previous month"
            icon={<ChevronLeft size={15} />}
            variant="ghost"
            size="sm"
            onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          />
          <span className="min-w-36 text-center text-sm font-medium text-zinc-100">
            {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <IconButton
            label="Next month"
            icon={<ChevronRight size={15} />}
            variant="ghost"
            size="sm"
            onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          />
          <Button label="Today" variant="ghost" size="sm" onClick={() => setViewDate(new Date())} />
        </div>
        <Button
          label="New event"
          icon={<Plus size={14} />}
          variant="secondary"
          size="sm"
          onClick={() => setDialog({ kind: 'create', date: dateKey(viewDate) })}
        />
      </div>

      <div className="grid grid-cols-7 border-b border-zinc-800 text-center">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-2 text-xs font-medium text-zinc-500">
            {label}
          </div>
        ))}
      </div>

      <div
        onWheel={handleWheel}
        className="grid flex-1 grid-cols-7 grid-rows-6 overflow-hidden"
      >
        {days.map((day) => {
          const key = dateKey(day)
          const events = eventsByDate.get(key) ?? []
          const isOutside = day.getMonth() !== currentMonth
          const isToday = key === today
          return (
            <div
              key={key}
              onClick={() => setDialog({ kind: 'create', date: key })}
              className={`flex min-h-24 cursor-pointer flex-col gap-1 border-b border-r border-zinc-800/70 p-1.5 ${
                isToday
                  ? 'bg-blue-950/40 ring-1 ring-inset ring-blue-500'
                  : isOutside
                    ? 'bg-zinc-950/40'
                    : 'hover:bg-zinc-900/50'
              }`}
            >
              <span
                className={`self-start rounded px-1.5 text-xs ${
                  isToday
                    ? 'bg-blue-500 font-medium text-white'
                    : isOutside
                      ? 'text-zinc-700'
                      : 'text-zinc-400'
                }`}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-1 overflow-hidden">
                {events.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      setDialog({ kind: 'edit', event })
                    }}
                    className="truncate"
                  >
                    <Badge variant={event.color} label={event.title} />
                  </div>
                ))}
                {events.length > 3 && (
                  <span className="px-1 text-xs text-zinc-500">+{events.length - 3} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {dialog.kind !== 'none' && (
        <EventDialog
          initialDate={dialog.kind === 'create' ? dialog.date : dialog.event.date}
          event={dialog.kind === 'edit' ? dialog.event : null}
          onSave={handleSaveEvent}
          onDelete={dialog.kind === 'edit' ? handleDeleteEvent : undefined}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
    </div>
  )
}
