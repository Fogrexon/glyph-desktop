import { buildTitleBrief, isCommandLikeTitle, type TitleBrief } from './activity'
import { generateLocalTitle } from './llm/local-title'
import { loadSettings } from './settings'
import { getTaskView } from './tasks'

const QUIET_MS = 8_000
const MIN_INTERVAL_MS = 25_000

interface Job {
  timer: NodeJS.Timeout | null
  lastCallAt: number
  lastFingerprint: string
  inFlight: boolean
}

export interface TitleJobInput {
  paneId: string
  taskId: string
  output: () => string
  currentTitle: () => string | null
}

const jobs = new Map<string, Job>()
let queue: Promise<void> = Promise.resolve()

export function cancelWorkTitle(paneId: string): void {
  const job = jobs.get(paneId)
  if (job?.timer) clearTimeout(job.timer)
  jobs.delete(paneId)
}

export function cancelAllWorkTitles(): void {
  for (const paneId of [...jobs.keys()]) cancelWorkTitle(paneId)
}

export function scheduleWorkTitle(
  input: TitleJobInput,
  apply: (title: string, fingerprint: string) => void
): void {
  const settings = loadSettings()
  if (settings.titleMode !== 'local') return

  let job = jobs.get(input.paneId)
  if (!job) {
    job = { timer: null, lastCallAt: 0, lastFingerprint: '', inFlight: false }
    jobs.set(input.paneId, job)
  }

  if (job.timer) clearTimeout(job.timer)
  const wait = Math.max(QUIET_MS, MIN_INTERVAL_MS - (Date.now() - job.lastCallAt))
  job.timer = setTimeout(() => {
    job.timer = null
    queue = queue.then(() => runTitle(input, apply)).catch(() => undefined)
  }, wait)
}

async function runTitle(
  input: TitleJobInput,
  apply: (title: string, fingerprint: string) => void
): Promise<void> {
  const job = jobs.get(input.paneId)
  if (!job || job.inFlight) return

  const settings = loadSettings()
  if (settings.titleMode !== 'local') return

  const brief = buildTitleBrief(input.output())
  if (!brief) return
  const fingerprint = hash(fingerprintKey(brief, input.taskId))
  if (fingerprint === job.lastFingerprint) return

  job.inFlight = true
  job.lastCallAt = Date.now()
  try {
    const task = await getTaskView(input.taskId)
    const excerpt = formatBrief(brief, {
      taskTitle: task?.title ?? null,
      taskGoal: task?.goal ?? null,
      currentTitle: input.currentTitle()
    })
    const raw = await generateLocalTitle(excerpt)
    const title = sanitizeTitle(raw)
    job.lastFingerprint = fingerprint
    if (!title) return
    apply(title, fingerprint)
  } catch {
    // 失敗時は既存の llmTitle を残す。
  } finally {
    job.inFlight = false
  }
}

function fingerprintKey(brief: TitleBrief, taskId: string): string {
  return [taskId, ...brief.intents, ...brief.todos, ...brief.areas].join('\n')
}

function formatBrief(
  brief: TitleBrief,
  ctx: { taskTitle: string | null; taskGoal: string | null; currentTitle: string | null }
): string {
  const lines: string[] = []
  if (ctx.taskTitle) lines.push(`タスク: ${ctx.taskTitle}`)
  if (ctx.taskGoal) lines.push(`ゴール: ${clip(ctx.taskGoal, 80)}`)
  if (ctx.currentTitle) lines.push(`これまでのタイトル: ${ctx.currentTitle}`)
  if (brief.intents.length > 0) {
    lines.push('依頼:')
    for (const item of brief.intents) lines.push(`- ${item}`)
  }
  if (brief.todos.length > 0) {
    lines.push('計画:')
    for (const item of brief.todos) lines.push(`- ${item}`)
  }
  if (brief.areas.length > 0) lines.push(`場所: ${brief.areas.join(', ')}`)
  return lines.join('\n').slice(0, 1200)
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

function sanitizeTitle(raw: string | null): string | null {
  if (!raw) return null
  const line = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.length > 0)
  if (!line) return null
  const cleaned = line
    .replace(/^["「『]|["」』]$/g, '')
    .replace(/^(タイトル|title|作業)\s*[:：]\s*/i, '')
    .replace(/[。．.]+$/g, '')
    .trim()
  if (cleaned.length < 4 || cleaned.length > 40) return null
  if (/次のターミナル|出力から|作業タイトル|これまでのタイトル/.test(cleaned)) return null
  if (isCommandLikeTitle(cleaned)) return null
  return cleaned
}

function hash(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}
