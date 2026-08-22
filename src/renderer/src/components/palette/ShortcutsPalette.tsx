import { useEffect, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { fuzzyScore } from '@renderer/lib/fuzzy'
import {
  SHORTCUT_DEFS,
  conflictingActions,
  formatChord,
  type Keymap,
  type ShortcutAction
} from '@renderer/lib/keymap'
import { useKeymap } from '@renderer/stores/keymap'
import { useUi } from '@renderer/stores/ui'

export function ShortcutsPalette({ onBack }: { onBack: () => void }): React.JSX.Element {
  const map = useKeymap((s) => s.map)
  const recording = useKeymap((s) => s.recording)
  const startRecording = useKeymap((s) => s.startRecording)
  const resetAll = useKeymap((s) => s.resetAll)
  const resetAction = useKeymap((s) => s.resetAction)
  const pushToast = useUi((s) => s.pushToast)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const prevRecording = useRef<ShortcutAction | null>(null)

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  useEffect(() => {
    const prev = prevRecording.current
    prevRecording.current = recording
    if (!prev || recording) return
    const chord = useKeymap.getState().map[prev]
    const conflicts = conflictingActions(useKeymap.getState().map, prev)
    const label = SHORTCUT_DEFS.find((d) => d.action === prev)?.label ?? prev
    if (conflicts.length > 0) {
      const names = conflicts
        .map((id) => SHORTCUT_DEFS.find((d) => d.action === id)?.label ?? id)
        .join('、')
      pushToast({
        text: `「${label}」を ${formatChord(chord)} に変更。${names} と重複`,
        kind: 'warn'
      })
      return
    }
    pushToast({ text: `「${label}」を ${formatChord(chord)} に変更`, kind: 'ok' })
  }, [recording, pushToast])

  const appItems = rankGroup('app', query, map)
  const termItems = rankGroup('term', query, map)

  const placeholder = recording ? '新しいキーを押す · Esc でキャンセル' : 'ショートカットを検索'

  return (
    <Command
      shouldFilter={false}
      loop
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        if (recording) return
        e.preventDefault()
        onBack()
      }}
    >
      <Command.Input
        ref={inputRef}
        value={query}
        onValueChange={setQuery}
        placeholder={placeholder}
      />
      <Command.List>
        <Command.Empty>一致するショートカットはありません</Command.Empty>
        {appItems.length > 0 && (
          <Command.Group heading="アプリ">
            {appItems.map((def) => (
              <Command.Item
                key={def.action}
                value={def.action}
                onSelect={() => startRecording(def.action)}
              >
                <span>{def.label}</span>
                <kbd>{recording === def.action ? '入力待ち' : formatChord(map[def.action])}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {termItems.length > 0 && (
          <Command.Group heading="ターミナル">
            {termItems.map((def) => (
              <Command.Item
                key={def.action}
                value={def.action}
                onSelect={() => startRecording(def.action)}
              >
                <span>{def.label}</span>
                <kbd>{recording === def.action ? '入力待ち' : formatChord(map[def.action])}</kbd>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        <Command.Group heading="操作">
          <Command.Item
            value="reset-all"
            onSelect={() => {
              resetAll()
              pushToast({ text: 'ショートカットを初期値に戻しました', kind: 'ok' })
            }}
          >
            <span>すべて初期値に戻す</span>
          </Command.Item>
          {recording && (
            <Command.Item
              value="reset-one"
              onSelect={() => {
                resetAction(recording)
                pushToast({ text: 'この項目を初期値に戻しました', kind: 'ok' })
              }}
            >
              <span>入力待ちの項目を初期値に戻す</span>
            </Command.Item>
          )}
          <Command.Item value="__back__" onSelect={onBack}>
            <span>戻る</span>
          </Command.Item>
        </Command.Group>
      </Command.List>
      <div className="agent-note">項目を選んでキーを押すと割り当てを変更 · Esc で戻る</div>
    </Command>
  )
}

function rankGroup(
  group: 'app' | 'term',
  query: string,
  map: Keymap
): (typeof SHORTCUT_DEFS)[number][] {
  return SHORTCUT_DEFS.filter((d) => d.group === group)
    .map((item) => ({
      item,
      score: fuzzyScore(query, item.label, item.action, formatChord(map[item.action]))
    }))
    .filter((x) => (query ? x.score >= 0 : true))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item)
}
