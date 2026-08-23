/**
 * ターミナル内コーディングエージェントの「いまの作業」を
 * ペインごとのタイトルと作業リストに落とす。
 *
 * 優先度:
 * 1. エージェントが表示する Tasks / Todo 行（Warp / Claude Code 風）
 * 2. 主ペインのみ ~/.claude/todos の in_progress / pending
 * 3. 直近バッファのユーザー指示・ツール呼び出し・ファイル操作
 * 4. 実行コマンド・エージェント名
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

/** チェック／進捗つきのタスク行（Warp ●◌✓、Claude ☐☑、[ ] など） */
const TASK_LINE_RE =
  /^\s*(?:≡\s*tasks\s*)?(?:[◌●○☑☐✓✔✘✗✕▫▪◦‧]|\[(?: |x|X|~|-)\])\s+(.+?)\s*$/gim

const IN_PROGRESS_GLYPH = /[●]|\[~\]|in[_\s-]?progress/i
const DONE_GLYPH = /[✓✔☑]|\[(?:x|X)\]|completed|done/i

const TOOL_NAMES =
  'Read|Write|Edit|Update|Bash|Grep|Glob|Search|Shell|Task|WebFetch|WebSearch|ApplyPatch|NotebookEdit|Delete|read_file|write_file|edit_file|apply_patch'

const TOOL_LINE_RE = new RegExp(
  `^\\s*(?:[⏺✦◆▶►•●]\\s*)?(?:Called?\\s+)?(${TOOL_NAMES})\\s*\\((.+)\\)\\s*$`,
  'i'
)

const BARE_TOOL_RE = new RegExp(`^\\s*[⏺✦◆▶►•]\\s+(${TOOL_NAMES})\\s+(.+)$`, 'i')

const FILE_OP_RE =
  /^\s*(?:Modified|Writing|Wrote|Editing|Edited|Created|Deleted|Reading|Updating|Updated)\s+(.+?\.\w+)\s*$/i

const GIT_DIFF_RE = /^\s*\+\+\+\s+b\/(.+)$/

const JP_OP_RE = /^\s*(?:編集|更新|作成|削除|実行|検索|読み取り)[:：]\s*(.+)$/

const TRIVIAL_CMD =
  /^(cd|ls|ll|la|pwd|clear|cls|exit|true|false|history|date|whoami|echo)\b/i

const WEAK_TITLE =
  /^(claude|codex|gemini|aider|cursor|opencode|crush|agent|npm|npx|node|python|zsh|bash|fish|sh)$/i

const TOOL_TITLE =
  /^(Read|Write|Edit|Update|Bash|Grep|Glob|Search|Shell|Task|WebFetch|WebSearch|ApplyPatch|Delete|NotebookEdit)\b/i

const BIN_TITLE =
  /^(git|npm|npx|pnpm|yarn|bun|python3?|node|cargo|go|make|docker|kubectl|ssh|brew|tsc|eslint|vitest|jest|pytest)\s/i

const SKIP_LINE = /esc to interrupt|ctrl\+c|press ctrl|^\s*[│├└⎿]/i

export interface ExtractedWork {
  active: string[]
  pending: string[]
}

export interface ActivitySnapshot {
  /** エージェント名や直近コマンド（短い識別子） */
  activity: string | null
  /** このペインが今やっていることのタイトル */
  workTitle: string | null
  /** このペインの作業リスト（エージェント Tasks 優先） */
  workItems: string[]
  lastCommand: string | null
}

export const EMPTY_ACTIVITY: ActivitySnapshot = {
  activity: null,
  workTitle: null,
  workItems: [],
  lastCommand: null
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

/** ANSI を除いたテキストからエージェント Tasks を抽出（全文。タグ化しない） */
export function extractAgentTasksFromText(raw: string): ExtractedWork {
  const text = stripAnsi(raw)
  const pending: string[] = []
  const active: string[] = []

  const blocks = text.split(/\n(?=.*?tasks\b)/i)
  const scanTargets = blocks.length > 1 ? blocks.slice(-3) : [text]

  for (const block of scanTargets) {
    TASK_LINE_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = TASK_LINE_RE.exec(block)) !== null) {
      const line = match[0]
      const body = phrase(match[1], 72)
      if (!body) continue
      if (/^tasks?\b/i.test(body)) continue
      if (DONE_GLYPH.test(line) && !IN_PROGRESS_GLYPH.test(line)) continue
      if (IN_PROGRESS_GLYPH.test(line)) {
        if (!active.includes(body)) active.push(body)
      } else if (!pending.includes(body) && !active.includes(body)) {
        pending.push(body)
      }
    }
  }

  return {
    active: active.slice(0, 8),
    pending: pending.slice(0, 8)
  }
}

