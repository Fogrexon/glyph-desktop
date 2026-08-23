import { memo, useCallback, useEffect, useRef } from 'react'
import type { TaskView, TerminalSessionInfo } from '@shared/types'
import { formatDeadline, shortenPath } from '@renderer/lib/format'
import {
  liveSessionsForTask,
  paneWorkTitle,
  representativeSession,
  taskAgentStatus
} from '@renderer/lib/sessions'
import { useVirtualWindow } from '@renderer/lib/virtualWindow'
import { statusLabel, useUi } from '@renderer/stores/ui'
import { usePanes } from '@renderer/stores/panes'
import { useWorkspace } from '@renderer/stores/workspace'

const ROW_GAP = 4
const CARD_BASE = 76
const CARD_NO_CWD = 58
const NESTED_CHROME = 14
const PANE_HEAD = 26

export function TaskRail(): React.JSX.Element {
  const tasks = useWorkspace((s) => s.tasks)
  const viewMode = useUi((s) => s.viewMode)
  const openSettings = useUi((s) => s.openSettings)
  const surface = useUi((s) => s.workspaceSurface)
  const selectedTaskId = useUi((s) => s.selectedTaskId)
  const layoutSig = useUi((s) => layoutSignature(tasks, s.sessions))

  const estimate = useCallback(
    (task: TaskView) => estimateTaskCardHeight(task, useUi.getState().sessions),
    [layoutSig]
  )
  const getKey = useCallback((task: TaskView) => task.id, [])
  const { parentRef, totalSize, virtualItems, measure } = useVirtualWindow({
    items: tasks,
    getKey,
    estimate,
    overscan: 6
  })

  useEffect(() => {
    if (!selectedTaskId) return
    const root = parentRef.current
    if (!root) return
    const row = root.querySelector(`[data-task-id="${CSS.escape(selectedTaskId)}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [selectedTaskId, parentRef])

  return (
    <aside className="rail">
      <div className="rail-head">
        <strong>Glyph</strong>
        <span className="hint">{viewMode === 'now' ? '今やる仕事' : 'すべて'}</span>
      </div>
      <div className="task-list" ref={parentRef}>
        {tasks.length === 0 ? (
          <p className="hint" style={{ padding: 12 }}>
            {viewMode === 'now'
              ? '開始日が来た仕事はありません。Ctrl+K で追加するか、すべて表示に切り替えてください。'
              : 'タスクがありません。Ctrl+K から作成します。'}
          </p>
        ) : (
          <div className="task-list-space" style={{ height: totalSize }}>
            {virtualItems.map((row) => {
              const task = tasks[row.index]
              if (!task) return null
              return (
                <div
                  key={row.key}
                  className="task-list-row"
                  data-task-id={task.id}
                  ref={measure(row.key)}
                  style={{ top: row.start }}
                >
                  <TaskCard task={task} />
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="rail-foot">
        <button
          type="button"
          className={`task-card rail-settings ${surface === 'settings' ? 'active' : ''}`}
          onClick={() => openSettings()}
        >
          <div className="title">設定</div>
          <div className="meta">
            <span>一般 · ショートカット</span>
          </div>
        </button>
      </div>
    </aside>
  )
}

const TaskCard = memo(function TaskCard({ task }: { task: TaskView }): React.JSX.Element {
  const select = useUi((s) => s.selectTask)
  const selected = useUi((s) => s.selectedTaskId)
  const surface = useUi((s) => s.workspaceSurface)
  const model = useTaskRailModel(task)
  const selectTab = usePanes((s) => s.selectTab)
  const activePane = usePanes((s) =>
    selected === task.id ? (s.activePane[task.id] ?? task.id) : null
  )

  return (
    <div className={`task-card ${surface === 'task' && selected === task.id ? 'active' : ''}`}>
      <button
        type="button"
        className="task-row-main"
        onClick={() => select(task.id)}
        title={model.cwd || undefined}
      >
        <div className="title">
          <span className={`status-dot ${model.status ?? 'none'}`} />
          <span>{task.title}</span>
        </div>
        <div className="meta">
          <span className={task.overdue ? 'overdue' : ''}>
            {formatDeadline(task.nearestDeadline)}
          </span>
          <span>{statusLabel(model.status)}</span>
        </div>
        {model.cwd && <div className="cwd">{shortenPath(model.cwd)}</div>}
      </button>
      {model.nested && (
        <ul className="pane-work-list" aria-label="ターミナルの作業">
          {model.panes.map((pane) => {
            const title = paneWorkTitle(pane) || 'ターミナル'
            const paneActive = selected === task.id && activePane === pane.paneId
            return (
              <li key={pane.paneId} className={`pane-work ${paneActive ? 'active' : ''}`}>
                <button
                  type="button"
                  className="pane-work-head"
                  title={title}
                  onClick={() => {
                    select(task.id)
                    selectTab(task.id, pane.paneId)
                  }}
                >
                  <span className={`status-dot ${pane.status ?? 'none'}`} />
                  <span className="pane-work-title">{title}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
})

interface RailModel {
  cwd: string | null
  status: ReturnType<typeof taskAgentStatus>
  nested: boolean
  panes: TerminalSessionInfo[]
}

function useTaskRailModel(task: TaskView): RailModel {
  const prev = useRef<RailModel | null>(null)
  return useUi((s) => {
    const next = taskRailModel(s.sessions, task)
    if (prev.current && railModelEqual(prev.current, next)) return prev.current
    prev.current = next
    return next
  })
}

function taskRailModel(sessions: Record<string, TerminalSessionInfo>, task: TaskView): RailModel {
  const session = representativeSession(sessions, task.id)
  const panes = liveSessionsForTask(sessions, task.id)
  return {
    cwd: session?.cwd || task.lastCwd,
    status: taskAgentStatus(sessions, task.id),
    nested: isNested(panes),
    panes
  }
}

function railModelEqual(a: RailModel, b: RailModel): boolean {
  if (a.cwd !== b.cwd || a.status !== b.status || a.nested !== b.nested) return false
  if (a.panes.length !== b.panes.length) return false
  for (let i = 0; i < a.panes.length; i++) {
    const x = a.panes[i]
    const y = b.panes[i]
    if (!x || !y) return false
    if (x.paneId !== y.paneId || x.status !== y.status || x.workTitle !== y.workTitle) return false
  }
  return true
}

function isNested(panes: TerminalSessionInfo[]): boolean {
  return (
    panes.length > 1 ||
    panes.some(
      (pane) =>
        Boolean(paneWorkTitle(pane)) || pane.status === 'running' || pane.status === 'needs_human'
    )
  )
}

function estimateTaskCardHeight(
  task: TaskView,
  sessions: Record<string, TerminalSessionInfo>
): number {
  const panes = liveSessionsForTask(sessions, task.id)
  const session = representativeSession(sessions, task.id)
  const cwd = session?.cwd || task.lastCwd
  let h = cwd ? CARD_BASE : CARD_NO_CWD
  if (!isNested(panes)) return h + ROW_GAP
  h += NESTED_CHROME
  h += PANE_HEAD * panes.length
  return h + ROW_GAP
}

function layoutSignature(tasks: TaskView[], sessions: Record<string, TerminalSessionInfo>): string {
  const counts = new Map<string, { panes: number; nested: 0 | 1; cwd: 0 | 1 }>()
  for (const task of tasks) {
    counts.set(task.id, { panes: 0, nested: 0, cwd: task.lastCwd ? 1 : 0 })
  }
  for (const session of Object.values(sessions)) {
    if (!session.alive || session.status === 'exited') continue
    const rec = counts.get(session.taskId)
    if (!rec) continue
    rec.panes++
    if (session.cwd) rec.cwd = 1
    if (
      rec.panes > 1 ||
      Boolean(session.workTitle) ||
      session.status === 'running' ||
      session.status === 'needs_human'
    ) {
      rec.nested = 1
    }
  }
  return tasks
    .map((task) => {
      const rec = counts.get(task.id)
      if (!rec) return task.id
      return `${task.id}:${rec.nested}:${rec.panes}:${rec.cwd}`
    })
    .join('|')
}
