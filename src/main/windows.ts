import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

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
    applyExclusive(workspace)
    workspace.show()
    workspace.focus()
    launcher?.hide()
    return workspace
  }

  workspace = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    autoHideMenuBar: true,
    fullscreen: true,
    simpleFullscreen: process.platform === 'darwin',
    backgroundColor: '#0c0d10',
    title: 'Glyph',
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true
    }
  })

  applyExclusive(workspace)
  workspace.on('ready-to-show', () => workspace?.show())
  workspace.on('restore', () => {
    if (workspace && !workspace.isDestroyed()) applyExclusive(workspace)
  })
  workspace.on('show', () => {
    if (workspace && !workspace.isDestroyed() && !workspace.isMinimized()) {
      applyExclusive(workspace)
    }
  })
  workspace.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  workspace.on('closed', () => {
    workspace = null
    if (launcher && !launcher.isDestroyed()) {
      launcher.show()
    }
  })

  load(workspace, 'workspace')
  launcher?.hide()
  return workspace
}

function applyExclusive(win: BrowserWindow): void {
  win.setAlwaysOnTop(true, 'screen-saver')
  if (process.platform === 'darwin') {
    win.setSimpleFullScreen(true)
  } else if (is.dev) {
    win.setFullScreen(true)
  } else {
    win.setKiosk(true)
  }
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
}

function releaseExclusive(win: BrowserWindow): void {
  if (win.isKiosk()) win.setKiosk(false)
  if (win.isSimpleFullScreen()) win.setSimpleFullScreen(false)
  if (win.isFullScreen()) win.setFullScreen(false)
  win.setAlwaysOnTop(false)
  win.setVisibleOnAllWorkspaces(false)
}

/** 終了せずに退避。ワークスペースのセッションはそのまま残す。 */
export function minimizeApp(): void {
  const win =
    workspace && !workspace.isDestroyed()
      ? workspace
      : launcher && !launcher.isDestroyed()
        ? launcher
        : BrowserWindow.getFocusedWindow()
  if (!win || win.isDestroyed()) return

  if (workspace && !workspace.isDestroyed() && win === workspace) {
    releaseExclusive(workspace)
  }
  win.minimize()
}

export function exitWorkspace(): void {
  if (workspace && !workspace.isDestroyed()) {
    releaseExclusive(workspace)
    workspace.close()
  }
  workspace = null
  if (launcher && !launcher.isDestroyed()) {
    launcher.show()
    launcher.focus()
  } else {
    createLauncherWindow()
  }
}

export function sendToWorkspace(channel: string, ...args: unknown[]): void {
  if (workspace && !workspace.isDestroyed()) {
    workspace.webContents.send(channel, ...args)
  }
}

export function focusExistingWindow(): void {
  const win =
    workspace && !workspace.isDestroyed()
      ? workspace
      : launcher && !launcher.isDestroyed()
        ? launcher
        : null
  if (!win) {
    createLauncherWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (workspace && !workspace.isDestroyed() && win === workspace) {
    applyExclusive(workspace)
  }
}