/** 直近出力からユーザー指示・ツール・ファイル操作を新しい順で取る */
export function extractRecentWork(raw: string, limit = 8): string[] {
  const text = tailText(stripAnsi(raw), 16_000)
  const lines = text.split(/\r?\n/)
  const found: string[] = []
  const seen = new Set<string>()

  for (let i = lines.length - 1; i >= 0; i--) {
    const item = classifyWorkLine(lines[i] ?? '')
    if (!item || seen.has(item)) continue
    seen.add(item)
    found.push(item)
    if (found.length >= limit) break
  }

  return found
}

export function loadClaudeTodos(limit = 8): ExtractedWork {
  const empty: ExtractedWork = { active: [], pending: [] }
  const dir = join(homedir(), '.claude', 'todos')
  if (!existsSync(dir)) return empty

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
    return empty
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
        const text = phrase(String(row.activeForm || row.content || ''), 72)
        if (!text) continue
        if (status === 'in_progress' || status === 'in-progress') {
          if (!active.includes(text)) active.push(text)
        } else if (!pending.includes(text) && !active.includes(text)) {
          pending.push(text)
        }
      }
    } catch {
      // ignore bad json
    }
  }

  return {
    active: active.slice(0, limit),
    pending: pending.slice(0, limit)
  }
}

export function mergeActivitySnapshot(input: {
  previous: ActivitySnapshot
  chunk: string
  recentText: string
  commands: string[]
  preferClaudeFiles?: boolean
}): ActivitySnapshot {
  let activity = input.previous.activity
  const lastCommand =
    input.commands.length > 0
      ? input.commands[input.commands.length - 1]
      : input.previous.lastCommand

  if (lastCommand) {
    const label = shortActivityLabel(lastCommand)
    if (label) activity = label
  }
  activity = detectAgentFromOutput(input.chunk, activity)

  let extracted = extractAgentTasksFromText(input.recentText)
  if (
    extracted.active.length + extracted.pending.length === 0 &&
    input.preferClaudeFiles &&
    (activity === 'claude' || /claude/i.test(input.recentText))
  ) {
    extracted = loadClaudeTodos()
  }

  const recent = extractRecentWork(input.recentText)
  const todoItems = unique([...extracted.active, ...extracted.pending]).slice(0, 8)
  const workItems = todoItems.length > 0 ? todoItems : recent
  const workTitle = phrase(titleHintsFrom(extracted, recent)[0] ?? null, 48)

  return { activity, workTitle, workItems, lastCommand }
}

export const TITLE_HINT_LIMIT = 12

export interface TitleBrief {
  /** 最初の依頼と、方針が変わったときの直近依頼 */
  intents: string[]
  todos: string[]
  /** 触っているファイル名（タイトルそのものには使わない） */
  areas: string[]
}

/**
 * 生ログを読ませず、大局の種だけにする。
 * 依頼は最大 80KB 遡って古い順。Todo はエージェントの計画。場所はファイル名だけ。
 */
export function buildTitleBrief(raw: string): TitleBrief | null {
  const intents = extractUserIntents(raw)
  const extracted = extractAgentTasksFromText(raw)
  const todos = unique([...extracted.active, ...extracted.pending]).slice(0, 6)
  const areas = extractTouchedAreas(raw)
  if (intents.length === 0 && todos.length === 0) return null
  return { intents, todos, areas }
}

/** タイトル用。Todo とユーザー指示だけ。実行コマンド・ツール呼び出しは入れない。 */
export function extractTitleHints(raw: string, limit = TITLE_HINT_LIMIT): string[] {
  const extracted = extractAgentTasksFromText(raw)
  return titleHintsFrom(extracted, extractRecentWork(raw, 16)).slice(0, limit)
}

function titleHintsFrom(extracted: ExtractedWork, recent: string[]): string[] {
  return unique(
    [...extracted.active, ...extracted.pending, ...recent.filter((item) => !isCommandLikeTitle(item))]
  )
}

/** ツール呼び出しやシェルコマンドそのものをタイトルにしない */
export function isCommandLikeTitle(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (TRIVIAL_CMD.test(t) || WEAK_TITLE.test(t)) return true
  if (TOOL_TITLE.test(t) || BIN_TITLE.test(t)) return true
  if (/^[A-Za-z0-9_./-]+\.[A-Za-z]{1,8}$/.test(t)) return true
  return false
}

export function labelFromProcessCommand(commandLine: string | null | undefined): string | null {
  if (!commandLine) return null
  return shortActivityLabel(commandLine)
}

