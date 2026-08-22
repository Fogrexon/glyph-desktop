import { contextBridge, ipcRenderer } from 'electron'
import { Ipc } from '@shared/ipc'
import type {
  AppSettings,
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
    run: (prompt: string) => ipcRenderer.invoke(Ipc.agentRun, prompt),
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
    testMcp: (json?: string) => ipcRenderer.invoke(Ipc.mcpTest, json)
  }
}

export type GlyphAPI = typeof api

contextBridge.exposeInMainWorld('glyph', api)
