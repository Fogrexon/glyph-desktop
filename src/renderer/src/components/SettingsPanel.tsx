import { useEffect, useMemo, useState } from 'react'
import type { AppSettings, LlmProviderId } from '@shared/types'
import { defaultModelHint } from '@renderer/lib/models'
import { useUi } from '@renderer/stores/ui'

export function SettingsPanel(): React.JSX.Element | null {
  const open = useUi((s) => s.settingsOpen)
  const setOpen = useUi((s) => s.setSettingsOpen)
  const pushToast = useUi((s) => s.pushToast)
  const [form, setForm] = useState<AppSettings | null>(null)
  const [mcpMessage, setMcpMessage] = useState('')

  useEffect(() => {
    if (!open) return
    void window.glyph.settings.get().then(setForm)
  }, [open])

  const provider = form?.provider ?? 'openrouter'
  const hint = useMemo(() => defaultModelHint(provider), [provider])

  if (!open || !form) return null

  const patch = (partial: Partial<AppSettings>): void => setForm({ ...form, ...partial })

  return (
    <div className="panel-overlay" onMouseDown={() => setOpen(false)}>
      <form
        className="panel"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          void window.glyph.settings.set(form).then(() => {
            pushToast({ text: '設定を保存しました', kind: 'ok' })
            setOpen(false)
          })
        }}
      >
        <h2>設定</h2>
        <label>
          パレット用プロバイダ
          <select
            value={form.provider}
            onChange={(e) => {
              const next = e.target.value as LlmProviderId
              patch({
                provider: next,
                model: form.model || defaultModelHint(next)
              })
            }}
          >
            <option value="openrouter">OpenRouter</option>
            <option value="gemini">Gemini API</option>
            <option value="vertex">Gemini Vertex AI (ADC)</option>
          </select>
        </label>
        <label>
          高速モデル ID
          <input
            type="text"
            value={form.model}
            placeholder={hint}
            onChange={(e) => patch({ model: e.target.value })}
          />
        </label>
        {form.provider === 'openrouter' && (
          <label>
            OpenRouter API キー
            <input
              type="password"
              value={form.openrouterApiKey}
              onChange={(e) => patch({ openrouterApiKey: e.target.value })}
            />
          </label>
        )}
        {form.provider === 'gemini' && (
          <label>
            Gemini API キー
            <input
              type="password"
              value={form.geminiApiKey}
              onChange={(e) => patch({ geminiApiKey: e.target.value })}
            />
          </label>
        )}
        {form.provider === 'vertex' && (
          <>
            <label>
              GCP プロジェクト
              <input
                type="text"
                value={form.vertexProject}
                onChange={(e) => patch({ vertexProject: e.target.value })}
              />
            </label>
            <label>
              ロケーション
              <input
                type="text"
                value={form.vertexLocation}
                onChange={(e) => patch({ vertexLocation: e.target.value })}
              />
            </label>
            <p className="hint">
              ADC を使います。先に gcloud auth application-default login してください。
            </p>
          </>
        )}
        <label>
          MCP サーバ設定（骨組み）
          <textarea
            value={form.mcpServersJson}
            onChange={(e) => patch({ mcpServersJson: e.target.value })}
            spellCheck={false}
          />
        </label>
        <div className="row-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void window.glyph.settings.testMcp(form.mcpServersJson).then((result) => {
                setMcpMessage(`${result.ok ? 'OK' : 'NG'}: ${result.message}`)
              })
            }}
          >
            接続テスト
          </button>
          <button type="button" className="ghost" onClick={() => setOpen(false)}>
            閉じる
          </button>
          <button type="submit" className="primary-btn">
            保存
          </button>
        </div>
        {mcpMessage && <p className="hint">{mcpMessage}</p>}
      </form>
    </div>
  )
}
