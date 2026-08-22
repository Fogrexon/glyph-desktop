import { BrowserWindow, ipcMain } from 'electron'
import { Ipc } from '@shared/ipc'
import type {
  AppSettings,
  CreateMilestoneInput,
  CreateTaskInput,
  TaskViewMode,
  UpdateTaskInput
} from '@shared/types'
import { resetWorkspaceAgent, runWorkspaceAgent, testMcpConfig } from './agent'
import { loadSettings, patchSettings } from './settings'
import {
  addMilestone,
  archiveTask,
  completeMilestone,
  createTask,
  getTaskView,
  listTaskViews,
  updateMilestone,
  updateTask
} from './tasks'
import {
  ensureSession,
  getSession,
  killSession,
  listSessions,
  resizeSession,
  restartSession,
  writeSession
} from './terminals'
import { retreatToTray } from './tray'
import { enterWorkspace, exitWorkspace, getLauncher, getWorkspace, minimizeApp } from './windows'

export function registerIpc(): void {
  ipcMain.handle(Ipc.windowMode, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win === getWorkspace()) return 'workspace'
    if (win === getLauncher()) return 'launcher'
    return 'launcher'
  })
  ipcMain.handle(Ipc.windowEnter, () => {
    enterWorkspace()
  })
  ipcMain.handle(Ipc.windowExit, () => {
    exitWorkspace()
  })
  ipcMain.handle(Ipc.windowMinimize, () => {
    minimizeApp()
  })
  ipcMain.handle(Ipc.windowQuit, () => {
    // Soft quit: tray resident. Full kill is tray →「完全に終了」only.
    retreatToTray()
  })

  ipcMain.handle(Ipc.tasksList, async (_e, mode: TaskViewMode) => listTaskViews(mode))
  ipcMain.handle(Ipc.tasksGet, async (_e, id: string) => getTaskView(id))
  ipcMain.handle(Ipc.tasksCreate, async (_e, input: CreateTaskInput) => createTask(input))
  ipcMain.handle(Ipc.tasksUpdate, async (_e, id: string, patch: UpdateTaskInput) =>
    updateTask(id, patch)
  )
  ipcMain.handle(Ipc.tasksArchive, async (_e, id: string) => archiveTask(id))
  ipcMain.handle(Ipc.milestoneAdd, async (_e, taskId: string, input: CreateMilestoneInput) =>
    addMilestone(taskId, input)
  )
  ipcMain.handle(Ipc.milestoneComplete, async (_e, id: string) => completeMilestone(id))
  ipcMain.handle(
    Ipc.milestoneUpdate,
    async (_e, id: string, patch: CreateMilestoneInput & { status?: 'pending' | 'done' }) =>
      updateMilestone(id, patch)
  )

  ipcMain.handle(Ipc.termEnsure, (_e, paneId: string) => ensureSession(paneId))
  ipcMain.handle(Ipc.termRestart, (_e, paneId: string) => restartSession(paneId))
  ipcMain.handle(Ipc.termKill, (_e, paneId: string) => {
    killSession(paneId, true)
  })
  ipcMain.handle(Ipc.termWrite, (_e, paneId: string, data: string) => {
    writeSession(paneId, data)
  })
  ipcMain.handle(Ipc.termResize, (_e, paneId: string, cols: number, rows: number) => {
    resizeSession(paneId, cols, rows)
  })
  ipcMain.handle(Ipc.termGet, (_e, paneId: string) => getSession(paneId))
  ipcMain.handle(Ipc.termList, () => listSessions())

  ipcMain.handle(Ipc.agentRun, async (event, prompt: string) =>
    runWorkspaceAgent(prompt, (payload) => {
      event.sender.send(Ipc.agentEvent, payload)
    })
  )
  ipcMain.handle(Ipc.agentReset, () => {
    resetWorkspaceAgent()
  })

  ipcMain.handle(Ipc.settingsGet, () => loadSettings())
  ipcMain.handle(Ipc.settingsSet, (_e, patch: Partial<AppSettings>) => patchSettings(patch))
  ipcMain.handle(Ipc.mcpTest, (_e, json?: string) => {
    const text = json ?? loadSettings().mcpServersJson
    return testMcpConfig(text)
  })
}
