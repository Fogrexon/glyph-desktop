import { app } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'

/** 実行基盤はアプリ同梱。重みは初回だけ userData に取る（インストーラを肥大化させない）。 */
const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct'

/** Node / Electron では wasm は使えない。onnxruntime-node は cpu / coreml / webgpu。 */
const DEVICE = 'cpu'

export interface TitleEngineStatus {
  ready: boolean
  loading: boolean
  message: string
}

type ChatTurn = { role: string; content: string }

type Generator = ((
  messages: ChatTurn[],
  options: { max_new_tokens: number; do_sample: boolean }
) => Promise<Array<{ generated_text: ChatTurn[] | string }>>) & { tokenizer?: unknown }

let generator: Generator | null = null
let loading: Promise<Generator> | null = null
let message = '未ロード'
let lastError: string | null = null

export function titleEngineStatus(): TitleEngineStatus {
  return {
    ready: Boolean(generator),
    loading: Boolean(loading),
    message: lastError ?? message
  }
}

export function warmupTitleEngine(): void {
  void ensureGenerator().catch(() => undefined)
}

export async function generateLocalTitle(excerpt: string): Promise<string | null> {
  const pipe = await ensureGenerator()
  const output = await pipe(
    [
      {
        role: 'system',
        content:
          '作業全体を表す日本語タイトルを1行だけ返す。ユーザーが達成しようとしていることに注目し、直近の1ファイルや1コマンドに引っ張られない。これまでのタイトルがまだ依頼全体を表すならそれをそのまま返す。12〜28文字。句点・引用符・接頭辞なし。ツール名・パスの羅列は禁止。良い例: 設定を左レールの専用タブへ移す。悪い例: ui.ts を編集 / Read SettingsPage.tsx。'
      },
      { role: 'user', content: excerpt.slice(0, 1800) }
    ],
    { max_new_tokens: 28, do_sample: false }
  )
  const text = lastAssistantText(output[0]?.generated_text)
  return text || null
}

async function ensureGenerator(): Promise<Generator> {
  if (generator) return generator
  if (loading) return loading
  lastError = null
  message = 'モデルを準備しています…'
  loading = loadGenerator()
  try {
    generator = await loading
    lastError = null
    message = '内蔵 Qwen2.5 0.5B（CPU）'
    return generator
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    loading = null
  }
}

async function loadGenerator(): Promise<Generator> {
  const { env, pipeline } = await import('@huggingface/transformers')
  const cacheDir = join(app.getPath('userData'), 'hf-cache')
  mkdirSync(cacheDir, { recursive: true })
  env.cacheDir = cacheDir
  env.allowRemoteModels = true
  env.useBrowserCache = false

  const pipe = await pipeline('text-generation', MODEL_ID, {
    dtype: 'q4',
    device: DEVICE,
    progress_callback: (status: { status?: string; file?: string; progress?: number }) => {
      if (status.status === 'progress' && typeof status.progress === 'number') {
        message = `取得中 ${Math.round(status.progress)}%`
      } else if (status.status === 'done' && status.file) {
        message = `展開 ${status.file}`
      }
    }
  })
  return pipe as unknown as Generator
}

function lastAssistantText(generated: ChatTurn[] | string | undefined): string | null {
  if (!generated) return null
  if (typeof generated === 'string') return generated.trim() || null
  const last = generated.at(-1)
  return last?.content?.trim() || null
}
