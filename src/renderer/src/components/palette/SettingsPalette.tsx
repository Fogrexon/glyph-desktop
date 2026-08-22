import { useEffect, useMemo, useRef, useState } from 'react'
import { Command } from 'cmdk'
import type { AppSettings, LlmProviderId } from '@shared/types'
import { fuzzyScore } from '@renderer/lib/fuzzy'
import { defaultModelHint } from '@renderer/lib/models'
import { useUi } from '@renderer/stores/ui'

const PROVIDERS: { id: LlmProviderId; title: string }[] = [
  { id: 'openrouter', title: 'OpenRouter' },
  { id: 'gemini', title: 'Gemini API' },
  { id: 'vertex', title: 'Gemini Vertex AI (ADC)' }
]

type TextField =
  | 'model'
  | 'openrouterApiKey'
  | 'geminiApiKey'
  | 'vertexProject'
  | 'vertexLocation'
  | 'mcpServersJson'

interface FieldDef {
  field: TextField
  title: string
  secret?: boolean
  providers?: LlmProviderId[]
}

const TEXT_FIELDS: FieldDef[] = [
  { field: 'model', title: '高速モデル ID' },
  {
    field: 'openrouterApiKey',
    title: 'OpenRouter API キー',
    secret: true,
    providers: ['openrouter']
  },
  { field: 'geminiApiKey', title: 'Gemini API キー', secret: true, providers: ['gemini'] },
  { field: 'vertexProject', title: 'GCP プロジェクト', providers: ['vertex'] },
  { field: 'vertexLocation', title: 'ロケーション', providers: ['vertex'] },
  { field: 'mcpServersJson', title: 'MCP サーバ設定 (JSON)' }
]

