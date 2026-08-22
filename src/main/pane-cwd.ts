import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const paneCwds = new Map<string, string>()
let loaded = false
let persistTimer: NodeJS.Timeout | null = null

function filePath(): string {
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'pane-cwds.json')
}

function load(): void {
  if (loaded) return
  loaded = true
  try {
    if (!existsSync(filePath())) return
    const raw = JSON.parse(readFileSync(filePath(), 'utf8')) as unknown
    if (!raw || typeof raw !== 'object') return
    for (const [paneId, cwd] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof paneId === 'string' && typeof cwd === 'string' && cwd.length > 0) {
        paneCwds.set(paneId, cwd)
      }
    }
  } catch {
    // ignore corrupt file
  }
}

function persistSoon(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistPaneCwdsNow()
  }, 200)
}

export function persistPaneCwdsNow(): void {
  if (!loaded) return
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  writeFileSync(filePath(), JSON.stringify(Object.fromEntries(paneCwds)), 'utf8')
}

export function rememberPaneCwd(paneId: string, cwd: string): void {
  if (!paneId || !cwd) return
  load()
  if (paneCwds.get(paneId) === cwd) return
  paneCwds.set(paneId, cwd)
  persistSoon()
}

export function forgetPaneCwd(paneId: string): void {
  load()
  if (!paneCwds.delete(paneId)) return
  persistSoon()
}

export function savedPaneCwd(paneId: string): string | null {
  load()
  const cwd = paneCwds.get(paneId)
  if (!cwd || !existsSync(cwd)) return null
  return cwd
}
