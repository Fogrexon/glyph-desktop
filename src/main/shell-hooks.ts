import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { app } from 'electron'
import { GLYPH_SELF_TASK_ID } from '@shared/ids'
import { savedPaneCwd } from './pane-cwd'

export interface ShellLaunch {
  file: string
  args: string[]
  env: NodeJS.ProcessEnv
  cwd: string
}

function hookDir(): string {
  const dir = join(app.getPath('userData'), 'shell-hooks')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function repoRoot(): string | null {
  const candidates = [process.cwd(), join(__dirname, '../..')]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'src', 'main', 'index.ts'))) {
      return dir
    }
  }
  return null
}

export function cwdForPane(paneId: string): string {
  const saved = savedPaneCwd(paneId)
  if (saved) return saved
  const taskId = paneId.includes('::') ? paneId.slice(0, paneId.indexOf('::')) : paneId
  if (taskId === GLYPH_SELF_TASK_ID) {
    return repoRoot() ?? homedir()
  }
  return homedir()
}

const BASH_HOOK = `
[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"
_glyph_report_cwd() {
  printf '\\033]7;file://%s%s\\033\\\\\\033]633;P;Cwd=%s\\033\\\\' "\${HOSTNAME:-localhost}" "$PWD" "$PWD"
}
_glyph_preexec() {
  local cmd="$BASH_COMMAND"
  case "$cmd" in
    ''|_glyph_*|PROMPT_COMMAND*|true|false) return ;;
  esac
  [ -n "\${COMP_LINE-}" ] && return
  printf '\\033]633;E;%s\\033\\\\' "\${cmd//;/ }"
  printf '\\033]633;C\\033\\\\'
}
_glyph_precmd() {
  printf '\\033]633;D\\033\\\\'
  _glyph_report_cwd
}
trap '_glyph_preexec' DEBUG
PROMPT_COMMAND="_glyph_precmd\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
_glyph_report_cwd
`

const ZSH_HOOK = `
if [ -f "$HOME/.zshrc" ]; then
  . "$HOME/.zshrc"
fi
_glyph_report_cwd() {
  printf '\\033]7;file://%s%s\\033\\\\\\033]633;P;Cwd=%s\\033\\\\' "\${HOST:-localhost}" "$PWD" "$PWD"
}
_glyph_preexec() {
  local cmd="$1"
  [ -z "$cmd" ] && return
  printf '\\033]633;E;%s\\033\\\\' "\${cmd//;/ }"
  printf '\\033]633;C\\033\\\\'
}
_glyph_precmd() {
  printf '\\033]633;D\\033\\\\'
  _glyph_report_cwd
}
autoload -U add-zsh-hook 2>/dev/null
add-zsh-hook chpwd _glyph_report_cwd 2>/dev/null
preexec_functions+=(_glyph_preexec)
precmd_functions+=(_glyph_precmd)
_glyph_report_cwd
`

const FISH_HOOK = `
function _glyph_report_cwd --on-variable PWD --on-event fish_prompt
  printf '\\033]633;D\\033\\\\'
  printf '\\033]7;file://%s%s\\033\\\\' (hostname) $PWD
  printf '\\033]633;P;Cwd=%s\\033\\\\' $PWD
end
function _glyph_preexec --on-event fish_preexec
  set -l cmd $argv[1]
  if test -n "$cmd"
    set -l safe (string replace -a ';' ' ' -- $cmd)
    printf '\\033]633;E;%s\\033\\\\' $safe
    printf '\\033]633;C\\033\\\\'
  end
end
_glyph_report_cwd
`

const POWERSHELL_HOOK = `
function prompt {
  $cwd = (Get-Location).Path
  $esc = [char]27
  $unix = $cwd -replace '\\\\','/'
  [Console]::Write("$esc]633;D$esc\\") | Out-Null
  [Console]::Write("$esc]7;file:///$unix$esc\\") | Out-Null
  [Console]::Write("$esc]633;P;Cwd=$cwd$esc\\") | Out-Null
  $shown = $cwd
  if ($env:USERPROFILE -and $cwd.StartsWith($env:USERPROFILE)) {
    $shown = '~' + $cwd.Substring($env:USERPROFILE.Length)
  }
  "PS $shown> "
}

try {
  Set-PSReadLineKeyHandler -Chord Enter -BriefDescription 'GlyphCommandReport' -ScriptBlock {
    $line = $null
    $cursor = $null
    [Microsoft.PowerShell.PSConsoleReadLine]::GetBufferState([ref]$line, [ref]$cursor)
    if ($line -and $line.Trim().Length -gt 0) {
      $esc = [char]27
      $safe = ($line -replace [char]27, '' -replace ';', ' ')
      [Console]::Write("$esc]633;E;$safe$esc\\") | Out-Null
      [Console]::Write("$esc]633;C$esc\\") | Out-Null
    }
    [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
  }
} catch {
  # PSReadLine が無い環境ではコマンド報告なし
}
`

export function resolveShellLaunch(cwd = homedir()): ShellLaunch {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor'
  }

  if (process.platform === 'win32') {
    const file = process.env.GLYPH_SHELL || 'powershell.exe'
    const hook = join(hookDir(), 'prompt.ps1')
    writeFileSync(hook, POWERSHELL_HOOK, 'utf8')
    return {
      file,
      args: ['-NoLogo', '-NoExit', '-File', hook],
      env,
      cwd
    }
  }

  const file = process.env.SHELL || '/bin/zsh'
  const dir = hookDir()

  if (file.includes('fish')) {
    const fish = join(dir, 'glyph.fish')
    writeFileSync(fish, FISH_HOOK, 'utf8')
    return { file, args: ['-i', '-C', `source ${fish}`], env, cwd }
  }

  if (file.includes('zsh')) {
    const zdot = join(dir, 'zdot')
    mkdirSync(zdot, { recursive: true })
    writeFileSync(join(zdot, '.zshrc'), ZSH_HOOK, 'utf8')
    return { file, args: ['-i'], env: { ...env, ZDOTDIR: zdot }, cwd }
  }

  const bashrc = join(dir, 'bashrc')
  writeFileSync(bashrc, BASH_HOOK, 'utf8')
  return { file, args: ['--rcfile', bashrc, '-i'], env, cwd }
}