export function SettingsPalette({ onBack }: { onBack: () => void }): React.JSX.Element {
  const setView = useUi((s) => s.setPaletteView)
  const pushToast = useUi((s) => s.pushToast)
  const [form, setForm] = useState<AppSettings | null>(null)
  const [query, setQuery] = useState('')
  const [pickingProvider, setPickingProvider] = useState(false)
  const [pickingTitleMode, setPickingTitleMode] = useState(false)
  const [engineNote, setEngineNote] = useState('')
  const [edit, setEdit] = useState<FieldDef | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void window.glyph.settings.get().then(setForm)
    void window.glyph.settings.titleEngineStatus().then((s) => {
      setEngineNote(s.message)
    })
  }, [])

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [pickingProvider, pickingTitleMode, edit])

  const visibleFields = useMemo(() => {
    if (!form) return []
    return TEXT_FIELDS.filter((f) => !f.providers || f.providers.includes(form.provider))
  }, [form])

  const list = useMemo(() => {
    if (!form || edit || pickingProvider || pickingTitleMode) return []
    const rows = [
      { id: 'provider', title: 'プロバイダ', sub: providerLabel(form.provider) },
      ...visibleFields.map((f) => ({
        id: f.field,
        title: f.title,
        sub: f.secret ? maskSecret(form[f.field]) : previewValue(form[f.field])
      })),
      {
        id: 'titleMode',
        title: '作業タイトル',
        sub:
          form.titleMode === 'local'
            ? `内蔵 Qwen2.5 0.5B${engineNote ? ` · ${engineNote}` : ''}`
            : 'ヒューリスティック（モデルなし）'
      },
      { id: 'mcp-test', title: 'MCP 接続テスト', sub: 'いまの JSON で試す' },
      { id: 'shortcuts', title: 'ショートカット', sub: '一覧と割り当て変更' }
    ]
    return rows
      .map((item) => ({ item, score: fuzzyScore(query, item.title, item.sub, item.id) }))
      .filter((x) => (query ? x.score >= 0 : true))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item)
  }, [form, visibleFields, query, edit, pickingProvider, pickingTitleMode, engineNote])

  const persist = async (patch: Partial<AppSettings>, ok: string): Promise<void> => {
    const next = await window.glyph.settings.set(patch)
    setForm(next)
    pushToast({ text: ok, kind: 'ok' })
  }

  const saveEdit = async (): Promise<void> => {
    if (!edit || !form) return
    let value = query
    if (edit.field === 'mcpServersJson') {
      try {
        value = `${JSON.stringify(JSON.parse(query), null, 2)}\n`
      } catch {
        pushToast({ text: 'JSON として読めません', kind: 'warn' })
        return
      }
    }
    await persist({ [edit.field]: value }, `${edit.title}を保存しました`)
    setEdit(null)
    setQuery('')
  }

  const placeholder = edit
    ? `${edit.title}を入力して Enter`
    : pickingProvider
      ? 'プロバイダを選ぶ'
      : pickingTitleMode
        ? 'タイトル生成を選ぶ'
        : '設定を検索'

  const escape = (): void => {
    if (edit) {
      setEdit(null)
      setQuery('')
      return
    }
    if (pickingProvider) {
      setPickingProvider(false)
      setQuery('')
      return
    }
    if (pickingTitleMode) {
      setPickingTitleMode(false)
      setQuery('')
      return
    }
    onBack()
  }

  return (
    <Command
      shouldFilter={false}
      loop
      value={
        edit
          ? 'save'
          : pickingProvider
            ? form?.provider
            : pickingTitleMode
              ? form?.titleMode
              : undefined
      }
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          escape()
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
        {!form && <Command.Empty>読み込み中…</Command.Empty>}
        {form && pickingProvider && (
          <Command.Group heading="プロバイダ">
            {PROVIDERS.map((p) => (
              <Command.Item
                key={p.id}
                value={p.id}
                onSelect={() => {
                  void persist(
                    { provider: p.id, model: defaultModelHint(p.id) },
                    `プロバイダを ${p.title} にしました`
                  )
                  setPickingProvider(false)
                  setQuery('')
                }}
              >
                <span>{p.title}</span>
                {form.provider === p.id && <span className="item-sub">現在</span>}
              </Command.Item>
            ))}
            <Command.Item value="__back__" onSelect={escape}>
              戻る
            </Command.Item>
          </Command.Group>
        )}
        {form && pickingTitleMode && (
          <Command.Group heading="作業タイトル">
            <Command.Item
              value="local"
              onSelect={() => {
                void persist({ titleMode: 'local' }, '内蔵モデルでタイトルを付ける')
                setPickingTitleMode(false)
                setQuery('')
              }}
            >
              <span>内蔵モデル</span>
              <span className="item-sub">
                {engineNote || 'Ollama 不要。初回だけ重みを取得（Qwen2.5 0.5B）'}
              </span>
            </Command.Item>
            <Command.Item
              value="heuristic"
              onSelect={() => {
                void persist({ titleMode: 'heuristic' }, 'ヒューリスティックに戻した')
                setPickingTitleMode(false)
                setQuery('')
              }}
            >
              <span>ヒューリスティック</span>
              <span className="item-sub">コマンド / Todo 抽出のみ。API なし</span>
            </Command.Item>
            <Command.Item value="__back__" onSelect={escape}>
              戻る
            </Command.Item>
          </Command.Group>
        )}
        {form && edit && (
          <Command.Group heading={edit.title}>
            <Command.Item value="save" onSelect={() => void saveEdit()}>
              <span>保存</span>
              <span className="item-sub">{query || '（空）'}</span>
            </Command.Item>
            <Command.Item value="__cancel__" onSelect={escape}>
              キャンセル
            </Command.Item>
          </Command.Group>
        )}
        {form && !edit && !pickingProvider && !pickingTitleMode && (
          <>
            <Command.Group heading="設定">
              {list.map((item) => (
                <Command.Item
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    if (item.id === 'provider') {
                      setPickingProvider(true)
                      setQuery('')
                      return
                    }
                    if (item.id === 'titleMode') {
                      setPickingTitleMode(true)
                      setQuery('')
                      return
                    }
                    if (item.id === 'mcp-test') {
                      void window.glyph.settings.testMcp(form.mcpServersJson).then((result) => {
                        pushToast({
                          text: `${result.ok ? 'OK' : 'NG'}: ${result.message}`,
                          kind: result.ok ? 'ok' : 'warn'
                        })
                      })
                      return
                    }
                    if (item.id === 'shortcuts') {
                      setView('shortcuts')
                      return
                    }
                    const field = TEXT_FIELDS.find((f) => f.field === item.id)
                    if (!field) return
                    setEdit(field)
                    setQuery(
                      field.field === 'mcpServersJson'
                        ? compactJson(form[field.field])
                        : field.secret
                          ? ''
                          : form[field.field]
                    )
                  }}
                >
                  <span>{item.title}</span>
                  <span className="item-sub">{item.sub}</span>
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading="操作">
              <Command.Item value="__back__" onSelect={onBack}>
                戻る
              </Command.Item>
            </Command.Group>
          </>
        )}
      </Command.List>
      <div className="agent-note">
        {form?.provider === 'vertex'
          ? 'Vertex は ADC を使います。先に gcloud auth application-default login'
          : '選んで値を変える · Esc で戻る'}
      </div>
    </Command>
  )
}

function providerLabel(id: LlmProviderId): string {
  return PROVIDERS.find((p) => p.id === id)?.title ?? id
}

function maskSecret(value: string | null | undefined): string {
  return value ? '設定済み' : '未設定'
}

function previewValue(value: string | null | undefined): string {
  if (!value) return '未設定'
  const oneLine = value.replace(/\s+/g, ' ').trim()
  if (!oneLine) return '未設定'
  return oneLine.length > 42 ? `${oneLine.slice(0, 42)}…` : oneLine
}

function compactJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw))
  } catch {
    return raw.replace(/\s+/g, ' ').trim()
  }
}
