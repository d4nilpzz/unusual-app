import { Button } from '@astryxdesign/core/Button'
import type { ISODateString } from '@astryxdesign/core/Calendar'
import { DateInput } from '@astryxdesign/core/DateInput'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import type { CalendarEvent, PriorityColor } from '../../types'
import { COLOR_SELECTOR_OPTIONS } from '../colorPalette'

const REMINDER_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: '0', label: 'Same day' },
  { value: '1', label: '1 day before' },
  { value: '2', label: '2 days before' },
  { value: '3', label: '3 days before' },
  { value: '5', label: '5 days before' },
  { value: '7', label: '1 week before' },
  { value: '14', label: '2 weeks before' },
]

interface EventDialogProps {
  initialDate: string
  event: CalendarEvent | null
  onSave: (event: Omit<CalendarEvent, 'id' | 'lastNotifiedDate'>) => void
  onDelete?: () => void
  onClose: () => void
}

export function EventDialog({ initialDate, event, onSave, onDelete, onClose }: EventDialogProps) {
  const [title, setTitle] = useState(event?.title ?? '')
  const [date, setDate] = useState(event?.date ?? initialDate)
  const [color, setColor] = useState<PriorityColor>(event?.color ?? 'blue')
  const [reminder, setReminder] = useState(
    event?.notifyDaysBefore == null ? 'off' : String(event.notifyDaysBefore),
  )

  const handleSave = () => {
    const trimmed = title.trim()
    if (!trimmed || !date) return
    onSave({
      title: trimmed,
      date,
      color,
      notifyDaysBefore: reminder === 'off' ? null : Number(reminder),
    })
  }

  return (
    <Dialog isOpen purpose="form" width={400} onOpenChange={(open) => !open && onClose()}>
      <Layout
        header={
          <DialogHeader
            title={event ? 'Edit event' : 'New event'}
            onOpenChange={(open) => !open && onClose()}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              <TextInput
                label="Title"
                value={title}
                onChange={setTitle}
                width="100%"
                placeholder="Event title"
              />
              <DateInput
                label="Date"
                value={date as ISODateString}
                onChange={(v) => v && setDate(v)}
                width="100%"
              />
              <Selector
                label="Color"
                width="100%"
                options={COLOR_SELECTOR_OPTIONS}
                value={color}
                onChange={(v) => setColor(v as PriorityColor)}
              />
              <Selector
                label="Remind me"
                width="100%"
                options={REMINDER_OPTIONS}
                value={reminder}
                onChange={(v) => setReminder(v as string)}
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            {onDelete && <Button label="Delete" variant="ghost" onClick={onDelete} />}
            <Button label="Cancel" variant="ghost" onClick={onClose} />
            <Button label="Save" variant="primary" onClick={handleSave} />
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
