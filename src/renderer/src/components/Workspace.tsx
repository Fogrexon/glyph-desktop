import { useEffect } from 'react'
import { CommandPalette } from './CommandPalette'
import { SettingsPanel } from './SettingsPanel'
import { TaskEditor } from './TaskEditor'
import { TaskRail } from './TaskRail'
import { TerminalPane } from './TerminalPane'
import { Toasts } from './Toasts'
import { handleGlobalKeydown } from '@renderer/lib/actions'
import { formatChord } from '@renderer/lib/keymap'
import { useKeymap } from '@renderer/stores/keymap'
import { useAgentChat } from '@renderer/stores/agentChat'
import { useUi } from '@renderer/stores/ui'
import { GLYPH_SELF_TASK_ID } from '@shared/ids'
import { refreshTasks } from '@renderer/stores/workspace'

export function Workspace(): React.JSX.Element {
  const paletteOpen = useUi((s) => s.paletteOpen)
  const viewMode = useUi((s) => s.viewMode)
  const pushToast = useUi((s) => s.pushToast)
  const upsert = useUi((s) => s.upsertSession)
  const selectTask = useUi((s) => s.selectTask)
  const keymap = useKeymap((s) => s.map)

  useEffect(() => {
    void refreshTasks(viewMode).then((tasks) => {
      const current = useUi.getState().selectedTaskId
      if (current && tasks.some((t) => t.id === current)) return
      const self = tasks.find((t) => t.id === GLYPH_SELF_TASK_ID)
      selectTask(self?.id ?? tasks[0]?.id ?? null)
    })
  }, [viewMode, selectTask])

  useEffect(() => {
    void window.glyph.terminals.list().then((list) => {
      for (const info of list) upsert(info)
    })
  }, [upsert])

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeydown, true)
    return () => window.removeEventListener('keydown', handleGlobalKeydown, true)
  }, [])

  useEffect(() => {
    const subscribe = window.glyph.agent?.onEvent
    if (!subscribe) return
    return subscribe((event) => {
      const chat = useAgentChat.getState()
      if (event.type === 'delta') {
        chat.appendDelta(event.text)
        return
      }
      if (event.type === 'tool') {
        chat.commitStreaming()
        chat.appendTool(event.name)
        void refreshTasks(useUi.getState().viewMode)
        return
      }
      if (event.type === 'done') {
        chat.finishAssistant(event.text)
        useUi.getState().setAgentBusy(false)
        void refreshTasks(useUi.getState().viewMode)
        return
      }
      chat.finishAssistant(`エラー: ${event.message}`)
      useUi.getState().setAgentBusy(false)
    })
  }, [])

  useEffect(() => {
    const seen = new Set<string>()
    return window.glyph.terminals.onStatus((info) => {
      upsert(info)
      const key = `${info.paneId}:${info.status}`
      if (seen.has(key)) return
      if (info.status === 'needs_human') {
        seen.add(key)
        if (info.taskId !== useUi.getState().selectedTaskId) {
          pushToast({ text: 'エージェントが判断を待っています', kind: 'warn' })
        }
      }
      if (info.status === 'exited') {
        seen.add(key)
        pushToast({ text: 'ターミナルが終了しました', kind: 'warn' })
      }
    })
  }, [pushToast, upsert])

  return (
    <div className="workspace">
      <TaskRail />
      <TerminalPane />
      <CommandPalette />
      <SettingsPanel />
      <TaskEditor />
      <Toasts />
      {!paletteOpen && (
        <div className="hint" style={{ position: 'fixed', bottom: 10, right: 14, zIndex: 5 }}>
          <kbd>{formatChord(keymap['palette.toggle'])}</kbd> パレット ·{' '}
          <kbd>{formatChord(keymap['term.splitRight'])}</kbd> 右分割 ·{' '}
          <kbd>{formatChord(keymap['term.splitDown'])}</kbd> 下分割
        </div>
      )}
    </div>
  )
}
