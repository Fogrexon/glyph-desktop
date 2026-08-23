import { useEffect } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import { CommandPalette } from './CommandPalette'
import { SettingsPage } from './SettingsPage'
import { TaskRail } from './TaskRail'
import { TerminalPane } from './TerminalPane'
import { Toasts } from './Toasts'
import { handleGlobalKeydown, runShortcutAction } from '@renderer/lib/actions'
import { formatChord, matchAction, mergeKeymap } from '@renderer/lib/keymap'
import { useKeymap } from '@renderer/stores/keymap'
import { useAgentChat } from '@renderer/stores/agentChat'
import { useUi } from '@renderer/stores/ui'
import { usePanes } from '@renderer/stores/panes'
import { applyWorkspaceAction } from '@renderer/lib/workspaceOps'
import { GLYPH_SELF_TASK_ID } from '@shared/ids'
import { recordVisit, setVisitTitle } from '@renderer/lib/browserHistory'
import { refreshTasks } from '@renderer/stores/workspace'

export function Workspace(): React.JSX.Element {
  const paletteOpen = useUi((s) => s.paletteOpen)
  const paletteView = useUi((s) => s.paletteView)
  const workspaceSurface = useUi((s) => s.workspaceSurface)
  const viewMode = useUi((s) => s.viewMode)
  const pushToast = useUi((s) => s.pushToast)
  const upsert = useUi((s) => s.upsertSession)
  const selectTask = useUi((s) => s.selectTask)
  const keymap = mergeKeymap(useKeymap((s) => s.map))

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
    const api = window.glyph.browser
    if (!api) return
    const offNav = api.onNavigated(({ tabId, url }) => {
      usePanes.getState().setTabUrl(tabId, url)
      recordVisit(url)
    })
    const offTitle = api.onTitle?.(({ title, url }) => {
      setVisitTitle(url, title)
    })
    const offOpen = api.onOpenTab(({ openerId, url }) => {
      usePanes.getState().addBrowserBeside(openerId, url)
    })
    const offInput = api.onInput((chord) => {
      const action = matchAction(chord, useKeymap.getState().map)
      if (action) runShortcutAction(action)
    })
    return () => {
      offNav()
      offTitle?.()
      offOpen()
      offInput()
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeydown, true)
    return () => window.removeEventListener('keydown', handleGlobalKeydown, true)
  }, [])

  useEffect(() => {
    if (!window.glyph.browser) return
    if (paletteOpen || workspaceSurface === 'settings') {
      void window.glyph.browser.hideAll()
    }
  }, [paletteOpen, workspaceSurface])

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
      if (event.type === 'action') {
        applyWorkspaceAction(event.action)
        return
      }
      if (event.type === 'done') {
        chat.finishAssistant(event.text)
        useUi.getState().setAgentBusy(false)
        void refreshTasks(useUi.getState().viewMode)
        return
      }
      if (event.type === 'error') {
        chat.finishAssistant(`エラー: ${event.message}`)
        useUi.getState().setAgentBusy(false)
      }
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
    <>
      <div className="workspace">
        <ErrorBoundary compact label="タスク一覧">
          <TaskRail />
        </ErrorBoundary>
        {workspaceSurface === 'settings' ? (
          <ErrorBoundary compact label="設定">
            <SettingsPage />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary compact label="ターミナル">
            <TerminalPane />
          </ErrorBoundary>
        )}
      </div>
      <ErrorBoundary compact label="パレット" resetKey={`${paletteOpen}:${paletteView}`}>
        <CommandPalette />
      </ErrorBoundary>
      <Toasts />
      {!paletteOpen && (
        <div className="hint" style={{ position: 'fixed', bottom: 10, right: 14, zIndex: 5 }}>
          <kbd>{formatChord(keymap['palette.toggle'])}</kbd> 自然言語 ·{' '}
          <kbd>{formatChord(keymap['palette.commands'])}</kbd> コマンド ·{' '}
          <kbd>{formatChord(keymap['palette.search'])}</kbd> 検索
        </div>
      )}
    </>
  )
}
