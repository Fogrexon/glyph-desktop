import {
  eventToChord,
  isModifierKey,
  isTypingTarget,
  matchAction,
  type ShortcutAction
} from '@renderer/lib/keymap'
import { RECOVER_EVENT } from '@renderer/lib/recoverWorkspace'
import { useKeymap } from '@renderer/stores/keymap'
import { usePanes } from '@renderer/stores/panes'
import { restoreTermOutput } from '@renderer/lib/termHosts'
import { useUi } from '@renderer/stores/ui'

export function runShortcutAction(action: ShortcutAction): void {
  const ui = useUi.getState()
  const panes = usePanes.getState()
  const taskId = ui.selectedTaskId

  switch (action) {
    case 'palette.toggle':
      window.dispatchEvent(new Event(RECOVER_EVENT))
      if (!ui.paletteOpen || ui.paletteView !== 'root') {
        ui.setPaletteView('root')
        return
      }
      ui.setPaletteOpen(false)
      return
    case 'settings.open':
      ui.openSettings('general')
      return
    case 'workspace.exit':
      void window.glyph.window.exitWorkspace()
      return
    case 'app.minimize':
      void window.glyph.window.minimize()
      return
    case 'term.splitRight':
      if (!taskId) return
      panes.splitActive(taskId, 'horizontal')
      return
    case 'term.splitDown':
      if (!taskId) return
      panes.splitActive(taskId, 'vertical')
      return
    case 'term.closePane':
      if (!taskId) return
      if (!panes.closeActive(taskId)) {
        ui.pushToast({ text: '最後のペインは閉じられません', kind: 'info' })
      }
      return
    case 'term.focusLeft':
      if (taskId) panes.focusDir(taskId, 'left')
      return
    case 'term.focusRight':
      if (taskId) panes.focusDir(taskId, 'right')
      return
    case 'term.focusUp':
      if (taskId) panes.focusDir(taskId, 'up')
      return
    case 'term.focusDown':
      if (taskId) panes.focusDir(taskId, 'down')
      return
    case 'term.focusNext':
      if (taskId) panes.focusCycle(taskId, 1)
      return
    case 'term.focusPrev':
      if (taskId) panes.focusCycle(taskId, -1)
      return
    case 'term.restart': {
      if (!taskId) return
      const paneId = panes.activePane[taskId] ?? taskId
      void window.glyph.terminals.restart(paneId).then(() => restoreTermOutput(paneId))
      return
    }
    default:
      return
  }
}

export function handleGlobalKeydown(e: KeyboardEvent): void {
  if (isModifierKey(e.key)) return

  const keymap = useKeymap.getState()
  if (keymap.recording) {
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    if (e.key === 'Escape') {
      keymap.cancelRecording()
      return
    }
    keymap.setChord(keymap.recording, eventToChord(e))
    return
  }

  const action = matchAction(eventToChord(e), keymap.map)
  if (!action) return
  if (isTypingTarget(e.target) && action !== 'palette.toggle' && action !== 'settings.open') {
    return
  }

  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
  runShortcutAction(action)
}
