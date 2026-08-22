import { loadSettings } from './settings'
import { generateLocalTitle } from './llm/local-title'

const QUIET_MS = 8_000
const MIN_INTERVAL_MS = 25_000
const TAIL_LINES = 40

interface Job {
  timer: NodeJS.Timeout | null
  lastCallAt: number
  lastFingerprint: string
  inFlight: boolean
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
  paneId: string,
  output: string,
  apply: (title: string, fingerprint: string) => void
): void {
  const settings = loadSettings()
  if (settings.titleMode !== 'local') return

  let job = jobs.get(paneId)
  if (!job) {
    job = { timer: null, lastCallAt: 0, lastFingerprint: '', inFlight: false }
    jobs.set(paneId, job)
  }
  if (job.timer) clearTimeout(job.timer)

  const wait = Math.max(QUIET_MS, MIN_INTERVAL_MS - (Date.now() - job.lastCallAt))
  const fingerprint = fingerprintOutput(output)
  if (!fingerprint || fingerprint === job.lastFingerprint) return

  job.timer = setTimeout(() => {
    job.timer = null
    queue = queue.then(() => runTitle(paneId, output, fingerprint, apply)).catch(() => undefined)
  }, wait)
}

async function runTitle(
  paneId: string,
  output: string,
  fingerprint: string,
  apply: (title: string, fingerprint: string) => void
): Promise<void> {
  const job = jobs.get(paneId)
  if (!job || job.inFlight) return
  if (fingerprint === job.lastFingerprint) return

  const settings = loadSettings()
  if (settings.titleMode !== 'local') return

  const excerpt = recentLines(output, TAIL_LINES)
  if (excerpt.split('\n').filter((l) => l.trim().length > 2).length < 4) return

  job.inFlight = true
  job.lastCallAt = Date.now()
  try {
    const raw = await generateLocalTitle(excerpt)
    const title = sanitizeTitle(raw)
    if (!title) return
    job.lastFingerprint = fingerprint
    apply(title, fingerprint)
  } catch {
    // 初回ダウンロード失敗・推論失敗はヒューリスティックのまま
  } finally {
    job.inFlight = false
  }
}

export function fingerprintOutput(raw: string): string {
  return hash(recentLines(raw, TAIL_LINES))
}

function recentLines(raw: string, limit: number): string {
  const text = stripAnsi(raw)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 1)
    .filter((line) => !/esc to interrupt|ctrl\+c|^\s*[│├└⎿]/.test(line))
  return text.slice(-limit).join('\n').slice(-4000)
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
    .replace(/^(タイトル|title)\s*[:：]\s*/i, '')
    .replace(/[。．.]+$/g, '')
    .trim()
  if (cleaned.length < 4 || cleaned.length > 40) return null
  if (/次のターミナル|出力から/.test(cleaned)) return null
  return cleaned
}

function stripAnsi(input: string): string {
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b./g, '')
}

function hash(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}
