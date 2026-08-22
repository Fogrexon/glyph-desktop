import { useState } from 'react'
import { fromDatetimeLocalValue } from '@renderer/lib/format'
import { useUi } from '@renderer/stores/ui'
import { refreshTasks } from '@renderer/stores/workspace'

interface DraftMs {
  title: string
  deadline: string
  workStartAt: string
}

export function TaskEditor(): React.JSX.Element | null {
  const open = useUi((s) => s.editorOpen)
  const setOpen = useUi((s) => s.setEditorOpen)
  const viewMode = useUi((s) => s.viewMode)
  const selectTask = useUi((s) => s.selectTask)
  const pushToast = useUi((s) => s.pushToast)
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [milestones, setMilestones] = useState<DraftMs[]>([
    { title: '', deadline: '', workStartAt: '' }
  ])

  if (!open) return null

  const addRow = (): void =>
    setMilestones((rows) => [...rows, { title: '', deadline: '', workStartAt: '' }])

  return (
    <div className="panel-overlay" onMouseDown={() => setOpen(false)}>
      <form
        className="panel"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          void window.glyph.tasks
            .create({
              title: title.trim(),
              goal: goal.trim(),
              milestones: milestones
                .filter((m) => m.title.trim() && m.deadline)
                .map((m) => ({
                  title: m.title.trim(),
                  deadline: fromDatetimeLocalValue(m.deadline) ?? Date.now(),
                  workStartAt: fromDatetimeLocalValue(m.workStartAt)
                }))
            })
            .then(async (task) => {
              pushToast({ text: `タスク「${task.title}」を作りました`, kind: 'ok' })
              setOpen(false)
              setTitle('')
              setGoal('')
              setMilestones([{ title: '', deadline: '', workStartAt: '' }])
              await refreshTasks(viewMode)
              selectTask(task.id)
            })
        }}
      >
        <h2>新しいタスク</h2>
        <label>
          タイトル
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label>
          ゴール
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} />
        </label>
        <div>
          <div className="rail-head" style={{ padding: 0, border: 0 }}>
            <strong>マイルストーン</strong>
            <button type="button" className="ghost" onClick={addRow}>
              追加
            </button>
          </div>
          <div className="ms-list">
            {milestones.map((row, i) => (
              <div className="ms-item" key={i}>
                <label>
                  内容
                  <input
                    type="text"
                    value={row.title}
                    onChange={(e) =>
                      setMilestones((rows) =>
                        rows.map((r, idx) => (idx === i ? { ...r, title: e.target.value } : r))
                      )
                    }
                  />
                </label>
                <label>
                  締め切り
                  <input
                    type="datetime-local"
                    value={row.deadline}
                    onChange={(e) =>
                      setMilestones((rows) =>
                        rows.map((r, idx) => (idx === i ? { ...r, deadline: e.target.value } : r))
                      )
                    }
                  />
                </label>
                <label>
                  作業開始（任意）
                  <input
                    type="datetime-local"
                    value={row.workStartAt}
                    onChange={(e) =>
                      setMilestones((rows) =>
                        rows.map((r, idx) =>
                          idx === i ? { ...r, workStartAt: e.target.value } : r
                        )
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setMilestones((rows) => rows.filter((_, idx) => idx !== i))}
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="row-actions">
          <button type="button" className="ghost" onClick={() => setOpen(false)}>
            キャンセル
          </button>
          <button className="primary-btn" type="submit">
            作成
          </button>
        </div>
      </form>
    </div>
  )
}
