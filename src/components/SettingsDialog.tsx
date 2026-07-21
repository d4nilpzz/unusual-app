import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Divider } from '@astryxdesign/core/Divider'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Selector } from '@astryxdesign/core/Selector'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { Plus, Trash2 } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { comboFromEvent, formatCombo } from '../lib/shortcuts'
import type { AppConfig, MarkdownShortcuts, Priority, PriorityColor } from '../types'
import { UpdateSection } from './UpdateSection'

const COLOR_OPTIONS: { value: PriorityColor; label: string }[] = [
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

function Dot({ color }: { color: PriorityColor }) {
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

const SELECTOR_OPTIONS = COLOR_OPTIONS.map((c) => ({
  value: c.value,
  label: c.label,
  icon: <Dot color={c.value} />,
}))

const SHORTCUT_ROWS: { key: keyof MarkdownShortcuts; label: string }[] = [
  { key: 'duplicateLine', label: 'Duplicate line' },
  { key: 'moveLineUp', label: 'Move line up' },
  { key: 'moveLineDown', label: 'Move line down' },
  { key: 'deleteLine', label: 'Delete line' },
  { key: 'toggleBold', label: 'Bold' },
  { key: 'toggleItalic', label: 'Italic' },
  { key: 'toggleCode', label: 'Inline code' },
  { key: 'insertLink', label: 'Insert link' },
  { key: 'indent', label: 'Indent' },
  { key: 'outdent', label: 'Outdent' },
  { key: 'toggleBulletList', label: 'Toggle bullet list' },
  { key: 'toggleTodoList', label: 'Toggle checklist' },
]

interface ShortcutRowProps {
  label: string
  combo: string
  onChange: (combo: string) => void
}

function ShortcutRow({ label, combo, onChange }: ShortcutRowProps) {
  const [recording, setRecording] = useState(false)

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return
    e.preventDefault()
    const next = comboFromEvent(e)
    if (next) {
      onChange(next)
      setRecording(false)
    }
  }

  return (
    <HStack justify="between" align="center">
      <Text type="body">{label}</Text>
      <Button
        label={recording ? 'Press a key combo...' : formatCombo(combo)}
        variant={recording ? 'primary' : 'secondary'}
        size="sm"
        onClick={() => setRecording(true)}
        onKeyDown={handleKeyDown}
        onBlur={() => setRecording(false)}
      />
    </HStack>
  )
}

interface SettingsDialogProps {
  config: AppConfig
  onSave: (config: AppConfig) => void
  onClose: () => void
}

export function SettingsDialog({ config, onSave, onClose }: SettingsDialogProps) {
  const [items, setItems] = useState<Priority[]>(config.priorities)
  const [shortcuts, setShortcuts] = useState<MarkdownShortcuts>(config.markdownShortcuts)

  const updateLabel = (id: string, label: string) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, label } : p)))
  }

  const updateColor = (id: string, color: PriorityColor) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, color } : p)))
  }

  const removeRow = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id))
  }

  const addRow = () => {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: 'New priority', color: 'neutral' },
    ])
  }

  const updateShortcut = (key: keyof MarkdownShortcuts, value: string) => {
    setShortcuts((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    const cleaned = items.map((p) => ({ ...p, label: p.label.trim() || 'Priority' }))
    onSave({ priorities: cleaned, markdownShortcuts: shortcuts })
    onClose()
  }

  return (
    <Dialog isOpen purpose="form" width={480} onOpenChange={(open) => !open && onClose()}>
      <Layout
        header={<DialogHeader title="Settings" onOpenChange={(open) => !open && onClose()} />}
        content={
          <LayoutContent>
            <VStack gap={4}>
              <VStack gap={3}>
                <Heading level={4}>Custom priorities</Heading>
                {items.map((item) => (
                  <HStack key={item.id} gap={2} align="center">
                    <Badge variant={item.color} label={item.label || 'Priority'} />
                    <Selector
                      label="Color"
                      isLabelHidden
                      width={150}
                      options={SELECTOR_OPTIONS}
                      value={item.color}
                      onChange={(v) => updateColor(item.id, v as PriorityColor)}
                    />
                    <TextInput
                      label="Name"
                      isLabelHidden
                      value={item.label}
                      onChange={(v) => updateLabel(item.id, v)}
                      width="100%"
                    />
                    <IconButton
                      label="Delete priority"
                      icon={<Trash2 size={14} />}
                      variant="ghost"
                      onClick={() => removeRow(item.id)}
                    />
                  </HStack>
                ))}
                <Button
                  label="Add priority"
                  icon={<Plus size={14} />}
                  variant="ghost"
                  onClick={addRow}
                />
              </VStack>

              <Divider />

              <VStack gap={3}>
                <Heading level={4}>Markdown shortcuts</Heading>
                {SHORTCUT_ROWS.map((row) => (
                  <ShortcutRow
                    key={row.key}
                    label={row.label}
                    combo={shortcuts[row.key]}
                    onChange={(combo) => updateShortcut(row.key, combo)}
                  />
                ))}
              </VStack>

              <Divider />

              <UpdateSection />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <Button label="Cancel" variant="ghost" onClick={onClose} />
            <Button label="Save" variant="primary" onClick={handleSave} />
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
