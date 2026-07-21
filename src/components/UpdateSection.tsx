import { getVersion } from '@tauri-apps/api/app'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { useEffect, useState } from 'react'

type Status =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; update: Update }
  | { kind: 'installing'; progress: number | null }
  | { kind: 'ready-to-restart' }
  | { kind: 'error'; message: string }

export function UpdateSection() {
  const [version, setVersion] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  useEffect(() => {
    getVersion().then(setVersion)
  }, [])

  const handleCheck = async () => {
    setStatus({ kind: 'checking' })
    try {
      const update = await check()
      setStatus(update ? { kind: 'available', update } : { kind: 'up-to-date' })
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const handleInstall = async (update: Update) => {
    setStatus({ kind: 'installing', progress: null })
    try {
      let downloaded = 0
      let total: number | undefined
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          setStatus({
            kind: 'installing',
            progress: total ? Math.round((downloaded / total) * 100) : null,
          })
        }
      })
      setStatus({ kind: 'ready-to-restart' })
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <VStack gap={3}>
      <Heading level={4}>Updates</Heading>
      <HStack justify="between" align="center">
        <Text type="body">Current version: {version}</Text>
        {status.kind === 'idle' || status.kind === 'up-to-date' || status.kind === 'error' ? (
          <Button label="Check for updates" variant="secondary" size="sm" onClick={handleCheck} />
        ) : status.kind === 'checking' ? (
          <Button label="Checking..." variant="secondary" size="sm" isDisabled isLoading />
        ) : null}
      </HStack>

      {status.kind === 'up-to-date' && (
        <Badge variant="success" label="You're on the latest version" />
      )}

      {status.kind === 'error' && <Badge variant="error" label={status.message} />}

      {status.kind === 'available' && (
        <HStack justify="between" align="center">
          <Text type="body" color="secondary">
            Version {status.update.version} is available
          </Text>
          <Button
            label="Download and install"
            variant="primary"
            size="sm"
            onClick={() => handleInstall(status.update)}
          />
        </HStack>
      )}

      {status.kind === 'installing' && (
        <Text type="body" color="secondary">
          {status.progress != null ? `Installing... ${status.progress}%` : 'Installing...'}
        </Text>
      )}

      {status.kind === 'ready-to-restart' && (
        <HStack justify="between" align="center">
          <Text type="body">Update installed. Restart to apply it.</Text>
          <Button label="Restart now" variant="primary" size="sm" onClick={() => relaunch()} />
        </HStack>
      )}
    </VStack>
  )
}
