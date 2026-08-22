/**
 * ターミナル内コーディングエージェントの「いまの作業」を
 * タスク一覧用の短いラベル列に落とす。
 *
 * 優先度:
 * 1. エージェントが表示する Tasks / Todo 行（Warp / Claude Code 風）
 * 2. ~/.claude/todos の in_progress / pending
 * 3. 実行コマンド・エージェント名
 */

import { homedir } from 'os'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const AGENT_MARKERS: Array<{ re: RegExp; label: string }> = [
  { re: /\bclaude\s*code\b/i, label: 'claude' },
  { re: /\banthropic\b/i, label: 'claude' },
  { re: /\bcodex\b/i, label: 'codex' },
  { re: /\bgemini(\s*cli)?\b/i, label: 'gemini' },
  { re: /\baider\b/i, label: 'aider' },
  { re: /\bcursor\s*agent\b/i, label: 'cursor' },
  { re: /\bopencode\b/i, label: 'opencode' },
  { re: /\bcrush\b/i, label: 'crush' },
  { re: /esc to interrupt/i, label: 'agent' },
  { re: /ctrl\+c to interrupt/i, label: 'agent' }
]

const BIN_ALIASES: Record<string, string> = {
  claude: 'claude',
  'claude-code': 'claude',
  codex: 'codex',
  gemini: 'gemini',
  aider: 'aider',
  'cursor-agent': 'cursor',
  opencode: 'opencode',
  crush: 'crush',
  npm: 'npm',
  npx: 'npx',
  pnpm: 'pnpm',
  yarn: 'yarn',
  bun: 'bun',
  git: 'git',
  docker: 'docker',
  'docker-compose': 'docker',
  kubectl: 'k8s',
  python: 'python',
  python3: 'python',
  node: 'node',
  cargo: 'cargo',
  go: 'go',
  make: 'make',
  cmake: 'cmake',
  vim: 'vim',
  nvim: 'nvim',
  code: 'code',
  ssh: 'ssh',
  brew: 'brew',
  tsc: 'tsc',
  eslint: 'eslint',
  prettier: 'prettier',
  vitest: 'vitest',
  jest: 'jest',
  pytest: 'pytest',
  uv: 'uv',
  poetry: 'poetry',
  pip: 'pip',
  pipenv: 'pip'
}

const STOP = new Set([
  'the',
  'a',
  'an',
  'to',
  'for',
  'of',
  'in',
  'on',
  'and',
  'or',
  'with',
  'from',
  'into',
  'via',
  'by',
  'as',
  'is',
  'be',
  'all',
  'this',
  'that',
  'every',
  'each'
])

/** チェック／進捗つきのタスク行（Warp ●◌✓、Claude ☐☑、[ ] など） */
const TASK_LINE_RE =
  /^\s*(?:≡\s*tasks\s*)?(?:[◌●○☑☐✓✔✘✗✕▫▪◦‧]|\[(?: |x|X|~|-)\])\s+(.+?)\s*$/gim

const IN_PROGRESS_GLYPH = /[●]|\[~\]|in[_\s-]?progress/i
const DONE_GLYPH = /[✓✔☑]|\[(?:x|X)\]|completed|done/i

export interface ActivitySnapshot {
  /** エージェント名や直近コマンド */
  activity: string | null
  /** タスク一覧に並べる短い作業ラベル（エージェント内 Tasks 優先） */
  activities: string[]
}

export function shortActivityLabel(command: string | null | undefined): string | null {
  if (!command) return null
  let line = command.trim()
  if (!line) return null

  line = line.replace(/^(?:\w+=\S+\s+)+/, '')
  line = line.split(/\s*(?:&&|\|\||;|\|)\s*/)[0]?.trim() ?? line

  const tokens = line.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null

  let bin = tokens[0]
  bin = bin.replace(/^.*[/\\]/, '').replace(/\.(exe|cmd|bat|ps1)$/i, '')
  if (!bin || bin === 'sudo' || bin === 'env') {
    if (!tokens[1]) return null
    return shortActivityLabel(tokens.slice(1).join(' '))
  }

  const lower = bin.toLowerCase()

  if (
    (lower === 'npm' || lower === 'pnpm' || lower === 'yarn' || lower === 'bun') &&
    tokens[1] === 'run' &&
    tokens[2]
  ) {
    return clip(tokens[2])
  }
  if (lower === 'npx' && tokens[1]) {
    return clip(tokens[1].replace(/^@[^/]+\//, ''))
  }
  if (lower === 'git' && tokens[1]) {
    return clip(`git-${tokens[1]}`)
  }

  return BIN_ALIASES[lower] ?? clip(bin)
}

export function detectAgentFromOutput(chunk: string, previous: string | null): string | null {
  if (!chunk) return previous
  for (const { re, label } of AGENT_MARKERS) {
    if (re.test(chunk)) {
      if (label === 'agent' && previous && previous !== 'agent') return previous
      return label
    }
  }
  return previous
}

/** ANSI を除いたテキストからエージェント Tasks を抽出 */
export function extractAgentTasksFromText(raw: string): string[] {
  const text = stripAnsi(raw)
  const pending: string[] = []
  const active: string[] = []

  // 「Tasks」見出し直後のブロックを優先して走査
  const blocks = text.split(/\n(?=.*?tasks\b)/i)
  const scanTargets = blocks.length > 1 ? blocks.slice(-3) : [text]

  for (const block of scanTargets) {
    TASK_LINE_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = TASK_LINE_RE.exec(block)) !== null) {
      const line = match[0]
      const body = match[1]?.trim()
      if (!body) continue
      if (/^tasks?\b/i.test(body)) continue
      if (DONE_GLYPH.test(line) && !IN_PROGRESS_GLYPH.test(line)) continue
      const label = oneWord(body)
      if (!label) continue
      if (IN_PROGRESS_GLYPH.test(line)) {
        if (!active.includes(label)) active.push(label)
      } else if (!pending.includes(label) && !active.includes(label)) {
        pending.push(label)
      }
    }
  }

  return [...active, ...pending].slice(0, 6)
}

