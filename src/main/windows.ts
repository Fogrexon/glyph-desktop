import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { isAppQuitting } from './lifetime'

let launcher: BrowserWindow | null = null
let workspace: BrowserWindow | null = null

function preloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

function load(win: BrowserWindow, hash: 'launcher' | 'workspace'): void {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${hash}`)
    return
  }
  void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
}

function guardClose(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (isAppQuitting()) return
    event.preventDefault()
    hideToTray()
  })
}

export function getLauncher(): BrowserWindow | null {
  return launcher
}

export function getWorkspace(): BrowserWindow | null {
  return workspace
}

export function createLauncherWindow(): BrowserWindow {
  if (launcher && !launcher.isDestroyed()) {
    launcher.show()
    launcher.focus()
    return launcher
  }

  launcher = new BrowserWindow({
    width: 460,
    height: 300,
    show: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: 'Glyph',
    backgroundColor: '#0c0d10',
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true
    }
  })

  launcher.on('ready-to-show', () => launcher?.show())
  launcher.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  guardClose(launcher)
  launcher.on('closed', () => {
    launcher = null
  })

  load(launcher, 'launcher')
  return launcher
}

export function enterWorkspace(): BrowserWindow {
  const source = launcher && !launcher.isDestroyed() ? launcher : BrowserWindow.getFocusedWindow()
  const display = source
    ? screen.getDisplayMatching(source.getBounds())
    : screen.getPrimaryDisplay()
  const { x, y, width, height } = display.bounds

  if (workspace && !workspace.isDestroyed()) {
    workspace.setBounds({ x, y, width, height })
    workspace.show()
    workspace.focus()
    applyFullscreen(workspace)
    if (launcher && !launcher.isDestroyed()) launcher.hide()
    return workspace
  }

  workspace = new BrowserWindow({
    x,
    y,
    width,
    height,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    fullscreen: process.platform !== 'darwin',
    simpleFullscreen: process.platform === 'darwin',
    backgroundColor: '#0c0d10',
    title: 'Glyph',
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true
    }
  })

  workspace.on('ready-to-show', () => {
    if (!workspace || workspace.isDestroyed()) return
    workspace.show()
    applyFullscreen(workspace)
  })
  workspace.on('restore', () => {
    if (workspace && !workspace.isDestroyed()) applyFullscreen(workspace)
  })
  workspace.on('show', () => {
    if (workspace && !workspace.isDestroyed() && !workspace.isMinimized()) {
      applyFullscreen(workspace)
    }
  })
  workspace.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  guardClose(workspace)
  workspace.on('closed', () => {
    workspace = null
  })

  load(workspace, 'workspace')
  if (launcher && !launcher.isDestroyed()) launcher.hide()
  return workspace
}

function applyFullscreen(win: BrowserWindow): void {
  win.setAlwaysOnTop(false)
  win.setVisibleOnAllWorkspaces(false)
  if (win.isKiosk()) win.setKiosk(false)
  if (process.platform === 'darwin') {
    if (!win.isSimpleFullScreen()) win.setSimpleFullScreen(true)
    return
  }
  if (!win.isFullScreen()) win.setFullScreen(true)
}

function releaseFullscreen(win: BrowserWindow): void {
  if (win.isKiosk()) win.setKiosk(false)
  if (win.isSimpleFullScreen()) win.setSimpleFullScreen(false)
  if (win.isFullScreen()) win.setFullScreen(false)
  win.setAlwaysOnTop(false)
  win.setVisibleOnAllWorkspaces(false)
}

function hideWorkspace(): void {
  if (workspace && !workspace.isDestroyed()) {
    releaseFullscreen(workspace)
    workspace.hide()
  }
}

/** Hide every window; PTYs and the workspace BrowserWindow stay alive. */
export function hideToTray(): void {
  hideWorkspace()
  if (launcher && !launcher.isDestroyed()) {
    launcher.hide()
  }
}

/** Tray / second-instance: always land on the launcher, keep terminals. */
export function showLauncher(): void {
  hideWorkspace()
  if (launcher && !launcher.isDestroyed()) {
    if (launcher.isMinimized()) launcher.restore()
    launcher.show()
    launcher.focus()
    return
  }
  createLauncherWindow()
}

/** Leave fullscreen workspace → launcher. Do not kill PTYs or destroy the window. */
export function exitWorkspace(): void {
  showLauncher()
}

/** Soft retreat used by the minimize shortcut — same as tray hide. */
export function minimizeApp(): void {
  hideToTray()
}

export function sendToWorkspace(channel: string, ...args: unknown[]): void {
  if (workspace && !workspace.isDestroyed()) {
    workspace.webContents.send(channel, ...args)
  }
}

export function focusExistingWindow(): void {
  showLauncher()
}
