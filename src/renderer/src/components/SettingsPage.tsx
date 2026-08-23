import { useEffect, useMemo, useState } from 'react'
import type { AppSettings, LlmProviderId } from '@shared/types'
import { fuzzyScore } from '@renderer/lib/fuzzy'
import {
  SHORTCUT_DEFS,
  chordsEqual,
  conflictingActions,
  defaultKeymap,
  formatChord,
  mergeKeymap,
  type ShortcutAction,
  type ShortcutDef
} from '@renderer/lib/keymap'
import { defaultModelHint } from '@renderer/lib/models'
import { useKeymap } from '@renderer/stores/keymap'
import { useUi } from '@renderer/stores/ui'

const SHORTCUT_GROUP_HEADINGS: Record<ShortcutDef['group'], string> = {
  app: 'アプリ',
  task: 'タスク',
  term: 'ターミナル'
}

const SHORTCUT_GROUP_ORDER: ShortcutDef['group'][] = ['app', 'task', 'term']

const PROVIDERS: { id: LlmProviderId; title: string }[] = [
  { id: 'openrouter', title: 'OpenRouter' },
  { id: 'gemini', title: 'Gemini API' },
  { id: 'vertex', title: 'Gemini Vertex AI (ADC)' }
]

export function SettingsPage(): React.JSX.Element {
  const section = useUi((s) => s.settingsSection)
  const setSection = useUi((s) => s.setSettingsSection)

  return (
    <section className="settings-page">
      <header className="settings-head">
        <h1>設定</h1>
        <nav className="settings-tabs" aria-label="設定セクション">
          <button
            type="button"
            className={section === 'general' ? 'active' : ''}
            onClick={() => setSection('general')}
          >
            一般
          </button>
          <button
            type="button"
            className={section === 'shortcuts' ? 'active' : ''}
            onClick={() => setSection('shortcuts')}
          >
            ショートカット
          </button>
        </nav>
      </header>
      {section === 'general' ? <GeneralPane /> : <ShortcutsPane />}
    </section>
  )
}

function GeneralPane(): React.JSX.Element {
  const pushToast = useUi((s) => s.pushToast)
  const [form, setForm] = useState<AppSettings | null>(null)
  const [titleNote, setTitleNote] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    void window.glyph.settings
      .get()
      .then((next) => {
        setForm(next)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error))
      })
    const probe = window.glyph.settings.titleEngineStatus
    if (typeof probe !== 'function') return
    void probe()
      .then((s) => setTitleNote(s.message))
      .catch(() => {})
  }, [])

  const persist = async (patch: Partial<AppSettings>, ok: string): Promise<void> => {
    const next = await window.glyph.settings.set(patch)
    setForm(next)
    pushToast({ text: ok, kind: 'ok' })
  }

  if (loadError) {
    return <p className="settings-error">設定を読めません: {loadError}</p>
  }
  if (!form) {
    return <p className="hint">読み込み中…</p>
  }

  return (
    <div className="settings-body">
      <label className="settings-field">
        <span>プロバイダ</span>
        <select
          value={form.provider}
          onChange={(e) => {
            const provider = e.target.value as LlmProviderId
            void persist(
              { provider, model: defaultModelHint(provider) },
              `プロバイダを ${providerLabel(provider)} にしました`
            )
          }}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-field">
        <span>高速モデル ID</span>
        <input
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
          onBlur={() => void persist({ model: form.model }, 'モデルを保存しました')}
        />
      </label>
      {form.provider === 'openrouter' && (
        <label className="settings-field">
          <span>OpenRouter API キー</span>
          <input
            type="password"
            value={form.openrouterApiKey}
            onChange={(e) => setForm({ ...form, openrouterApiKey: e.target.value })}
            onBlur={() =>
              void persist({ openrouterApiKey: form.openrouterApiKey }, 'API キーを保存しました')
            }
          />
        </label>
      )}
      {form.provider === 'gemini' && (
        <label className="settings-field">
          <span>Gemini API キー</span>
          <input
            type="password"
            value={form.geminiApiKey}
            onChange={(e) => setForm({ ...form, geminiApiKey: e.target.value })}
            onBlur={() => void persist({ geminiApiKey: form.geminiApiKey }, 'API キーを保存しました')}
          />
        </label>
      )}
      {form.provider === 'vertex' && (
        <>
          <label className="settings-field">
            <span>GCP プロジェクト</span>
            <input
              value={form.vertexProject}
              onChange={(e) => setForm({ ...form, vertexProject: e.target.value })}
              onBlur={() =>
                void persist({ vertexProject: form.vertexProject }, 'プロジェクトを保存しました')
              }
            />
          </label>
          <label className="settings-field">
            <span>ロケーション</span>
            <input
              value={form.vertexLocation}
              onChange={(e) => setForm({ ...form, vertexLocation: e.target.value })}
              onBlur={() =>
                void persist({ vertexLocation: form.vertexLocation }, 'ロケーションを保存しました')
              }
            />
          </label>
          <p className="hint">Vertex は ADC を使います。先に gcloud auth application-default login</p>
        </>
      )}
      <label className="settings-field">
        <span>作業タイトル</span>
        <select
          value={form.titleMode ?? 'heuristic'}
          onChange={(e) => {
            const titleMode = e.target.value === 'local' ? 'local' : 'heuristic'
            void persist(
              { titleMode },
              titleMode === 'local' ? '内蔵モデルでタイトルを付ける' : 'ヒューリスティックに戻した'
            )
          }}
        >
          <option value="heuristic">ヒューリスティック（モデルなし）</option>
          <option value="local">内蔵の軽量モデル</option>
        </select>
        {titleNote && <span className="hint">{titleNote}</span>}
      </label>
      <label className="settings-field">
        <span>MCP サーバ設定 (JSON)</span>
        <textarea
          rows={8}
          value={form.mcpServersJson}
          onChange={(e) => setForm({ ...form, mcpServersJson: e.target.value })}
          onBlur={() => {
            try {
              const value = `${JSON.stringify(JSON.parse(form.mcpServersJson), null, 2)}\n`
              void persist({ mcpServersJson: value }, 'MCP 設定を保存しました')
            } catch {
              pushToast({ text: 'JSON として読めません', kind: 'warn' })
            }
          }}
        />
      </label>
      <div className="settings-actions">
        <button
          type="button"
          className="ghost"
          onClick={() => {
            void window.glyph.settings.testMcp(form.mcpServersJson).then((result) => {
              pushToast({
                text: `${result.ok ? 'OK' : 'NG'}: ${result.message}`,
                kind: result.ok ? 'ok' : 'warn'
              })
            })
          }}
        >
          MCP 接続テスト
        </button>
      </div>
    </div>
  )
}

