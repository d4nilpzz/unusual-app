import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import type { CalendarData } from '../types'
import { listAllCalendarItems, loadItemJson, saveItemJson } from './store'

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 86_400_000
  const utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const utcTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((utcTo - utcFrom) / msPerDay)
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Scans every calendar across every project and fires an OS notification for
 * events whose reminder window has been reached (at most once per day). */
export async function checkCalendarReminders(): Promise<void> {
  let granted = await isPermissionGranted()
  if (!granted) {
    granted = (await requestPermission()) === 'granted'
  }
  if (!granted) return

  const today = new Date()
  const key = todayKey()
  const refs = await listAllCalendarItems()

  for (const ref of refs) {
    const data = await loadItemJson<CalendarData>(ref.projectId, ref.itemId, 'calendar')
    if (!data) continue

    let changed = false
    for (const event of data.events) {
      if (event.notifyDaysBefore == null) continue
      if (event.lastNotifiedDate === key) continue

      const eventDate = new Date(`${event.date}T00:00:00`)
      const diff = daysBetween(today, eventDate)
      if (diff < 0 || diff > event.notifyDaysBefore) continue

      sendNotification({
        title: event.title,
        body:
          diff === 0
            ? `Today · ${ref.itemName}`
            : `In ${diff} day${diff === 1 ? '' : 's'} · ${ref.itemName}`,
      })
      event.lastNotifiedDate = key
      changed = true
    }

    if (changed) {
      await saveItemJson(ref.projectId, ref.itemId, 'calendar', data)
    }
  }
}
