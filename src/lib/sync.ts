import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'

export interface SyncStatus {
  connected: boolean
  /** Authorised but not installed on any account, so the token can reach no
   *  repository yet. */
  installed: boolean
  login: string | null
  repo: string | null
  lastSync: number | null
  canUseDeviceFlow: boolean
  installUrl: string
}

export interface SyncReport {
  repo: string
  pulled: number
  pushed: number
  removed: number
  /** Files edited on two devices at once. The local copy was kept; the other
   *  one is still in the repository history. */
  conflicts: string[]
  commit: string | null
  at: number
}

export interface DeviceCode {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export interface PollResult {
  status: 'pending' | 'slowDown' | 'granted' | 'denied'
  login: string | null
  message: string | null
}

export function getStatus(): Promise<SyncStatus> {
  return invoke<SyncStatus>('sync_status')
}

export function connectStart(): Promise<DeviceCode> {
  return invoke<DeviceCode>('sync_connect_start')
}

export function connectPoll(deviceCode: string): Promise<PollResult> {
  return invoke<PollResult>('sync_connect_poll', { deviceCode })
}

export function connectToken(token: string): Promise<string> {
  return invoke<string>('sync_connect_token', { token })
}

export function disconnect(): Promise<void> {
  return invoke<void>('sync_disconnect')
}

export function syncNow(): Promise<SyncReport> {
  return invoke<SyncReport>('sync_now')
}

export function openInBrowser(url: string): Promise<void> {
  return openUrl(url)
}

export function repoUrl(repo: string): string {
  return `https://github.com/${repo}`
}

export function formatLastSync(at: number | null): string {
  if (!at) return 'never'
  const seconds = Math.floor(Date.now() / 1000) - at
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  return new Date(at * 1000).toLocaleDateString()
}
