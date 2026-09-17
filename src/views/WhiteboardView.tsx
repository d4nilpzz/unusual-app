import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { useEffect, useRef, useState } from 'react'
import { EditorHeader } from '../components/EditorHeader'
import { loadItemJson, saveItemJson, renameItem } from '../lib/store'
import type { ProjectItem } from '../types'

interface WhiteboardViewProps {
  projectId: string
  item: ProjectItem
  onBack: () => void
  onRenamed: (name: string) => void
}

export function WhiteboardView({ projectId, item, onBack, onRenamed }: WhiteboardViewProps) {
  const [initialData, setInitialData] = useState<any | null>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    loadItemJson<any>(projectId, item.id, 'whiteboard').then((data) => {
      if (cancelled) return
      setInitialData(
        data && data.elements
          ? { ...data, files: data.files ?? {} }
          : { elements: [], appState: {}, files: {} },
      )
    })
    return () => {
      cancelled = true
    }
  }, [projectId, item.id])

  const save = () => {
    const api = apiRef.current
    if (!api) return
    const elements = api.getSceneElements()
    const appState = api.getAppState()
    // Only persist image files still referenced by the scene
    const allFiles = api.getFiles()
    const files: Record<string, unknown> = {}
    for (const el of elements) {
      if (el.type === 'image' && el.fileId && allFiles[el.fileId]) {
        files[el.fileId] = allFiles[el.fileId]
      }
    }
    saveItemJson(projectId, item.id, 'whiteboard', {
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom,
      },
      files,
    })
  }

  const scheduleSave = () => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      saveTimeout.current = null
      save()
    }, 600)
  }

  // Flush a pending save when the whiteboard is closed
  useEffect(() => {
    return () => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current)
        saveTimeout.current = null
        save()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, item.id])

  const handleRename = async (name: string) => {
    await renameItem(projectId, item.id, name)
    onRenamed(name)
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <EditorHeader name={item.name} onBack={onBack} onRename={handleRename} />
      <div className="excalidraw-wrapper flex-1">
        {initialData && (
          <Excalidraw
            excalidrawAPI={(api) => (apiRef.current = api)}
            initialData={initialData}
            theme="dark"
            onChange={scheduleSave}
          />
        )}
      </div>
    </div>
  )
}