export function loadClaudeTodoLabels(limit = 6): string[] {
  const dir = join(homedir(), '.claude', 'todos')
  if (!existsSync(dir)) return []

  let files: string[] = []
  try {
    files = readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => join(dir, name))
      .sort((a, b) => {
        try {
          return statSync(b).mtimeMs - statSync(a).mtimeMs
        } catch {
          return 0
        }
      })
      .slice(0, 8)
  } catch {
    return []
  }

  const active: string[] = []
  const pending: string[] = []

  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
      const todos = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as { todos?: unknown }).todos)
          ? ((raw as { todos: unknown[] }).todos)
          : []
      for (const item of todos) {
        if (!item || typeof item !== 'object') continue
        const row = item as { content?: unknown; activeForm?: unknown; status?: unknown }
        const status = String(row.status || '').toLowerCase()
        if (status === 'completed' || status === 'cancelled' || status === 'canceled') continue
        const text = String(row.activeForm || row.content || '').trim()
        const label = oneWord(text)
        if (!label) continue
        if (status === 'in_progress' || status === 'in-progress') {
          if (!active.includes(label)) active.push(label)
        } else if (!pending.includes(label) && !active.includes(label)) {
          pending.push(label)
        }
      }
    } catch {
      // ignore bad json
    }
  }

  return [...active, ...pending].slice(0, limit)
}

export function mergeActivitySnapshot(input: {
  previous: ActivitySnapshot
  chunk: string
  recentText: string
  commands: string[]
  preferClaudeFiles?: boolean
}): ActivitySnapshot {
  let activity = input.previous.activity

  if (input.commands.length > 0) {
    const label = shortActivityLabel(input.commands[input.commands.length - 1])
    if (label) activity = label
  }
  activity = detectAgentFromOutput(input.chunk, activity)

  const fromOutput = extractAgentTasksFromText(input.recentText)
  const fromFiles =
    input.preferClaudeFiles || activity === 'claude' || /claude/i.test(input.recentText)
      ? loadClaudeTodoLabels()
      : []

  const tasks = unique([...(fromOutput.length > 0 ? fromOutput : fromFiles)])
  const activities = tasks.length > 0 ? tasks : activity ? [activity] : []

  return { activity, activities }
}

export function labelFromProcessCommand(commandLine: string | null | undefined): string | null {
  if (!commandLine) return null
  return shortActivityLabel(commandLine)
}

function oneWord(text: string): string | null {
  const cleaned = text
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/…/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return null

  if (/[/\\]/.test(cleaned) || /\.\w{1,5}\b/.test(cleaned)) {
    const base = cleaned.split(/[/\\]/).pop() || cleaned
    return clip(base.replace(/\.\w+$/, ''))
  }

  const words = cleaned
    .split(' ')
    .map((w) => w.replace(/^[^A-Za-z0-9\u3040-\u30ff\u4e00-\u9faf]+|[^A-Za-z0-9\u3040-\u30ff\u4e00-\u9faf]+$/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w.toLowerCase()))

  if (words.length === 0) return clip(cleaned)
  if (words.length === 1) return clip(words[0].toLowerCase())
  // 短い複合語: auth-fix / 実装-認証
  const a = words[0]
  const b = words[1]
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(a) || /[\u3040-\u30ff\u4e00-\u9faf]/.test(b)) {
    return clip(`${a}${b}`)
  }
  return clip(`${a.toLowerCase()}-${b.toLowerCase()}`)
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

function clip(value: string, max = 16): string | null {
  const cleaned = value.replace(/\s+/g, '').slice(0, max)
  return cleaned || null
}

function unique(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    if (!item || seen.has(item)) continue
    seen.add(item)
    out.push(item)
  }
  return out
}
