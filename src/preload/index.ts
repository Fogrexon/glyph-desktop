import { contextBridge, ipcRenderer } from 'electron'
import { Ipc } from '@shared/ipc'
import type {
  AgentContext,
  AppSettings,
  BrowserBounds,
  BrowserChord,
  CreateMilestoneInput,
  CreateTaskInput,
  TaskViewMode,
  UpdateTaskInput
} from '@shared/types'

const api = {
  window: {
    mode: () => ipcRenderer.invoke(Ipc.windowMode) as Promise<'launcher' | 'workspace'>,
    enterWorkspace: () => ipcRenderer.invoke(Ipc.windowEnter),
    exitWorkspace: () => ipcRenderer.invoke(Ipc.windowExit),
    minimize: () => ipcRenderer.invoke(Ipc.windowMinimize),
    quit: () => ipcRenderer.invoke(Ipc.windowQuit)
  },
  tasks: {
    list: (mode: TaskViewMode) => ipcRenderer.invoke(Ipc.tasksList, mode),
    get: (id: string) => ipcRenderer.invoke(Ipc.tasksGet, id),
    create: (input: CreateTaskInput) => ipcRenderer.invoke(Ipc.tasksCreate, input),
    update: (id: string, patch: UpdateTaskInput) => ipcRenderer.invoke(Ipc.tasksUpdate, id, patch),
    archive: (id: string) => ipcRenderer.invoke(Ipc.tasksArchive, id),
    addMilestone: (taskId: string, input: CreateMilestoneInput) =>
      ipcRenderer.invoke(Ipc.milestoneAdd, taskId, input),
    completeMilestone: (id: string) => ipcRenderer.invoke(Ipc.milestoneComplete, id)
  },
  terminals: {
    ensure: (paneId: string) => ipcRenderer.invoke(Ipc.termEnsure, paneId),
    replay: (paneId: string) => ipcRenderer.invoke(Ipc.termReplay, paneId) as Promise<string>,
    restart: (paneId: string) => ipcRenderer.invoke(Ipc.termRestart, paneId),
    kill: (paneId: string) => ipcRenderer.invoke(Ipc.termKill, paneId),
    write: (paneId: string, data: string) => ipcRenderer.invoke(Ipc.termWrite, paneId, data),
    resize: (paneId: string, cols: number, rows: number) =>
      ipcRenderer.invoke(Ipc.termResize, paneId, cols, rows),
    get: (paneId: string) => ipcRenderer.invoke(Ipc.termGet, paneId),
    list: () => ipcRenderer.invoke(Ipc.termList),
    onData: (cb: (payload: { paneId: string; data: string }) => void) => {
      const listener = (_: unknown, payload: { paneId: string; data: string }): void => cb(payload)
      ipcRenderer.on(Ipc.termData, listener)
      return (): void => {
        ipcRenderer.removeListener(Ipc.termData, listener)
      }
    },
    onStatus: (cb: (info: import('@shared/types').TerminalSessionInfo) => void) => {
      const listener = (_: unknown, info: import('@shared/types').TerminalSessionInfo): void =>
        cb(info)
      ipcRenderer.on(Ipc.termStatus, listener)
      return (): void => {
        ipcRenderer.removeListener(Ipc.termStatus, listener)
      }
    },
    onCwd: (cb: (info: import('@shared/types').TerminalSessionInfo) => void) => {
      const listener = (_: unknown, info: import('@shared/types').TerminalSessionInfo): void =>
        cb(info)
      ipcRenderer.on(Ipc.termCwd, listener)
      return (): void => {
        ipcRenderer.removeListener(Ipc.termCwd, listener)
      }
    },
    onExit: (cb: (payload: { paneId: string; exitCode: number }) => void) => {
      const listener = (_: unknown, payload: { paneId: string; exitCode: number }): void =>
        cb(payload)
      ipcRenderer.on(Ipc.termExit, listener)
      return (): void => {
        ipcRenderer.removeListener(Ipc.termExit, listener)
      }
    }
  },
  agent: {
    run: (prompt: string, context?: AgentContext) =>
      ipcRenderer.invoke(Ipc.agentRun, prompt, context),
    reset: () => ipcRenderer.invoke(Ipc.agentReset),
    onEvent: (cb: (event: import('@shared/types').AgentStreamEvent) => void) => {
      const listener = (_: unknown, payload: import('@shared/types').AgentStreamEvent): void =>
        cb(payload)
      ipcRenderer.on(Ipc.agentEvent, listener)
      return (): void => {
        ipcRenderer.removeListener(Ipc.agentEvent, listener)
      }
    }
  },
  settings: {
    get: () => ipcRenderer.invoke(Ipc.settingsGet) as Promise<AppSettings>,
    set: (patch: Partial<AppSettings>) =>
      ipcRenderer.invoke(Ipc.settingsSet, patch) as Promise<AppSettings>,
    testMcp: (json?: string) => ipcRenderer.invoke(Ipc.mcpTest, json),
    titleEngineStatus: () =>
      ipcRenderer.invoke(Ipc.titleEngineStatus) as Promise<{
        ready: boolean
        loading: boolean
        message: string
      }>
  },
  browser: {
    ensure: (tabId: string, url: string) => ipcRenderer.invoke(Ipc.browserEnsure, tabId, url),
    load: (tabId: string, url: string) => ipcRenderer.invoke(Ipc.browserLoad, tabId, url),
    setBounds: (tabId: string, bounds: BrowserBounds) =>
      ipcRenderer.invoke(Ipc.browserBounds, tabId, bounds),
    setVisible: (tabId: string, visible: boolean) =>
      ipcRenderer.invoke(Ipc.browserVisible, tabId, visible),
    hideAll: () => ipcRenderer.invoke(Ipc.browserHideAll),
    destroy: (tabId: string) => ipcRenderer.invoke(Ipc.browserDestroy, tabId),
    onNavigated: (cb: (payload: { tabId: string; url: string }) => void) => {
      const listener = (_: unknown, payload: { tabId: string; url: string }): void => cb(payload)
      ipcRenderer.on(Ipc.browserNavigated, listener)
      return (): void => {
        ipcRenderer.removeListener(Ipc.browserNavigated, listener)
      }
    },
    onTitle: (cb: (payload: { tabId: string; title: string; url: string }) => void) => {
      const listener = (_: unknown, payload: { tabId: string; title: string; url: string }): void =>
        cb(payload)
      ipcRenderer.on(Ipc.browserTitle, listener)
      return (): void => {
        ipcRenderer.removeListener(Ipc.browserTitle, listener)
      }
    },
    onOpenTab: (cb: (payload: { openerId: string; url: string }) => void) => {
      const listener = (_: unknown, payload: { openerId: string; url: string }): void => cb(payload)
      ipcRenderer.on(Ipc.browserOpenTab, listener)
      return (): void => {
        ipcRenderer.removeListener(Ipc.browserOpenTab, listener)
      }
    },
    onInput: (cb: (chord: BrowserChord) => void) => {
      const listener = (_: unknown, chord: BrowserChord): void => cb(chord)
      ipcRenderer.on(Ipc.browserInput, listener)
      return (): void => {
        ipcRenderer.removeListener(Ipc.browserInput, listener)
      }
    }
  }
}

export type GlyphAPI = typeof api

contextBridge.exposeInMainWorld('glyph', api)

function watchRootForRecover(): void {
  const root = document.getElementById('root')
  if (!root) return
  let hadUi = false
  const key = 'glyph.rootReload'
  new MutationObserver(() => {
    if (root.childElementCount > 0) {
      hadUi = true
      sessionStorage.removeItem(key)
      return
    }
    if (!hadUi || !document.body.classList.contains('app-ready')) return
    const n = Number(sessionStorage.getItem(key) || '0')
    if (n >= 1) return
    sessionStorage.setItem(key, String(n + 1))
    location.reload()
  }).observe(root, { childList: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watchRootForRecover)
} else {
  watchRootForRecover()
}
