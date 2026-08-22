import { formatDeadline, shortenPath } from '@renderer/lib/format'
import {
  paneWorkItems,
  paneWorkTitle,
  representativeSession,
  sessionsForTask,
  taskAgentStatus
} from '@renderer/lib/sessions'
import { statusLabel, useUi } from '@renderer/stores/ui'
import { usePanes } from '@renderer/stores/panes'
import { useWorkspace } from '@renderer/stores/workspace'

export function TaskRail(): React.JSX.Element {
  const tasks = useWorkspace((s) => s.tasks)
  const selected = useUi((s) => s.selectedTaskId)
  const select = useUi((s) => s.selectTask)
  const viewMode = useUi((s) => s.viewMode)
  const sessions = useUi((s) => s.sessions)
  const focusPane = usePanes((s) => s.focusPane)
  const activePane = usePanes((s) => (selected ? (s.activePane[selected] ?? selected) : null))

  return (
    <aside className="rail">
      <div className="rail-head">
        <strong>Glyph</strong>
        <span className="hint">{viewMode === 'now' ? '今やる仕事' : 'すべて'}</span>
      </div>
      <div className="task-list">
        {tasks.length === 0 && (
          <p className="hint" style={{ padding: 12 }}>
            {viewMode === 'now'
              ? '開始日が来た仕事はありません。Ctrl+K で追加するか、すべて表示に切り替えてください。'
              : 'タスクがありません。Ctrl+K から作成します。'}
          </p>
        )}
        {tasks.map((task) => {
          const session = representativeSession(sessions, task.id)
          const status = taskAgentStatus(sessions, task.id)
          const cwd = session?.cwd || task.lastCwd
          const panes = sessionsForTask(sessions, task.id)
          const nested =
            panes.length > 1 ||
            panes.some(
              (pane) =>
                (pane.workItems?.length ?? 0) > 0 ||
                pane.status === 'running' ||
                pane.status === 'needs_human'
            )
          return (
            <div
              key={task.id}
              className={`task-card ${selected === task.id ? 'active' : ''}`}
            >
              <button
                type="button"
                className="task-row-main"
                onClick={() => select(task.id)}
                title={cwd || undefined}
              >
                <div className="title">
                  <span className={`status-dot ${status ?? 'none'}`} />
                  <span>{task.title}</span>
                </div>
                <div className="meta">
                  <span className={task.overdue ? 'overdue' : ''}>
                    {formatDeadline(task.nearestDeadline)}
                  </span>
                  <span>{statusLabel(status)}</span>
                </div>
                {cwd && <div className="cwd">{shortenPath(cwd)}</div>}
              </button>
              {nested && (
                <ul className="pane-work-list" aria-label="ターミナルの作業">
                  {panes.map((pane) => {
                    const title = paneWorkTitle(pane) || 'ターミナル'
                    const items = paneWorkItems(pane)
                    const paneActive = selected === task.id && activePane === pane.paneId
                    return (
                      <li
                        key={pane.paneId}
                        className={`pane-work ${paneActive ? 'active' : ''}`}
                      >
                        <button
                          type="button"
                          className="pane-work-head"
                          onClick={() => {
                            select(task.id)
                            focusPane(task.id, pane.paneId)
                          }}
                        >
                          <span className={`status-dot ${pane.status ?? 'none'}`} />
                          <span className="pane-work-title">{title}</span>
                        </button>
                        {items.length > 0 && (
                          <ul className="pane-work-items">
                            {items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
