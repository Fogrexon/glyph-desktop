import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { openDatabase, persistNow } from './db/client'
import { persistPaneCwdsNow } from './pane-cwd'
import { registerIpc } from './ipc'
import {
  disposeAllSessions,
  setTerminalListeners,
  startIdleWatcher,
  warmSession
} from './terminals'
import { createAppTray, destroyAppTray } from './tray'
import { disposeAllBrowsers } from './browser-views'
import { createLauncherWindow, focusExistingWindow, sendToWorkspace } from './windows'
import { ensureGlyphSelfTask, listTaskViews } from './tasks'
import { Ipc } from '@shared/ipc'
import { markAppQuitting } from './lifetime'
import { warmupTitleEngine } from './llm/local-title'
import { loadSettings } from './settings'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    focusExistingWindow()
  })
}

/** Spawn PTYs for active tasks before the workspace opens. */
async function warmTerminals(): Promise<void> {
  const tasks = await listTaskViews('all')
  for (const task of tasks) {
    try {
      warmSession(task.id)
    } catch {
      // ignore per-task spawn failures; workspace can retry via ensure
    }
  }
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

  createAppTray()
  createLauncherWindow()
  void warmTerminals()
  if (loadSettings().titleMode === 'local') warmupTitleEngine()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLauncherWindow()
    } else {
      focusExistingWindow()
    }
  })
})

app.on('before-quit', () => {
  // Runs before window close events — allow close handlers to destroy windows.
  markAppQuitting()
  persistNow()
  persistPaneCwdsNow()
  disposeAllSessions()
  disposeAllBrowsers()
  destroyAppTray()
})

// Stay resident in the tray; only 「完全に終了」 quits.
app.on('window-all-closed', () => {
  persistNow()
  persistPaneCwdsNow()
})
