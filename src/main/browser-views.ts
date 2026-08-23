import { BrowserWindow, WebContentsView } from 'electron'
import { Ipc } from '@shared/ipc'
import type { BrowserBounds } from '@shared/types'

let host: BrowserWindow | null = null

export function bindBrowserHost(win: BrowserWindow | null): void {
  host = win && !win.isDestroyed() ? win : null
}

function send(channel: string, payload: unknown): void {
  if (!host || host.isDestroyed()) return
  host.webContents.send(channel, payload)
}

const PARTITION = 'persist:glyph-browser'

interface BrowserEntry {
  view: WebContentsView
  attached: boolean
}

const views = new Map<string, BrowserEntry>()

function attach(entry: BrowserEntry): void {
  if (!host || host.isDestroyed() || entry.attached) return
  host.contentView.addChildView(entry.view)
  entry.attached = true
}

function detach(entry: BrowserEntry): void {
  if (!entry.attached) return
  if (host && !host.isDestroyed()) {
    try {
      host.contentView.removeChildView(entry.view)
    } catch {
      // already gone
    }
  }
  entry.attached = false
}

function fromInput(input: Electron.Input): {
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
} {
  return {
    key: input.key.length === 1 ? input.key.toLowerCase() : input.key.toLowerCase(),
    ctrl: Boolean(input.control),
    shift: Boolean(input.shift),
    alt: Boolean(input.alt),
    meta: Boolean(input.meta)
  }
}

function stealFromBrowser(input: Electron.Input): boolean {
  if (input.type !== 'keyDown') return false
  const cmd = process.platform === 'darwin' ? input.meta : input.control
  const key = input.key.toLowerCase()
  if (input.control && key === 'tab') return true
  if (!cmd) return false
  if (!input.shift && !input.alt && ['c', 'v', 'x', 'a', 'z', 'y'].includes(key)) return false
  if (key === 'w' && !input.shift && !input.alt) return false
  if (['k', 't', 'b', 'd', 'p', ',', 'm', 'r'].includes(key)) return true
  if (key === 'w' && (input.shift || input.alt)) return true
  if (key === 'escape') return true
  if (key.startsWith('arrow')) return true
  return false
}

function createView(tabId: string): BrowserEntry {
  const view = new WebContentsView({
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  view.setBackgroundColor('#0e1016')
  view.setVisible(false)
  view.webContents.setWindowOpenHandler((details) => {
    send(Ipc.browserOpenTab, { openerId: tabId, url: details.url })
    return { action: 'deny' }
  })
  const emitUrl = (url: string): void => {
    send(Ipc.browserNavigated, { tabId, url })
  }
  view.webContents.on('did-navigate', (_e, url) => emitUrl(url))
  view.webContents.on('did-navigate-in-page', (_e, url) => emitUrl(url))
  view.webContents.on('page-title-updated', (_e, title) => {
    send(Ipc.browserTitle, { tabId, title, url: view.webContents.getURL() })
  })
  view.webContents.on('before-input-event', (event, input) => {
    if (!stealFromBrowser(input)) return
    event.preventDefault()
    send(Ipc.browserInput, fromInput(input))
  })
  return { view, attached: false }
}

export function ensureBrowser(tabId: string, url: string): void {
  let entry = views.get(tabId)
  if (!entry) {
    entry = createView(tabId)
    views.set(tabId, entry)
    const target = url.trim() || 'about:blank'
    void entry.view.webContents.loadURL(target)
  }
  attach(entry)
}

export function loadBrowser(tabId: string, url: string): void {
  ensureBrowser(tabId, url)
  const entry = views.get(tabId)
  if (!entry) return
  const target = url.trim() || 'about:blank'
  void entry.view.webContents.loadURL(target)
}

export function setBrowserBounds(tabId: string, bounds: BrowserBounds): void {
  const entry = views.get(tabId)
  if (!entry) return
  attach(entry)
  const x = Math.max(0, Math.round(bounds.x))
  const y = Math.max(0, Math.round(bounds.y))
  const width = Math.max(0, Math.round(bounds.width))
  const height = Math.max(0, Math.round(bounds.height))
  entry.view.setBounds({ x, y, width, height })
}

export function setBrowserVisible(tabId: string, visible: boolean): void {
  const entry = views.get(tabId)
  if (!entry) return
  if (visible) attach(entry)
  entry.view.setVisible(visible)
  if (!visible) {
    entry.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  }
}

export function hideAllBrowsers(): void {
  for (const [tabId] of views) setBrowserVisible(tabId, false)
}

export function destroyBrowser(tabId: string): void {
  const entry = views.get(tabId)
  if (!entry) return
  detach(entry)
  try {
    entry.view.webContents.close()
  } catch {
    // ignore
  }
  views.delete(tabId)
}

export function disposeAllBrowsers(): void {
  for (const tabId of [...views.keys()]) destroyBrowser(tabId)
}
