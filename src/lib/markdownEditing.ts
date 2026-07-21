export interface LineEditResult {
  newValue: string
  selStart: number
  selEnd: number
}

function selectedLineBounds(value: string, selStart: number, selEnd: number) {
  const start = value.lastIndexOf('\n', selStart - 1) + 1
  let end = value.indexOf('\n', selEnd)
  if (end === -1) end = value.length
  return { start, end }
}

export function duplicateLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): LineEditResult {
  const { start, end } = selectedLineBounds(value, selectionStart, selectionEnd)
  const block = value.slice(start, end)
  const newValue = value.slice(0, end) + '\n' + block + value.slice(end)
  const newStart = end + 1
  return { newValue, selStart: newStart, selEnd: newStart + block.length }
}

export function moveLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  direction: -1 | 1,
): LineEditResult | null {
  const { start, end } = selectedLineBounds(value, selectionStart, selectionEnd)
  const block = value.slice(start, end)

  if (direction === -1) {
    if (start === 0) return null
    const prevEnd = start - 1
    const prevStart = value.lastIndexOf('\n', prevEnd - 1) + 1
    const prevLine = value.slice(prevStart, prevEnd)
    const newValue = value.slice(0, prevStart) + block + '\n' + prevLine + value.slice(end)
    return { newValue, selStart: prevStart, selEnd: prevStart + block.length }
  }

  if (end === value.length) return null
  const nextStart = end + 1
  let nextEnd = value.indexOf('\n', nextStart)
  if (nextEnd === -1) nextEnd = value.length
  const nextLine = value.slice(nextStart, nextEnd)
  const newValue = value.slice(0, start) + nextLine + '\n' + block + value.slice(nextEnd)
  const newStart = start + nextLine.length + 1
  return { newValue, selStart: newStart, selEnd: newStart + block.length }
}

/** Wraps the selection in matching markers (e.g. "**" for bold), or unwraps it if already wrapped. */
export function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  marker: string,
): LineEditResult {
  const selected = value.slice(selectionStart, selectionEnd)
  const before = value.slice(Math.max(0, selectionStart - marker.length), selectionStart)
  const after = value.slice(selectionEnd, selectionEnd + marker.length)

  if (before === marker && after === marker) {
    const newValue =
      value.slice(0, selectionStart - marker.length) + selected + value.slice(selectionEnd + marker.length)
    return {
      newValue,
      selStart: selectionStart - marker.length,
      selEnd: selectionEnd - marker.length,
    }
  }

  const newValue = value.slice(0, selectionStart) + marker + selected + marker + value.slice(selectionEnd)
  if (selected.length === 0) {
    const cursor = selectionStart + marker.length
    return { newValue, selStart: cursor, selEnd: cursor }
  }
  return { newValue, selStart: selectionStart + marker.length, selEnd: selectionEnd + marker.length }
}

/** Wraps the selection as a markdown link, leaving the URL placeholder selected for typing. */
export function insertLink(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): LineEditResult {
  const selected = value.slice(selectionStart, selectionEnd)
  const text = selected || 'text'
  const insertion = `[${text}](url)`
  const newValue = value.slice(0, selectionStart) + insertion + value.slice(selectionEnd)
  const urlStart = selectionStart + `[${text}](`.length
  return { newValue, selStart: urlStart, selEnd: urlStart + 'url'.length }
}

/** Indents every selected line (or the current line) by two spaces. */
export function indentLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): LineEditResult {
  const { start, end } = selectedLineBounds(value, selectionStart, selectionEnd)
  const block = value.slice(start, end)
  const indented = block
    .split('\n')
    .map((line) => '  ' + line)
    .join('\n')
  const newValue = value.slice(0, start) + indented + value.slice(end)
  return { newValue, selStart: start, selEnd: start + indented.length }
}

/** Removes up to two leading spaces (or one leading tab) from every selected line. */
export function outdentLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): LineEditResult {
  const { start, end } = selectedLineBounds(value, selectionStart, selectionEnd)
  const block = value.slice(start, end)
  const outdented = block
    .split('\n')
    .map((line) => line.replace(/^(\t| {1,2})/, ''))
    .join('\n')
  const newValue = value.slice(0, start) + outdented + value.slice(end)
  return { newValue, selStart: start, selEnd: start + outdented.length }
}

/** Toggles a literal prefix (e.g. "- ") on every non-blank selected line. */
export function toggleLinePrefix(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
): LineEditResult {
  const { start, end } = selectedLineBounds(value, selectionStart, selectionEnd)
  const lines = value.slice(start, end).split('\n')
  const allPrefixed = lines.every((line) => line.startsWith(prefix) || line.trim() === '')
  const toggled = lines
    .map((line) => {
      if (line.trim() === '') return line
      return allPrefixed ? line.slice(prefix.length) : prefix + line
    })
    .join('\n')
  const newValue = value.slice(0, start) + toggled + value.slice(end)
  return { newValue, selStart: start, selEnd: start + toggled.length }
}

const TODO_PREFIX = /^- \[[ x]\] /

/** Toggles a "- [ ] " checklist marker on every non-blank selected line. */
export function toggleTodoLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): LineEditResult {
  const { start, end } = selectedLineBounds(value, selectionStart, selectionEnd)
  const lines = value.slice(start, end).split('\n')
  const allTodo = lines.every((line) => TODO_PREFIX.test(line) || line.trim() === '')
  const toggled = lines
    .map((line) => {
      if (line.trim() === '') return line
      return allTodo ? line.replace(TODO_PREFIX, '') : '- [ ] ' + line
    })
    .join('\n')
  const newValue = value.slice(0, start) + toggled + value.slice(end)
  return { newValue, selStart: start, selEnd: start + toggled.length }
}

/** Deletes every selected line (or the current line) entirely. */
export function deleteLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): LineEditResult {
  const { start, end } = selectedLineBounds(value, selectionStart, selectionEnd)
  if (value[end] === '\n') {
    const newValue = value.slice(0, start) + value.slice(end + 1)
    return { newValue, selStart: start, selEnd: start }
  }
  const removeFrom = start > 0 ? start - 1 : start
  const newValue = value.slice(0, removeFrom) + value.slice(end)
  return { newValue, selStart: removeFrom, selEnd: removeFrom }
}
