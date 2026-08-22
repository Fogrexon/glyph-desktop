import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Command } from 'cmdk'
import { COMMANDS } from '@shared/commands'
import type { CommandDef, TerminalSessionInfo } from '@shared/types'
import { fuzzyScore } from '@renderer/lib/fuzzy'
import { formatDeadline, relativeToGit, shortenPath } from '@renderer/lib/format'
import { currentAgentContext, openGlyphSelf, resetAgentChat } from '@renderer/lib/workspaceOps'
import { TaskNewPalette } from './palette/TaskNewPalette'
import { ErrorBoundary } from './ErrorBoundary'
import { useAgentChat } from '@renderer/stores/agentChat'
import { useKeymap } from '@renderer/stores/keymap'
import { statusLabel, useUi } from '@renderer/stores/ui'
import { refreshTasks, useWorkspace } from '@renderer/stores/workspace'
import { usePanes } from '@renderer/stores/panes'
import { restoreTermOutput } from '@renderer/lib/termHosts'

const RECENTS_KEY = 'glyph.recentCommands'

function loadRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]') as string[]
  } catch {
    return []
  }
}

function pushRecent(id: string): void {
  const next = [id, ...loadRecents().filter((x) => x !== id)].slice(0, 8)
  localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
}

function parseQuery(raw: string): {
  mode: 'command' | 'mixed' | 'search'
  commandQuery: string
  arg: string
  rest: string
} {
  const trimmed = raw.trim()
  if (trimmed.startsWith('>')) {
    const body = trimmed.slice(1).trim()
    const space = body.search(/\s/)
    if (space === -1) return { mode: 'command', commandQuery: body, arg: '', rest: body }
    return {
      mode: 'command',
      commandQuery: body.slice(0, space),
      arg: body.slice(space + 1).trim(),
      rest: body
    }
  }
  if (trimmed.startsWith('?') || trimmed.startsWith('？')) {
    return { mode: 'search', commandQuery: '', arg: '', rest: trimmed.slice(1).trim() }
  }
  return { mode: 'mixed', commandQuery: trimmed, arg: '', rest: trimmed }
}

function gitBasename(gitRoot: string | null | undefined): string {
  if (!gitRoot) return ''
  return gitRoot.split(/[/\\]/).filter(Boolean).pop() ?? ''
}

function terminalPath(session: TerminalSessionInfo): string {
  if (session.cwd) return relativeToGit(session.cwd, session.gitRoot)
  if (session.lastCwd) return shortenPath(session.lastCwd)
  return ''
}

function terminalSubtitle(session: TerminalSessionInfo): string {
  const title = session.workTitle || session.activity
  return ['ターミナル', terminalPath(session) || null, title, statusLabel(session.status)]
    .filter(Boolean)
    .join(' · ')
}

interface Ranked<T> {
  item: T
  score: number
}

function rankCommands(query: string, commands: CommandDef[]): Ranked<CommandDef>[] {
  return commands
    .map((item) => ({
      item,
      score: fuzzyScore(
        query,
        item.id,
        item.title,
        item.subtitle ?? '',
        ...item.aliases,
        ...item.keywords
      )
    }))
    .filter((x) => (query ? x.score >= 0 : true))
    .sort((a, b) => b.score - a.score)
}

export function CommandPalette(): React.JSX.Element | null {
  const open = useUi((s) => s.paletteOpen)
  if (!open) return null
  return <PaletteDialog />
}

