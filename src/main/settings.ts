import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings, LlmProviderId } from '@shared/types'

const DEFAULTS: AppSettings = {
  provider: 'openrouter',
  model: 'google/gemini-2.5-flash',
  vertexProject: process.env.GOOGLE_CLOUD_PROJECT || '',
  vertexLocation: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
  mcpServersJson: '{\n  "mcpServers": {}\n}\n',
  openrouterApiKey: '',
  geminiApiKey: '',
  titleMode: 'local',
}

interface PersistedFile {
  provider: LlmProviderId
  model: string
  vertexProject: string
  vertexLocation: string
  mcpServersJson: string
  titleMode?: 'heuristic' | 'local' | 'ollama'
  secrets?: string
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function encodeSecrets(keys: { openrouterApiKey: string; geminiApiKey: string }): string {
  const json = JSON.stringify(keys)
  if (safeStorage.isEncryptionAvailable()) {
    return `enc:${safeStorage.encryptString(json).toString('base64')}`
  }
  return `plain:${json}`
}

function decodeSecrets(blob: string | undefined): {
  openrouterApiKey: string
  geminiApiKey: string
} {
  const empty = { openrouterApiKey: '', geminiApiKey: '' }
  if (!blob) return empty
  try {
    if (blob.startsWith('enc:')) {
      const buf = Buffer.from(blob.slice(4), 'base64')
      return { ...empty, ...JSON.parse(safeStorage.decryptString(buf)) }
    }
    if (blob.startsWith('plain:')) {
      return { ...empty, ...JSON.parse(blob.slice(6)) }
    }
  } catch {
    return empty
  }
  return empty
}

export function loadSettings(): AppSettings {
  mkdirSync(app.getPath('userData'), { recursive: true })
  if (!existsSync(settingsPath())) return { ...DEFAULTS }
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), 'utf8')) as PersistedFile
    const secrets = decodeSecrets(parsed.secrets)
    return {
      provider: parsed.provider ?? DEFAULTS.provider,
      model: parsed.model ?? DEFAULTS.model,
      vertexProject: parsed.vertexProject ?? DEFAULTS.vertexProject,
      vertexLocation: parsed.vertexLocation ?? DEFAULTS.vertexLocation,
      mcpServersJson: parsed.mcpServersJson ?? DEFAULTS.mcpServersJson,
      openrouterApiKey: secrets.openrouterApiKey,
      geminiApiKey: secrets.geminiApiKey,
      titleMode: parsed.titleMode === 'heuristic' ? 'heuristic' : 'local'
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(next: AppSettings): AppSettings {
  const file: PersistedFile = {
    provider: next.provider,
    model: next.model,
    vertexProject: next.vertexProject,
    vertexLocation: next.vertexLocation,
    mcpServersJson: next.mcpServersJson,
    titleMode: next.titleMode,
    secrets: encodeSecrets({
      openrouterApiKey: next.openrouterApiKey,
      geminiApiKey: next.geminiApiKey
    })
  }
  writeFileSync(settingsPath(), JSON.stringify(file, null, 2), 'utf8')
  return next
}

export function patchSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadSettings()
  return saveSettings({ ...current, ...patch })
}

export function defaultModelFor(provider: LlmProviderId): string {
  if (provider === 'openrouter') return 'google/gemini-2.5-flash'
  return 'gemini-2.5-flash'
}
