import { Code, Eye, Columns2 } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { EditorHeader } from '../components/EditorHeader'
import {
  deleteLines,
  duplicateLines,
  indentLines,
  insertLink,
  moveLines,
  outdentLines,
  toggleLinePrefix,
  toggleTodoLines,
  wrapSelection,
  type LineEditResult,
} from '../lib/markdownEditing'
import { comboFromEvent } from '../lib/shortcuts'
import { loadMarkdown, saveMarkdown, renameItem } from '../lib/store'
import type { MarkdownShortcuts, ProjectItem } from '../types'

type ShortcutAction = (value: string, selStart: number, selEnd: number) => LineEditResult | null

const ACTIONS: Record<keyof MarkdownShortcuts, ShortcutAction> = {
  duplicateLine: duplicateLines,
  moveLineUp: (v, s, e) => moveLines(v, s, e, -1),
  moveLineDown: (v, s, e) => moveLines(v, s, e, 1),
  deleteLine: deleteLines,
  toggleBold: (v, s, e) => wrapSelection(v, s, e, '**'),
  toggleItalic: (v, s, e) => wrapSelection(v, s, e, '*'),
  toggleCode: (v, s, e) => wrapSelection(v, s, e, '`'),
  insertLink: insertLink,
  indent: indentLines,
  outdent: outdentLines,
  toggleBulletList: (v, s, e) => toggleLinePrefix(v, s, e, '- '),
  toggleTodoList: toggleTodoLines,
}

interface MarkdownViewProps {
  projectId: string
  item: ProjectItem
  shortcuts: MarkdownShortcuts
  onBack: () => void
  onRenamed: (name: string) => void
}

type Mode = 'edit' | 'split' | 'preview'

export function MarkdownView({ projectId, item, shortcuts, onBack, onRenamed }: MarkdownViewProps) {
  const [content, setContent] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('split')
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let cancelled = false
    loadMarkdown(projectId, item.id).then((text) => {
      if (!cancelled) setContent(text)
    })
    return () => {
      cancelled = true
    }
  }, [projectId, item.id])

  const handleChange = (value: string) => {
    setContent(value)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      saveMarkdown(projectId, item.id, value)
    }, 500)
  }

  const applyLineEdit = (result: LineEditResult | null) => {
    if (!result) return
    handleChange(result.newValue)
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(result.selStart, result.selEnd)
    })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const combo = comboFromEvent(e)
    if (!combo) return
    const action = (Object.keys(shortcuts) as (keyof MarkdownShortcuts)[]).find(
      (key) => shortcuts[key] === combo,
    )
    if (!action) return
    e.preventDefault()
    const { value, selectionStart, selectionEnd } = e.currentTarget
    applyLineEdit(ACTIONS[action](value, selectionStart, selectionEnd))
  }

  if (content === null) return null

  const modeBtn = (m: Mode, Icon: typeof Code, title: string) => (
    <button
      onClick={() => setMode(m)}
      title={title}
      className={`rounded-md p-1.5 ${
        mode === m
          ? 'bg-zinc-800 text-zinc-100'
          : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
      }`}
    >
      <Icon size={15} />
    </button>
  )

  const handleRename = async (name: string) => {
    await renameItem(projectId, item.id, name)
    onRenamed(name)
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <EditorHeader
        name={item.name}
        onBack={onBack}
        onRename={handleRename}
        right={
          <div className="flex items-center gap-1">
            {modeBtn('edit', Code, 'Edit')}
            {modeBtn('split', Columns2, 'Split')}
            {modeBtn('preview', Eye, 'Preview')}
          </div>
        }
      />
      <div className="flex flex-1 overflow-hidden">
        {(mode === 'edit' || mode === 'split') && (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            className="h-full flex-1 resize-none overflow-y-auto bg-zinc-950 p-6 font-mono text-sm text-zinc-200 outline-none"
            placeholder="Write in markdown..."
          />
        )}
        {mode === 'split' && <div className="w-px shrink-0 bg-zinc-800" />}
        {(mode === 'preview' || mode === 'split') && (
          <div className="markdown-body h-full flex-1 overflow-y-auto bg-zinc-950 p-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
