import { useEffect, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { formatDeadline } from '@renderer/lib/format'
import { useUi } from '@renderer/stores/ui'
import { refreshTasks } from '@renderer/stores/workspace'

type Step = 'title' | 'goal' | 'milestone'

interface Draft {
  title: string
  goal: string
  milestones: { title: string; deadline: number }[]
}

const EMPTY: Draft = { title: '', goal: '', milestones: [] }

export function TaskNewPalette({ onBack }: { onBack: () => void }): React.JSX.Element {
  const viewMode = useUi((s) => s.viewMode)
  const selectTask = useUi((s) => s.selectTask)
  const setOpen = useUi((s) => s.setPaletteOpen)
  const pushToast = useUi((s) => s.pushToast)
  const [step, setStep] = useState<Step>('title')
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [step])

  const placeholder =
    step === 'title'
      ? 'タスク名'
      : step === 'goal'
        ? 'ゴール（空でスキップ）'
        : 'マイルストーン 内容 | 日付（空で作成）'

  const confirm = async (): Promise<void> => {
    if (step === 'title') {
      const title = query.trim()
      if (!title) {
        pushToast({ text: 'タスク名を入力してください', kind: 'warn' })
        return
      }
      setDraft((d) => ({ ...d, title }))
      setQuery('')
      setStep('goal')
      return
    }
    if (step === 'goal') {
      setDraft((d) => ({ ...d, goal: query.trim() }))
      setQuery('')
      setStep('milestone')
      return
    }
    const line = query.trim()
    if (line) {
      const parsed = parseMilestoneLine(line)
      setDraft((d) => ({ ...d, milestones: [...d.milestones, parsed] }))
      setQuery('')
      return
    }
    await createTask({ ...draft, title: draft.title || query.trim() })
  }

  const createTask = async (next: Draft): Promise<void> => {
    if (!next.title.trim()) {
      pushToast({ text: 'タスク名を入力してください', kind: 'warn' })
      return
    }
    const created = await window.glyph.tasks.create({
      title: next.title.trim(),
      goal: next.goal.trim() || undefined,
      milestones: next.milestones.map((m) => ({ title: m.title, deadline: m.deadline }))
    })
    await refreshTasks(viewMode)
    selectTask(created.id)
    pushToast({ text: `「${created.title}」を作成`, kind: 'ok' })
    setOpen(false)
  }

  const back = (): void => {
    if (step === 'goal') {
      setQuery(draft.title)
      setStep('title')
      return
    }
    if (step === 'milestone') {
      setQuery(draft.goal)
      setStep('goal')
      return
    }
    onBack()
  }

  const heading = draft.title
    ? `${draft.title}${draft.milestones.length ? ` · マイルストーン ${draft.milestones.length}` : ''}`
    : '新しいタスク'

  return (
    <Command
      shouldFilter={false}
      loop
      value="confirm"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          back()
        }
      }}
    >
      <Command.Input
        ref={inputRef}
        value={query}
        onValueChange={setQuery}
        placeholder={placeholder}
      />
      <Command.List>
        <Command.Group heading={heading}>
          <Command.Item value="confirm" onSelect={() => void confirm()}>
            <span>
              {step === 'title'
                ? 'タイトルを確定'
                : step === 'goal'
                  ? query.trim()
                    ? 'ゴールを確定'
                    : 'ゴールなしで進む'
                  : query.trim()
                    ? 'マイルストーンを追加'
                    : 'この内容で作成'}
            </span>
            <span className="item-sub">
              {step === 'milestone' && query.trim()
                ? formatMilestonePreview(query)
                : query || (step === 'milestone' ? draft.title : '')}
            </span>
          </Command.Item>
          {draft.milestones.map((m, i) => (
            <Command.Item
              key={`${m.title}-${m.deadline}-${i}`}
              value={`ms-${i}`}
              onSelect={() =>
                setDraft((d) => ({
                  ...d,
                  milestones: d.milestones.filter((_, idx) => idx !== i)
                }))
              }
            >
              <span>{m.title}</span>
              <span className="item-sub">{formatDeadline(m.deadline)} · 選択で削除</span>
            </Command.Item>
          ))}
          <Command.Item value="__back__" onSelect={back}>
            戻る
          </Command.Item>
        </Command.Group>
      </Command.List>
      <div className="agent-note">
        {step === 'milestone' ? '例: 資料提出 | 2026-08-25 · 空の Enter で作成' : 'Esc で戻る'}
      </div>
    </Command>
  )
}

function parseMilestoneLine(raw: string): { title: string; deadline: number } {
  const [title, date] = raw.split('|').map((s) => s.trim())
  const parsed = date ? new Date(date).getTime() : NaN
  const deadline = Number.isFinite(parsed) ? parsed : Date.now() + 86400000
  return { title: title || raw, deadline }
}

function formatMilestonePreview(raw: string): string {
  const parsed = parseMilestoneLine(raw)
  return `${parsed.title} · ${formatDeadline(parsed.deadline)}`
}
