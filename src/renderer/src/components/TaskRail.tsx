import { formatDeadline, shortenPath } from '@renderer/lib/format'
import {
  representativeSession,
  taskActivities,
  taskAgentStatus
} from '@renderer/lib/sessions'
import { statusLabel, useUi } from '@renderer/stores/ui'
import { useWorkspace } from '@renderer/stores/workspace'

export function TaskRail(): React.JSX.Element {
  const tasks = useWorkspace((s) => s.tasks)
  const selected = useUi((s) => s.selectedTaskId)
  const select = useUi((s) => s.selectTask)
  const viewMode = useUi((s) => s.viewMode)
  const sessions = useUi((s) => s.sessions)

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
          const activities = taskActivities(sessions, task.id)
          return (
            <button
              key={task.id}
              className={`task-row ${selected === task.id ? 'active' : ''}`}
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
              {activities.length > 0 && (
                <div className="activities" aria-label="エージェントの作業">
                  {activities.map((label) => (
                    <span key={label} className="activity-chip">
                      {label}
                    </span>
                  ))}
                </div>
              )}
              {cwd && <div className="cwd">{shortenPath(cwd)}</div>}
            </button>
          )
        })}
      </div>
    </aside>
  )
}