function ShortcutsPane(): React.JSX.Element {
  const rawMap = useKeymap((s) => s.map)
  const map = useMemo(() => mergeKeymap(rawMap), [rawMap])
  const recording = useKeymap((s) => s.recording)
  const startRecording = useKeymap((s) => s.startRecording)
  const resetAll = useKeymap((s) => s.resetAll)
  const resetAction = useKeymap((s) => s.resetAction)
  const pushToast = useUi((s) => s.pushToast)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!recording) return
    const action = recording
    const onDone = (): void => {
      const chord = useKeymap.getState().map[action]
      const conflicts = conflictingActions(useKeymap.getState().map, action)
      const label = SHORTCUT_DEFS.find((d) => d.action === action)?.label ?? action
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
    }
    const unsub = useKeymap.subscribe((state, prev) => {
      if (prev.recording !== action || state.recording != null) return
      if (chordsEqual(prev.map[action], state.map[action])) return
      onDone()
    })
    return unsub
  }, [recording, pushToast])

  const groups = useMemo(() => {
    const match = (group: ShortcutDef['group']): ShortcutDef[] =>
      SHORTCUT_DEFS.filter((d) => d.group === group)
        .map((item) => ({
          item,
          score: fuzzyScore(
            query,
            item.label,
            item.action,
            formatChord(map[item.action] ?? defaultKeymap()[item.action]),
            ...(item.keywords ?? [])
          )
        }))
        .filter((x) => (query ? x.score >= 0 : true))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.item)
    return Object.fromEntries(SHORTCUT_GROUP_ORDER.map((group) => [group, match(group)])) as Record<
      ShortcutDef['group'],
      ShortcutDef[]
    >
  }, [query, map])

  return (
    <div className="settings-body shortcuts-body">
      <p className="hint">
        {recording
          ? '新しいキーを押す · Esc でキャンセル'
          : '行を選んでキーを押すと割り当てを変更'}
      </p>
      <input
        className="settings-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ショートカットを検索"
      />
      {SHORTCUT_GROUP_ORDER.map((group) => (
        <ShortcutGroup
          key={group}
          heading={SHORTCUT_GROUP_HEADINGS[group]}
          items={groups[group] ?? []}
          recording={recording}
          onPick={startRecording}
          onReset={resetAction}
        />
      ))}
      <div className="settings-actions">
        <button
          type="button"
          className="ghost"
          onClick={() => {
            resetAll()
            pushToast({ text: 'ショートカットを初期値に戻しました', kind: 'ok' })
          }}
        >
          すべて初期値に戻す
        </button>
      </div>
    </div>
  )
}

function ShortcutGroup({
  heading,
  items,
  recording,
  onPick,
  onReset
}: {
  heading: string
  items: ShortcutDef[]
  recording: ShortcutAction | null
  onPick: (action: ShortcutAction) => void
  onReset: (action: ShortcutAction) => void
}): React.JSX.Element | null {
  const rawMap = useKeymap((s) => s.map)
  const map = mergeKeymap(rawMap)
  if (!items?.length) return null
  return (
    <div className="shortcut-group">
      <h2>{heading}</h2>
      <ul>
        {items.map((def) => (
          <li key={def.action}>
            <button type="button" className="shortcut-row" onClick={() => onPick(def.action)}>
              <span>{def.label}</span>
              <kbd>
                {recording === def.action
                  ? '入力待ち'
                  : formatChord(map[def.action] ?? defaultKeymap()[def.action])}
              </kbd>
            </button>
            {recording === def.action && (
              <button type="button" className="ghost shortcut-reset" onClick={() => onReset(def.action)}>
                初期値
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function providerLabel(id: LlmProviderId): string {
  return PROVIDERS.find((p) => p.id === id)?.title ?? id
}
