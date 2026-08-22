import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { openDatabase, persistNow } from './db/client'
import { persistPaneCwdsNow } from './pane-cwd'
import { registerIpc } from './ipc'
import { disposeAllSessions, setTerminalListeners, startIdleWatcher } from './terminals'
import { createLauncherWindow, focusExistingWindow, sendToWorkspace } from './windows'
import { ensureGlyphSelfTask } from './tasks'
import { Ipc } from '@shared/ipc'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    focusExistingWindow()
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('app.glyph.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await openDatabase()
  await ensureGlyphSelfTask()
  registerIpc()

  setTerminalListeners({
    data: (paneId, data) => sendToWorkspace(Ipc.termData, { paneId, data }),
    status: (info) => {
      sendToWorkspace(Ipc.termStatus, info)
      sendToWorkspace(Ipc.termCwd, info)
    },
    exit: (paneId, exitCode) => sendToWorkspace(Ipc.termExit, { paneId, exitCode })
  })
  startIdleWatcher()

  createLauncherWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLauncherWindow()
    } else {
      focusExistingWindow()
    }
  })
})

app.on('before-quit', () => {
  persistNow()
  persistPaneCwdsNow()
  disposeAllSessions()
})

app.on('window-all-closed', () => {
  persistNow()
  persistPaneCwdsNow()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