function PaletteDialog(): React.JSX.Element {
  const view = useUi((s) => s.paletteView)
  const setView = useUi((s) => s.setPaletteView)
  const setOpen = useUi((s) => s.setPaletteOpen)

  useEffect(() => {
    return () => useKeymap.getState().cancelRecording()
  }, [])

  useEffect(() => {
    const stealBack = (event: FocusEvent): void => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (target.closest('.palette')) return
      const input = document.querySelector<HTMLInputElement>('.palette [cmdk-input]')
      input?.focus()
    }
    document.addEventListener('focusin', stealBack, true)
    return () => document.removeEventListener('focusin', stealBack, true)
  }, [])

  return (
    <div className="palette-overlay" onMouseDown={() => setOpen(false)}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        {view === 'root' && (
          <ErrorBoundary compact label="パレット" resetKey="root">
            <RootPalette />
          </ErrorBoundary>
        )}
        {view === 'task-new' && (
          <ErrorBoundary compact label="タスク作成" resetKey="task-new">
            <TaskNewPalette onBack={() => setView('root')} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  )
}

function RootPalette(): React.JSX.Element {
  const setOpen = useUi((s) => s.setPaletteOpen)
  const setView = useUi((s) => s.setPaletteView)
  const viewMode = useUi((s) => s.viewMode)
  const setViewMode = useUi((s) => s.setViewMode)
  const selectedTaskId = useUi((s) => s.selectedTaskId)
  const selectTask = useUi((s) => s.selectTask)
  const sessions = useUi((s) => s.sessions)
  const setAgentBusy = useUi((s) => s.setAgentBusy)
  const pushToast = useUi((s) => s.pushToast)
  const turns = useAgentChat((s) => s.turns)
  const streaming = useAgentChat((s) => s.streaming)
  const chatBusy = useAgentChat((s) => s.busy)
  const tasks = useWorkspace((s) => s.tasks)
  const [value, setValue] = useState('')
  const [listingTasks, setListingTasks] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  useEffect(() => {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, streaming])

  const parsed = useMemo(() => parseQuery(value), [value])

  const commands = useMemo(() => {
    if (parsed.mode === 'search') return []
    const q = parsed.mode === 'command' ? parsed.commandQuery : parsed.rest
    const ranked = rankCommands(q, COMMANDS)
    if (parsed.mode === 'command') return ranked
    if (!q) {
      const recents = loadRecents()
      return recents
        .map((id) => COMMANDS.find((c) => c.id === id))
        .filter((c): c is CommandDef => Boolean(c))
        .map((item) => ({ item, score: 1 }))
    }
    return ranked.filter((x) => x.score >= 0)
  }, [parsed])

  const taskHits = useMemo(() => {
    if (parsed.mode === 'search') return []
    if (parsed.mode === 'command' && !listingTasks) return []
    const q = listingTasks ? parsed.arg || parsed.rest : parsed.rest
    return tasks
      .map((task) => ({
        item: task,
        score: fuzzyScore(q, task.title, task.goal, ...task.milestones.map((m) => m.title))
      }))
      .filter((x) => (q ? x.score >= 0 : true))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
  }, [parsed, tasks, listingTasks])

  const searchHits = useMemo(() => {
    if (parsed.mode !== 'search') return []
    const q = parsed.rest
    const taskById = new Map(tasks.map((task) => [task.id, task]))
    const rankedTasks = tasks.map((task) => ({
      kind: 'task' as const,
      id: `search-task-${task.id}`,
      score: fuzzyScore(
        q,
        task.title,
        task.goal,
        task.lastCwd ?? '',
        ...task.milestones.map((m) => m.title)
      ),
      task
    }))
    const rankedTerms = Object.values(sessions).map((session) => {
      const task = taskById.get(session.taskId)
      const path = terminalPath(session)
      return {
        kind: 'term' as const,
        id: `search-term-${session.paneId}`,
        score: fuzzyScore(
          q,
          task?.title ?? '',
          task?.goal ?? '',
          path,
          session.cwd,
          session.gitRoot ?? '',
          gitBasename(session.gitRoot),
          session.lastCwd ?? '',
          session.workTitle ?? '',
          session.activity ?? '',
          statusLabel(session.status),
          ...(session.workItems ?? [])
        ),
        session,
        task
      }
    })
    return [...rankedTasks, ...rankedTerms]
      .filter((x) => (q ? x.score >= 0 : true))
      .sort((a, b) => b.score - a.score || (a.kind === 'task' ? -1 : 1))
      .slice(0, 24)
  }, [parsed, tasks, sessions])

  const runNatural = async (prompt: string): Promise<void> => {
    const text = prompt.trim()
    if (!text || useAgentChat.getState().busy) return
    setValue('')
    useAgentChat.getState().appendUser(text)
    useAgentChat.getState().setBusy(true)
    useAgentChat.getState().setStreaming('')
    setAgentBusy(true)
    try {
      if (!window.glyph.agent?.run) {
        throw new Error('エージェントがまだ接続されていません。アプリを再起動してください。')
      }
      const result = await window.glyph.agent.run(text, currentAgentContext())
      if (useAgentChat.getState().busy) {
        useAgentChat.getState().finishAssistant(result.text || '完了しました。')
        setAgentBusy(false)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (useAgentChat.getState().busy) {
        useAgentChat.getState().finishAssistant(`エラー: ${message}`)
      }
      setAgentBusy(false)
      pushToast({ text: message, kind: 'warn' })
    } finally {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  const submitMixed = (event: KeyboardEvent): void => {
    if (
      event.key !== 'Enter' ||
      parsed.mode !== 'mixed' ||
      !value.trim() ||
      event.nativeEvent.isComposing
    ) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.nativeEvent.stopImmediatePropagation()
    void runNatural(value)
  }

  const runCommand = async (id: string, arg: string): Promise<void> => {
    pushRecent(id)
    switch (id) {
      case 'task.new': {
        if (arg) {
          const [title, goal] = arg.split('|').map((s) => s.trim())
          const created = await window.glyph.tasks.create({ title, goal })
          await refreshTasks(viewMode)
          selectTask(created.id)
          pushToast({ text: `「${created.title}」を作成`, kind: 'ok' })
          setOpen(false)
        } else {
          setView('task-new')
        }
        return
      }
      case 'task.list':
        setListingTasks(true)
        setValue('> task.open ')
        return
      case 'search.open':
        setListingTasks(false)
        setValue(arg ? `? ${arg}` : '? ')
        return
      case 'task.open': {
        const target = arg
          ? tasks
              .map((t) => ({ t, s: fuzzyScore(arg, t.title, t.goal) }))
              .filter((x) => x.s >= 0)
              .sort((a, b) => b.s - a.s)[0]?.t
          : (tasks.find((t) => t.id === selectedTaskId) ?? tasks[0])
        if (!target) {
          pushToast({ text: '開くタスクがありません', kind: 'warn' })
          return
        }
        selectTask(target.id)
        setOpen(false)
        return
      }
      case 'task.complete': {
        const idToClose =
          (arg
            ? tasks
                .map((t) => ({ t, s: fuzzyScore(arg, t.title) }))
                .filter((x) => x.s >= 0)
                .sort((a, b) => b.s - a.s)[0]?.t.id
            : null) ?? selectedTaskId
        if (!idToClose) {
          pushToast({ text: '完了するタスクを選んでください', kind: 'warn' })
          return
        }
        await window.glyph.tasks.archive(idToClose)
        await refreshTasks(viewMode)
        pushToast({ text: 'タスクを完了（アーカイブ）しました', kind: 'ok' })
        setOpen(false)
        return
      }
      case 'milestone.add': {
        if (!selectedTaskId) {
          pushToast({ text: '先にタスクを選んでください', kind: 'warn' })
          return
        }
        if (!arg) {
          pushToast({ text: '例: > milestone.add 資料提出 | 2026-08-25', kind: 'warn' })
          return
        }
        const [title, date] = arg.split('|').map((s) => s.trim())
        const parsedDate = date ? new Date(date).getTime() : NaN
        const fallback = new Date().getTime() + 86400000
        const deadline = Number.isFinite(parsedDate) ? parsedDate : fallback
        await window.glyph.tasks.addMilestone(selectedTaskId, {
          title: title || arg,
          deadline
        })
        await refreshTasks(viewMode)
        setOpen(false)
        return
      }
      case 'milestone.done': {
        if (!selectedTaskId) {
          pushToast({ text: '先にタスクを選んでください', kind: 'warn' })
          return
        }
        const task = await window.glyph.tasks.get(selectedTaskId)
        const pending = task?.milestones
          .filter((m) => m.status === 'pending')
          .sort((a, b) => a.deadline - b.deadline)
        if (!pending?.[0]) {
          pushToast({ text: '未完了のマイルストーンがありません', kind: 'warn' })
          return
        }
        await window.glyph.tasks.completeMilestone(pending[0].id)
        await refreshTasks(viewMode)
        setOpen(false)
        return
      }
      case 'view.now':
        setViewMode('now')
        await refreshTasks('now')
        setOpen(false)
        return
      case 'view.all':
        setViewMode('all')
        await refreshTasks('all')
        setOpen(false)
        return
      case 'settings.open':
      case 'provider.set-model':
        useUi.getState().openSettings('general')
        return
      case 'shortcuts.open':
        useUi.getState().openSettings('shortcuts')
        return
      case 'chat.reset':
        resetAgentChat()
        pushToast({ text: '会話をリセットしました', kind: 'ok' })
        return
      case 'glyph.dev':
        openGlyphSelf()
        await refreshTasks(viewMode)
        return
      case 'term.pwd': {
        const paneId = selectedTaskId
          ? (usePanes.getState().activePane[selectedTaskId] ?? selectedTaskId)
          : null
        const session = paneId ? sessions[paneId] : undefined
        pushToast({
          text: session?.cwd || 'ターミナルがまだ起動していません',
          kind: 'info'
        })
        setOpen(false)
        return
      }
      case 'term.split-right':
        if (selectedTaskId) usePanes.getState().splitActive(selectedTaskId, 'horizontal')
        setOpen(false)
        return
      case 'term.split-down':
        if (selectedTaskId) usePanes.getState().splitActive(selectedTaskId, 'vertical')
        setOpen(false)
        return
      case 'term.close-pane':
        if (!selectedTaskId) return
        if (!usePanes.getState().closeActive(selectedTaskId)) {
          pushToast({ text: '最後のペインは閉じられません', kind: 'info' })
        }
        setOpen(false)
        return
      case 'term.restart': {
        if (!selectedTaskId) return
        const paneId = usePanes.getState().activePane[selectedTaskId] ?? selectedTaskId
        await window.glyph.terminals.restart(paneId)
        await restoreTermOutput(paneId)
        setOpen(false)
        return
      }
      case 'workspace.exit-fullscreen':
        await window.glyph.window.exitWorkspace()
        return
      case 'app.minimize':
        await window.glyph.window.minimize()
        return
      case 'app.quit':
        await window.glyph.window.quit()
        return
      default:
        return
    }
  }

  const showNl = parsed.mode === 'mixed' && parsed.rest.length > 0
  const showChat = turns.length > 0 || streaming.length > 0 || chatBusy

  return (
    <>
      {showChat && (
        <div className="agent-chat" ref={chatRef}>
          {turns.map((turn) => (
            <div key={turn.id} className={`agent-turn ${turn.role}`}>
              {turn.text}
            </div>
          ))}
          {(streaming || chatBusy) && (
            <div className={`agent-turn assistant${streaming ? ' streaming' : ''}`}>
              {streaming || '考えています…'}
            </div>
          )}
        </div>
      )}
      <div onKeyDownCapture={submitMixed}>
        <Command
          shouldFilter={false}
          loop
          value={showNl ? 'nl' : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            submitMixed(e)
          }}
        >
          <Command.Input
            ref={inputRef}
            value={value}
            onValueChange={setValue}
            placeholder={
              parsed.mode === 'search'
                ? 'タスク名・cwd・作業で検索'
                : showChat
                  ? '続けて指示する / ? 検索 / > コマンド'
                  : '設定・分割・タスク… を指示 / ? で検索 / > でコマンド'
            }
          />
          <Command.List>
            <Command.Empty>
              {chatBusy
                ? '考えています…'
                : parsed.mode === 'search'
                  ? '一致なし。タスク名、cwd、作業内容で検索。'
                  : '一致なし。自然言語で送るか ? 検索 / > コマンド。'}
            </Command.Empty>
            {showNl && (
              <Command.Group heading="自然言語">
                <Command.Item value="nl" onSelect={() => void runNatural(parsed.rest)}>
                  <span>自然言語として実行</span>
                  <span className="item-sub">{parsed.rest}</span>
                </Command.Item>
              </Command.Group>
            )}
            {parsed.mode === 'mixed' && !parsed.rest && (
              <Command.Group heading="進行中">
                {Object.values(sessions)
                  .filter((s) => s.status === 'running' || s.status === 'needs_human')
                  .map((s) => {
                    const task = tasks.find((t) => t.id === s.taskId)
                    return (
                      <Command.Item
                        key={`live-${s.paneId}`}
                        value={`live-${s.paneId}`}
                        onSelect={() => {
                          selectTask(s.taskId)
                          usePanes.getState().focusPane(s.taskId, s.paneId)
                          setOpen(false)
                        }}
                      >
                        <span>{s.workTitle || task?.title || s.taskId}</span>
                        <span className="item-sub">
                          {[
                            task && s.workTitle ? task.title : null,
                            s.workItems?.[0],
                            statusLabel(s.status)
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </Command.Item>
                    )
                  })}
              </Command.Group>
            )}
            {(parsed.mode === 'mixed' || listingTasks) && taskHits.length > 0 && (
              <Command.Group heading="タスク">
                {taskHits.map(({ item }) => (
                  <Command.Item
                    key={item.id}
                    value={`task-${item.id}`}
                    onSelect={() => {
                      selectTask(item.id)
                      setOpen(false)
                    }}
                  >
                    <span>{item.title}</span>
                    <span className="item-sub">
                      {item.overdue ? '超過 · ' : ''}
                      {formatDeadline(item.nearestDeadline)}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {parsed.mode === 'search' && searchHits.length > 0 && (
              <Command.Group heading="検索">
                {searchHits.map((hit) =>
                  hit.kind === 'task' ? (
                    <Command.Item
                      key={hit.id}
                      value={hit.id}
                      onSelect={() => {
                        selectTask(hit.task.id)
                        setOpen(false)
                      }}
                    >
                      <span>{hit.task.title}</span>
                      <span className="item-sub">
                        タスク
                        {hit.task.overdue ? ' · 超過' : ''} ·{' '}
                        {formatDeadline(hit.task.nearestDeadline)}
                      </span>
                    </Command.Item>
                  ) : (
                    <Command.Item
                      key={hit.id}
                      value={hit.id}
                      onSelect={() => {
                        selectTask(hit.session.taskId)
                        usePanes.getState().focusPane(hit.session.taskId, hit.session.paneId)
                        setOpen(false)
                      }}
                    >
                      <span>{hit.session.workTitle || hit.task?.title || hit.session.taskId}</span>
                      <span className="item-sub">{terminalSubtitle(hit.session)}</span>
                    </Command.Item>
                  )
                )}
              </Command.Group>
            )}
            {parsed.mode !== 'search' && (
              <Command.Group heading={parsed.mode === 'command' ? 'コマンド' : 'コマンド候補'}>
                {commands.map(({ item }) => (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    onSelect={() => void runCommand(item.id, parsed.arg)}
                  >
                    <span>
                      {item.title}
                      <span className="item-sub">
                        {' '}
                        {'>'} {item.id}
                      </span>
                    </span>
                    <span className="item-sub">{item.subtitle}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
      {showChat && (
        <div className="agent-note">Enter で続きを送る · {'>'} chat.reset で会話をリセット</div>
      )}
    </>
  )
}