function classifyWorkLine(raw: string): string | null {
  const line = raw.replace(/\s+$/, '')
  if (!line || SKIP_LINE.test(line)) return null

  const prompt = asUserPrompt(line)
  if (prompt) return prompt

  const tool = line.match(TOOL_LINE_RE)
  if (tool) return formatTool(tool[1], tool[2])

  const bare = line.match(BARE_TOOL_RE)
  if (bare) return formatTool(bare[1], bare[2])

  const exec = line.match(/^\s*(?:[⏺✦◆]\s+)?exec\s+(.+)$/i)
  if (exec) return phrase(exec[1], 72)

  const bracket = line.match(/^\s*\[(?:Tool|tool):\s*(\w+)\]\s+(.+)$/)
  if (bracket) return formatTool(bracket[1], bracket[2])

  const fileOp = line.match(FILE_OP_RE)
  if (fileOp) return phrase(`${shortPath(fileOp[1])}`, 72)

  const git = line.match(GIT_DIFF_RE)
  if (git) return phrase(shortPath(git[1]), 72)

  const jp = line.match(JP_OP_RE)
  if (jp) return phrase(jp[1], 72)

  return null
}

function extractUserIntents(raw: string): string[] {
  const text = tailText(stripAnsi(raw), 80_000)
  const found: string[] = []
  const seen = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const prompt = asUserPrompt(line)
    if (!prompt || isCommandLikeTitle(prompt) || seen.has(prompt)) continue
    seen.add(prompt)
    found.push(prompt)
  }
  if (found.length <= 3) return found
  const last = found[found.length - 1]
  const head = found.slice(0, 2)
  return last && !head.includes(last) ? [...head, last] : head
}

function extractTouchedAreas(raw: string): string[] {
  const text = tailText(stripAnsi(raw), 40_000)
  const lines = text.split(/\r?\n/)
  const areas: string[] = []
  const seen = new Set<string>()
  for (let i = lines.length - 1; i >= 0; i--) {
    const name = areaFromWorkLine(lines[i] ?? '')
    if (!name || seen.has(name)) continue
    seen.add(name)
    areas.push(name)
    if (areas.length >= 8) break
  }
  return areas
}

function areaFromWorkLine(line: string): string | null {
  const tool = line.match(TOOL_LINE_RE) ?? line.match(BARE_TOOL_RE)
  if (tool) {
    const name = canonicalTool(tool[1])
    if (name === 'Bash' || name === 'Shell' || name === 'Grep' || name === 'Glob') return null
    if (name === 'WebSearch' || name === 'WebFetch' || name === 'Task') return null
    return areaName(tool[2])
  }
  const fileOp = line.match(FILE_OP_RE)
  if (fileOp) return areaName(fileOp[1])
  const git = line.match(GIT_DIFF_RE)
  if (git) return areaName(git[1])
  return null
}

function areaName(raw: string): string | null {
  let arg = raw.trim().replace(/^["']|["']$/g, '')
  const named = arg.match(/(?:path|file)\s*[:=]\s*["']?([^"',]+)/i)
  if (named) arg = named[1].trim()
  const base = arg.replace(/\\/g, '/').split('/').filter(Boolean).pop()
  if (!base || /node_modules|package-lock|^[.]/.test(base)) return null
  return base.replace(/\.(tsx?|jsx?|mjs|cjs|py|rs|go|md|css)$/i, '') || null
}

function asUserPrompt(line: string): string | null {
  const match =
    line.match(/^\s*(?:[❯➤]|>(?=\s+\S+\s+\S))\s+(.+)$/) ??
    line.match(/^\s*(?:user|human|you)[:：]\s+(.+)$/i)
  if (!match) return null
  const text = match[1].trim()
  if (text.length < 12) return null
  if (TRIVIAL_CMD.test(text)) return null
  if (/^[\w./-]+\s*(?:[<>|&]|$)/.test(text) && text.length < 40) return null
  return phrase(text, 80)
}

function formatTool(tool: string, rawArg: string): string | null {
  let arg = rawArg.trim().replace(/^["']|["']$/g, '')
  const named = arg.match(
    /(?:path|file|command|pattern|query|url|target)\s*[:=]\s*["']?([^"',]+)/i
  )
  if (named) arg = named[1].trim()
  arg = arg.replace(/["']$/, '').trim()
  if (!arg) return null

  const name = canonicalTool(tool)
  if (name === 'Bash' || name === 'Shell') return phrase(arg, 72)
  return phrase(`${name} ${shortPath(arg)}`, 72)
}

function canonicalTool(tool: string): string {
  const lower = tool.toLowerCase()
  if (lower === 'read_file') return 'Read'
  if (lower === 'write_file') return 'Write'
  if (lower === 'edit_file' || lower === 'update') return 'Edit'
  if (lower === 'apply_patch') return 'ApplyPatch'
  if (lower === 'shell') return 'Bash'
  return tool[0].toUpperCase() + tool.slice(1)
}

function shortPath(input: string): string {
  const cleaned = input.replace(/^file:\/\//, '').replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = cleaned.split('/').filter(Boolean)
  if (parts.length <= 2) return cleaned
  return parts.slice(-2).join('/')
}

function tailText(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(-maxChars)
}

function phrase(text: string | null | undefined, max: number): string | null {
  if (!text) return null
  const cleaned = text
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length < 2) return null
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max - 1)}…`
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
