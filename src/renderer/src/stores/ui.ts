import { create } from 'zustand'
import type { AgentStatus, TaskViewMode, TerminalSessionInfo } from '@shared/types'

const UI_STORAGE_KEY = 'glyph.ui.v1'

function loadSelectedTaskId(): string | null {
  try {
    const raw = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || 'null') as unknown
    if (!raw || typeof raw !== 'object') return null
    const id = (raw as { selectedTaskId?: unknown }).selectedTaskId
    return typeof id === 'string' && id.length > 0 ? id : null
  } catch {
    return null
  }
}

function persistSelectedTaskId(selectedTaskId: string | null): void {
  try {
    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ selectedTaskId }))
  } catch {
    // quota / private mode
  }
}

export type PaletteView = 'root' | 'task-new'
export type PaletteIntent = 'nl' | 'command' | 'search'
export type WorkspaceSurface = 'task' | 'settings'
export type SettingsSection = 'general' | 'shortcuts'

export interface Toast {
  id: string
  text: string
  kind?: 'info' | 'warn' | 'ok'
}

interface UiState {
  paletteOpen: boolean
  paletteView: PaletteView
  paletteIntent: PaletteIntent
  workspaceSurface: WorkspaceSurface
  settingsSection: SettingsSection
  viewMode: TaskViewMode
  selectedTaskId: string | null
  agentNote: string | null
  agentBusy: boolean
  toasts: Toast[]
  sessions: Record<string, TerminalSessionInfo>
  setPaletteOpen: (open: boolean) => void
  setPaletteView: (view: PaletteView) => void
  openSettings: (section?: SettingsSection) => void
  setSettingsSection: (section: SettingsSection) => void
  setViewMode: (mode: TaskViewMode) => void
  selectTask: (id: string | null) => void
  setAgentNote: (text: string | null) => void
  setAgentBusy: (busy: boolean) => void
  pushToast: (toast: Omit<Toast, 'id'> & { id?: string }) => void
  dismissToast: (id: string) => void
  upsertSession: (info: TerminalSessionInfo) => void
  removeSession: (paneId: string) => void
}

function createUiStore() {
  return create<UiState>((set) => ({
    paletteOpen: false,
    paletteView: 'root',
    paletteIntent: 'nl',
    workspaceSurface: 'task',
    settingsSection: 'general',
    viewMode: 'now',
    selectedTaskId: loadSelectedTaskId(),
    agentNote: null,
    agentBusy: false,
    toasts: [],
    sessions: {},
    setPaletteOpen: (paletteOpen) =>
      set(
        paletteOpen
          ? { paletteOpen: true }
          : { paletteOpen: false, paletteView: 'root', paletteIntent: 'nl' }
      ),
    setPaletteView: (paletteView) => set({ paletteView, paletteOpen: true }),
    openSettings: (section = 'general') =>
      set({
        workspaceSurface: 'settings',
        settingsSection: section,
        paletteOpen: false,
        paletteView: 'root'
      }),
    setSettingsSection: (settingsSection) => set({ settingsSection }),
    setViewMode: (viewMode) => set({ viewMode }),
    selectTask: (selectedTaskId) => {
      persistSelectedTaskId(selectedTaskId)
      set({ selectedTaskId, workspaceSurface: 'task' })
    },
    setAgentNote: (agentNote) => set({ agentNote }),
    setAgentBusy: (agentBusy) => set({ agentBusy }),
    pushToast: (toast) =>
      set((state) => ({
        toasts: [...state.toasts, { id: toast.id ?? crypto.randomUUID(), ...toast }]
      })),
    dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
    upsertSession: (info) =>
      set((state) => ({
        sessions: {
          ...state.sessions,
          [info.paneId]: {
            ...info,
            workTitle: info.workTitle ?? null,
            workItems: info.workItems ?? []
          }
        }
      })),
    removeSession: (paneId) =>
      set((state) => {
        const { [paneId]: _removed, ...rest } = state.sessions
        return { sessions: rest }
      })
  }))
}

const glyphWindow = window as Window & { __glyphUiStore2?: ReturnType<typeof createUiStore> }
export const useUi = glyphWindow.__glyphUiStore2 ?? createUiStore()
glyphWindow.__glyphUiStore2 = useUi

export function statusLabel(status: AgentStatus | undefined): string {
  switch (status) {
    case 'running':
      return '稼働中'
    case 'needs_human':
      return '判断待ち'
    case 'exited':
      return '終了'
    case 'idle':
      return '待機'
    default:
      return '未起動'
  }
}
