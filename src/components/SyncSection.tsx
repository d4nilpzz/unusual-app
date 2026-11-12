import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { Check, Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as sync from '../lib/sync'

type Phase =
  | { kind: 'loading' }
  | { kind: 'disconnected' }
  | { kind: 'token-entry' }
  | { kind: 'awaiting'; code: sync.DeviceCode }
  | { kind: 'connected' }

interface SyncSectionProps {
  /** Called after a sync that changed local files, so the app can reload. */
  onSynced?: (report: sync.SyncReport) => void
}

export function SyncSection({ onSynced }: SyncSectionProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [status, setStatus] = useState<sync.SyncStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<sync.SyncReport | null>(null)
  const [token, setToken] = useState('')
  const [copied, setCopied] = useState(false)
  const cancelled = useRef(false)

  useEffect(() => {
    cancelled.current = false
    sync
      .getStatus()
      .then((next) => {
        setStatus(next)
        setPhase({ kind: next.connected ? 'connected' : 'disconnected' })
      })
      .catch((err) => {
        setError(String(err))
        setPhase({ kind: 'disconnected' })
      })
    return () => {
      cancelled.current = true
    }
  }, [])

  const refreshStatus = async () => {
    const next = await sync.getStatus()
    setStatus(next)
    setPhase({ kind: next.connected ? 'connected' : 'disconnected' })
  }

  const handleConnect = async () => {
    setError(null)
    setBusy(true)
    try {
      const code = await sync.connectStart()
      setPhase({ kind: 'awaiting', code })
      void openExternal(code.verification_uri)
      pollUntilDone(code)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  // GitHub wants a poll no faster than `interval`, and asks for an extra
  // second whenever it answers `slowDown`.
  const pollUntilDone = async (code: sync.DeviceCode) => {
    let wait = Math.max(code.interval, 1) * 1000
    const deadline = Date.now() + code.expires_in * 1000

    while (!cancelled.current && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, wait))
      if (cancelled.current) return

      let result: sync.PollResult
      try {
        result = await sync.connectPoll(code.device_code)
      } catch (err) {
        setError(String(err))
        setPhase({ kind: 'disconnected' })
        return
      }

      if (result.status === 'granted') {
        await refreshStatus()
        void runSync()
        return
      }
      if (result.status === 'denied') {
        setError(result.message ?? 'GitHub refused the connection')
        setPhase({ kind: 'disconnected' })
        return
      }
      if (result.status === 'slowDown') wait += 1000
    }

    if (!cancelled.current) {
      setError('the code expired - try connecting again')
      setPhase({ kind: 'disconnected' })
    }
  }

  const handleToken = async () => {
    setError(null)
    setBusy(true)
    try {
      await sync.connectToken(token)
      setToken('')
      await refreshStatus()
      void runSync()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const runSync = async () => {
    setError(null)
    setBusy(true)
    try {
      const result = await sync.syncNow()
      setReport(result)
      setStatus((prev) => (prev ? { ...prev, repo: result.repo, lastSync: result.at } : prev))
      if (result.pulled > 0 || result.removed > 0) onSynced?.(result)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    cancelled.current = true
    setBusy(true)
    try {
      await sync.disconnect()
      setReport(null)
      cancelled.current = false
      await refreshStatus()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  // Opening a URL can be refused by the capability scope; say so instead of
  // leaving an unhandled rejection in the console.
  const openExternal = async (url: string) => {
    try {
      await sync.openInBrowser(url)
    } catch (err) {
      setError(`could not open ${url}: ${err}`)
    }
  }

  const copyCode = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be refused; the code is on screen anyway.
    }
  }

  return (
    <VStack gap={3}>
      <Heading level={4}>Cloud backup</Heading>

      {phase.kind === 'loading' && (
        <Text type="body" color="secondary">
          Checking...
        </Text>
      )}

      {(phase.kind === 'disconnected' || phase.kind === 'token-entry') && (
        <>
          <HStack justify="between" align="center">
            <Text type="body" color="secondary">
              Back up every project to a private GitHub repository.
            </Text>
            {status?.canUseDeviceFlow && (
              <Button
                label="Connect GitHub"
                variant="primary"
                size="sm"
                isDisabled={busy}
                isLoading={busy}
                onClick={handleConnect}
              />
            )}
          </HStack>

          {phase.kind === 'token-entry' || !status?.canUseDeviceFlow ? (
            <VStack gap={2}>
              <Text type="body" color="secondary">
                Paste a personal access token with access to your repositories.
              </Text>
              <HStack gap={2} align="center">
                <TextInput
                  label="Personal access token"
                  isLabelHidden
                  value={token}
                  onChange={setToken}
                  width="100%"
                />
                <Button
                  label="Save"
                  variant="secondary"
                  size="sm"
                  isDisabled={busy || !token.trim()}
                  onClick={handleToken}
                />
              </HStack>
            </VStack>
          ) : (
            <Button
              label="Use a token instead"
              variant="ghost"
              size="sm"
              onClick={() => setPhase({ kind: 'token-entry' })}
            />
          )}
        </>
      )}

      {phase.kind === 'awaiting' && (
        <VStack gap={2}>
          <Text type="body" color="secondary">
            Enter this code on GitHub to finish connecting:
          </Text>
          <HStack gap={2} align="center">
            <span className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-lg tracking-widest text-zinc-100">
              {phase.code.user_code}
            </span>
            <Button
              label={copied ? 'Copied' : 'Copy'}
              icon={copied ? <Check size={13} /> : <Copy size={13} />}
              variant="secondary"
              size="sm"
              onClick={() => copyCode(phase.code.user_code)}
            />
            <Button
              label="Open GitHub"
              icon={<ExternalLink size={13} />}
              variant="ghost"
              size="sm"
              onClick={() => openExternal(phase.code.verification_uri)}
            />
          </HStack>
          <Text type="body" color="secondary">
            Waiting for you to approve it...
          </Text>
          <Button
            label="Cancel"
            variant="ghost"
            size="sm"
            onClick={() => {
              cancelled.current = true
              setPhase({ kind: 'disconnected' })
              cancelled.current = false
            }}
          />
        </VStack>
      )}

      {phase.kind === 'connected' && (
        <VStack gap={2}>
          <HStack justify="between" align="center">
            <Text type="body">
              Connected as {status?.login ? `@${status.login}` : 'GitHub'}
            </Text>
            <Button
              label="Disconnect"
              variant="ghost"
              size="sm"
              isDisabled={busy}
              onClick={handleDisconnect}
            />
          </HStack>

          {status && !status.installed && (
            <VStack gap={2}>
              <Badge
                variant="warning"
                label="Authorised, but not installed on your account yet"
              />
              <HStack justify="between" align="center">
                <Text type="body" color="secondary">
                  Install it to let it create its own private repository.
                </Text>
                <Button
                  label="Install"
                  icon={<ExternalLink size={13} />}
                  variant="primary"
                  size="sm"
                  onClick={() => openExternal(status.installUrl)}
                />
              </HStack>
            </VStack>
          )}

          {status?.repo && (
            <HStack justify="between" align="center">
              <Text type="body" color="secondary">
                {status.repo}
              </Text>
              <Button
                label="Open repo"
                icon={<ExternalLink size={13} />}
                variant="ghost"
                size="sm"
                onClick={() => openExternal(sync.repoUrl(status.repo!))}
              />
            </HStack>
          )}

          <HStack justify="between" align="center">
            <Text type="body" color="secondary">
              Last sync: {sync.formatLastSync(status?.lastSync ?? null)}
            </Text>
            <Button
              label={busy ? 'Syncing...' : 'Sync now'}
              icon={<RefreshCw size={13} />}
              variant="secondary"
              size="sm"
              isDisabled={busy}
              isLoading={busy}
              onClick={runSync}
            />
          </HStack>

          {report && report.conflicts.length > 0 && (
            <Badge
              variant="warning"
              label={`${report.conflicts.length} file(s) changed on two devices - kept this one`}
            />
          )}
        </VStack>
      )}

      {error && <Badge variant="error" label={error.replace(/^Error:\s*/, '')} />}
    </VStack>
  )
}
