import type React from 'react'

const ARROW_KEYS: Record<string, string> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
}

const MODIFIER_KEYS = new Set(['control', 'meta', 'alt', 'shift'])

/** Normalizes a keyboard event into a stable combo string, e.g. "ctrl+d", "shift+up". */
export function comboFromEvent(e: KeyboardEvent | React.KeyboardEvent): string | null {
  const rawKey = e.key.toLowerCase()
  const key = ARROW_KEYS[rawKey] ?? rawKey
  if (MODIFIER_KEYS.has(key)) return null

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(key)
  return parts.join('+')
}

/** Formats a combo string for display, e.g. "ctrl+d" -> "Ctrl + D". */
export function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map((part) => (part.length === 1 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(' + ')
}
