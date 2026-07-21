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
      setInitialData(data && data.elements ? data : { elements: [], appState: {} })
    })
    return () => {
      cancelled = true
    }
  }, [projectId, item.id])

  const scheduleSave = () => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      const api = apiRef.current
      if (!api) return
      const elements = api.getSceneElements()
      const appState = api.getAppState()
      saveItemJson(projectId, item.id, 'whiteboard', {
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          zoom: appState.zoom,
        },
      })
    }, 600)
  }

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
