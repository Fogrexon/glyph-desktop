import { GLYPH_SELF_TASK_ID } from '@shared/ids'
import type { AgentContext, AgentUiAction } from '@shared/types'
import { useAgentChat } from '@renderer/stores/agentChat'
import { usePanes } from '@renderer/stores/panes'
import { useUi } from '@renderer/stores/ui'
import { refreshTasks } from '@renderer/stores/workspace'

export function currentAgentContext(): AgentContext {
  const ui = useUi.getState()
  const panes = usePanes.getState()
  const taskId = ui.selectedTaskId
  return {
    selectedTaskId: taskId,
    viewMode: ui.viewMode,
    activePaneId: taskId ? (panes.activePane[taskId] ?? taskId) : null
  }
}

export function applyWorkspaceAction(action: AgentUiAction): void {
  const ui = useUi.getState()
  const panes = usePanes.getState()
  const taskId = ui.selectedTaskId

  switch (action.type) {
    case 'selectTask':
      ui.selectTask(action.taskId)
      void refreshTasks(ui.viewMode)
      return
    case 'setViewMode':
      ui.setViewMode(action.mode)
      void refreshTasks(action.mode)
      return
    case 'openSettings':
      ui.openSettings('general')
      return
    case 'openShortcuts':
      ui.openSettings('shortcuts')
      return
    case 'openTaskEditor':
      ui.setPaletteView('task-new')
      return
    case 'closePalette':
      ui.setPaletteOpen(false)
      return
    case 'splitPane':
      if (taskId) panes.splitActive(taskId, action.dir)
      ui.setPaletteOpen(false)
      return
    case 'closePane':
      if (!taskId) return
      if (!panes.closeActive(taskId)) {
        ui.pushToast({ text: '最後のペインは閉じられません', kind: 'info' })
      }
      ui.setPaletteOpen(false)
      return
    case 'focusPane':
      if (!taskId) return
      if (action.dir === 'next') panes.focusCycle(taskId, 1)
      else if (action.dir === 'prev') panes.focusCycle(taskId, -1)
      else panes.focusDir(taskId, action.dir)
      return
    case 'toast':
      ui.pushToast({ text: action.text, kind: action.kind })
      return
    default:
      return
  }
}

export function openGlyphSelf(): void {
  const ui = useUi.getState()
  ui.selectTask(GLYPH_SELF_TASK_ID)
  void refreshTasks(ui.viewMode)
  ui.setPaletteOpen(false)
}

export function resetAgentChat(): void {
  useAgentChat.getState().reset()
  void window.glyph.agent?.reset()
}
