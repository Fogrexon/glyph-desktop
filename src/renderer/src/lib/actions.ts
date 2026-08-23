import {
  eventToChord,
  isModifierKey,
  isTypingTarget,
  matchAction,
  mergeKeymap,
  type ShortcutAction
} from '@renderer/lib/keymap'
import { RECOVER_EVENT } from '@renderer/lib/recoverWorkspace'
import { useKeymap } from '@renderer/stores/keymap'
import { usePanes, activeTabForTask } from '@renderer/stores/panes'
import { restoreTermOutput } from '@renderer/lib/termHosts'
import { useUi, type PaletteIntent } from '@renderer/stores/ui'
import { cycleSelectedTask } from '@renderer/lib/workspaceOps'

function togglePalette(intent: PaletteIntent): void {
  window.dispatchEvent(new Event(RECOVER_EVENT))
  const ui = useUi.getState()
  const current = ui.paletteIntent ?? 'nl'
  if (ui.paletteOpen && ui.paletteView === 'root' && current === intent) {
    ui.setPaletteOpen(false)
    return
  }
  useUi.setState({
    paletteOpen: true,
    paletteView: 'root',
    paletteIntent: intent
  })
}

export function runShortcutAction(action: ShortcutAction): void {
  const ui = useUi.getState()
  const panes = usePanes.getState()
  const taskId = ui.selectedTaskId

  switch (action) {
    case 'palette.toggle':
      togglePalette('nl')
      return
    case 'palette.commands':
      togglePalette('command')
      return
    case 'palette.search':
      togglePalette('search')
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
    case 'task.focusNext':
      cycleSelectedTask(1)
      return
    case 'task.focusPrev':
      cycleSelectedTask(-1)
      return
    case 'term.splitRight':
      if (!taskId) return
      panes.splitActive(taskId, 'horizontal')
      return
    case 'term.splitDown':
      if (!taskId) return
      panes.splitActive(taskId, 'vertical')
      return
    case 'term.newTab':
      if (!taskId) return
      panes.addTab(taskId, 'terminal')
      return
    case 'browser.splitRight':
      if (!taskId) return
      panes.splitActive(taskId, 'horizontal', 'browser', 'about:blank')
      return
    case 'browser.splitDown':
      if (!taskId) return
      panes.splitActive(taskId, 'vertical', 'browser', 'about:blank')
      return
    case 'pane.closeTab':
      if (!taskId) return
      if (!panes.closeActiveTab(taskId)) {
        ui.pushToast({ text: '最後のペインは閉じられません', kind: 'info' })
      }
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
      const tab = activeTabForTask(taskId)
      const paneId = tab?.kind === 'terminal' ? tab.id : null
      if (!paneId) {
        ui.pushToast({ text: 'ターミナルタブを選んでください', kind: 'info' })
        return
      }
      void window.glyph.terminals.restart(paneId).then(() => restoreTermOutput(paneId, true))
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

  const action = matchAction(eventToChord(e), mergeKeymap(keymap.map))
  if (!action) return
  if (
    isTypingTarget(e.target) &&
    action !== 'palette.toggle' &&
    action !== 'palette.commands' &&
    action !== 'palette.search' &&
    action !== 'settings.open'
  ) {
    return
  }

  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
  runShortcutAction(action)
}
