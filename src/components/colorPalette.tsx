import type { PriorityColor } from '../types'

export const COLOR_OPTIONS: { value: PriorityColor; label: string }[] = [
  { value: 'neutral', label: 'Gray' },
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'green', label: 'Green' },
  { value: 'teal', label: 'Teal' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'blue', label: 'Blue' },
  { value: 'purple', label: 'Purple' },
  { value: 'pink', label: 'Pink' },
]

export function ColorDot({ color }: { color: PriorityColor }) {
  const hue = color === 'neutral' ? 'gray' : color
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: 999,
        background: `var(--color-icon-${hue})`,
      }}
    />
  )
}

export const COLOR_SELECTOR_OPTIONS = COLOR_OPTIONS.map((c) => ({
  value: c.value,
  label: c.label,
  icon: <ColorDot color={c.value} />,
}))
