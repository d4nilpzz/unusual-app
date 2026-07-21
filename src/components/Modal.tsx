import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useState } from 'react'

interface PromptModalProps {
  title: string
  label?: string
  defaultValue?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: (value: string) => void
  onCancel: () => void
}

export function PromptModal({
  title,
  label,
  defaultValue = '',
  confirmLabel = 'Create',
  danger,
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue)

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    <Dialog isOpen purpose="info" width={360} onOpenChange={(open) => !open && onCancel()}>
      <Layout
        header={<DialogHeader title={title} onOpenChange={(open) => !open && onCancel()} />}
        content={
          <LayoutContent>
            <TextInput
              label={label ?? title}
              value={value}
              onChange={setValue}
              onEnter={submit}
              hasAutoFocus
            />
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <Button label="Cancel" variant="ghost" onClick={onCancel} />
            <Button
              label={confirmLabel}
              variant={danger ? 'destructive' : 'primary'}
              onClick={submit}
            />
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}

interface ConfirmModalProps {
  title: string
  description?: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Dialog isOpen purpose="info" width={360} onOpenChange={(open) => !open && onCancel()}>
      <Layout
        header={<DialogHeader title={title} onOpenChange={(open) => !open && onCancel()} />}
        content={description ? <LayoutContent>{description}</LayoutContent> : undefined}
        footer={
          <LayoutFooter hasDivider>
            <Button label="Cancel" variant="ghost" onClick={onCancel} />
            <Button label={confirmLabel} variant="destructive" onClick={onConfirm} />
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
