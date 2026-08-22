/** ターミナル出力・実行コマンドからタスク一覧用の短い一語ラベルを作る。 */

const AGENT_MARKERS: Array<{ re: RegExp; label: string }> = [
  { re: /\bclaude\s*code\b/i, label: 'claude' },
  { re: /\banthropic\b/i, label: 'claude' },
  { re: /\bcodex\b/i, label: 'codex' },
  { re: /\bgemini(\s*cli)?\b/i, label: 'gemini' },
  { re: /\baider\b/i, label: 'aider' },
  { re: /\bcursor\s*agent\b/i, label: 'cursor' },
  { re: /\bopencode\b/i, label: 'opencode' },
  { re: /\bcrush\b/i, label: 'crush' }
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

export function shortActivityLabel(command: string | null | undefined): string | null {
  if (!command) return null
  let line = command.trim()
  if (!line) return null

  // 先頭の env 代入を剥がす: FOO=1 BAR=2 cmd ...
  line = line.replace(/^(?:\w+=\S+\s+)+/, '')
  // パイプ・&& の先頭だけ見る
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

export function detectActivityFromOutput(chunk: string, previous: string | null): string | null {
  if (!chunk) return previous
  for (const { re, label } of AGENT_MARKERS) {
    if (re.test(chunk)) return label
  }
  return previous
}

function clip(value: string, max = 14): string | null {
  const cleaned = value.replace(/[^\w.@+-]+/g, '').slice(0, max)
  return cleaned || null
}
