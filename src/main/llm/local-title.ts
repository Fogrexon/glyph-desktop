import { app } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'

/** 実行基盤はアプリ同梱。重みは初回だけ userData に取る（インストーラを肥大化させない）。 */
const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct'

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

export async function generateLocalTitle(excerpt: string): Promise<string | null> {
  const pipe = await ensureGenerator()
  const output = await pipe(
    [
      {
        role: 'system',
        content:
          '端末ログから作業タイトルを1行で返す。日本語。12〜28文字。句点・引用符・接頭辞なし。コマンド名の羅列は禁止。'
      },
      { role: 'user', content: excerpt.slice(0, 2500) }
    ],
    { max_new_tokens: 40, do_sample: false }
  )
  const text = lastAssistantText(output[0]?.generated_text)
  return text || null
}

async function ensureGenerator(): Promise<Generator> {
  if (generator) return generator
  if (loading) return loading
  loading = loadGenerator()
  try {
    generator = await loading
    lastError = null
    message = '内蔵 Qwen2.5 0.5B'
    return generator
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    loading = null
  }
}

async function loadGenerator(): Promise<Generator> {
  message = 'モデルを準備しています…'
  const { env, pipeline } = await import('@huggingface/transformers')
  const cacheDir = join(app.getPath('userData'), 'hf-cache')
  mkdirSync(cacheDir, { recursive: true })
  env.cacheDir = cacheDir
  env.allowRemoteModels = true
  env.useBrowserCache = false

  const pipe = await pipeline('text-generation', MODEL_ID, {
    dtype: 'q4',
    device: 'wasm',
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
