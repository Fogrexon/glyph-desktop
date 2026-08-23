import { execFile } from 'child_process'
import { homedir } from 'os'
import type { IPty } from 'node-pty'
import * as nodePty from 'node-pty'
import type { TerminalSessionInfo } from '@shared/types'
import { findGitRoot } from './cwd'
import { EMPTY_ACTIVITY, labelFromProcessCommand, mergeActivitySnapshot, type ActivitySnapshot } from './activity'
import { OscScanner } from './osc'
import { cwdForPane, resolveShellLaunch } from './shell-hooks'
import { detectStatus, type StatusSnapshot } from './status'
import { rememberCwd } from './tasks'
import { forgetPaneCwd, rememberPaneCwd } from './pane-cwd'
import { cancelAllWorkTitles, cancelWorkTitle, scheduleWorkTitle } from './work-title'

export type DataHandler = (paneId: string, data: string) => void
export type StatusHandler = (info: TerminalSessionInfo) => void
export type ExitHandler = (paneId: string, exitCode: number) => void

const OUTPUT_BUFFER_MAX = 1_000_000

interface Session {
  paneId: string
  taskId: string
  pty: IPty
  cwd: string
  gitRoot: string | null
  lastCwd: string | null
  scanner: OscScanner
  status: StatusSnapshot
  activity: ActivitySnapshot
  llmTitle: string | null
  alive: boolean
  /** Recent PTY output so a late-attached xterm can catch up. */
  outputBuffer: string
}

const sessions = new Map<string, Session>()
let onData: DataHandler | null = null
let onStatus: StatusHandler | null = null
let onExit: ExitHandler | null = null
let idleTimer: NodeJS.Timeout | null = null

export function setTerminalListeners(handlers: {
  data?: DataHandler
  status?: StatusHandler
  exit?: ExitHandler
}): void {
  onData = handlers.data ?? onData
  onStatus = handlers.status ?? onStatus
  onExit = handlers.exit ?? onExit
}

/** A paneId is either the taskId itself (primary pane) or `${taskId}::<suffix>`. */
function taskIdOf(paneId: string): string {
  const idx = paneId.indexOf('::')
  return idx === -1 ? paneId : paneId.slice(0, idx)
}

function toInfo(session: Session): TerminalSessionInfo {
  return {
    paneId: session.paneId,
    taskId: session.taskId,
    ptyPid: session.alive ? session.pty.pid : null,
    cwd: session.cwd,
    gitRoot: session.gitRoot,
    lastCwd: session.lastCwd,
    status: session.alive ? session.status.status : 'exited',
    activity: session.activity.activity,
    workTitle: session.llmTitle || session.activity.workTitle,
    workItems: session.activity.workItems,
    alive: session.alive
  }
}

function emitStatus(session: Session): void {
  onStatus?.(toInfo(session))
}

function applyCwd(session: Session, cwd: string): void {
  if (!cwd || cwd === session.cwd) return
  session.cwd = cwd
  session.lastCwd = cwd
  session.gitRoot = findGitRoot(cwd)
  rememberPaneCwd(session.paneId, cwd)
  void rememberCwd(session.taskId, cwd)
  emitStatus(session)
}

function spawnPty(paneId: string): Session {
  const cwd = cwdForPane(paneId)
  const launch = resolveShellLaunch(cwd)
  const pty = nodePty.spawn(launch.file, launch.args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 32,
    cwd: launch.cwd,
    env: launch.env as Record<string, string>
  })

  const session: Session = {
    paneId,
    taskId: taskIdOf(paneId),
    pty,
    cwd: launch.cwd || homedir(),
    gitRoot: findGitRoot(launch.cwd || homedir()),
    lastCwd: launch.cwd || homedir(),
    scanner: new OscScanner(),
    status: { status: 'idle', lastOutputAt: Date.now() },
    activity: { ...EMPTY_ACTIVITY },
    llmTitle: null,
    alive: true,
    outputBuffer: ''
  }

  pty.onData((data) => {
    session.outputBuffer = appendOutput(session.outputBuffer, data)
    const events = session.scanner.push(data)
    if (events.cwds.length > 0) {
      applyCwd(session, events.cwds[events.cwds.length - 1])
    }
    session.activity = mergeActivitySnapshot({
      previous: session.activity,
      chunk: data,
      recentText: session.outputBuffer,
      commands: events.commands,
      preferClaudeFiles: session.paneId === session.taskId
    })
    session.status = detectStatus(data, session.status, Date.now(), session.alive)
    emitStatus(session)
    onData?.(session.paneId, data)
    scheduleWorkTitle(
      {
        paneId: session.paneId,
        taskId: session.taskId,
        output: () => sessions.get(session.paneId)?.outputBuffer ?? '',
        currentTitle: () => sessions.get(session.paneId)?.llmTitle ?? null
      },
      (title) => {
        const current = sessions.get(session.paneId)
        if (!current?.alive) return
        if (current.llmTitle === title) return
        current.llmTitle = title
        emitStatus(current)
      }
    )
  })

  pty.onExit(({ exitCode }) => {
    session.alive = false
    session.status = { status: 'exited', lastOutputAt: session.status.lastOutputAt }
    session.llmTitle = null
    session.activity = { ...EMPTY_ACTIVITY }
    cancelWorkTitle(session.paneId)
    emitStatus(session)
    onExit?.(session.paneId, exitCode)
  })

  sessions.set(paneId, session)
  rememberPaneCwd(paneId, session.cwd)
  emitStatus(session)
  return session
}

export function ensureSession(paneId: string): TerminalSessionInfo {
  const existing = sessions.get(paneId)
  if (existing?.alive) return toInfo(existing)
  if (existing && !existing.alive) {
    sessions.delete(paneId)
  }
  return toInfo(spawnPty(paneId))
}

/** Snapshot for a late-attached xterm. Prefer last full-screen clear. */
export function replayOutput(paneId: string): string {
  const session = sessions.get(paneId)
  if (!session?.outputBuffer) return ''
  return snapshotForReplay(session.outputBuffer)
}

function appendOutput(prev: string, chunk: string): string {
  const next = prev + chunk
  if (next.length <= OUTPUT_BUFFER_MAX) return next
  return dropIncompletePrefix(next.slice(-OUTPUT_BUFFER_MAX))
}

function snapshotForReplay(buffer: string): string {
  if (!buffer) return ''
  return dropIncompletePrefix(buffer)
}

/** Skip a truncated first line after a budget slice. Keep CSI that starts the buffer. */
function dropIncompletePrefix(s: string): string {
  if (!s || s.charCodeAt(0) === 0x1b) return s
  const nl = s.indexOf('\n')
  return nl >= 0 ? s.slice(nl + 1) : s
}

/** Spawn without marking backlog consumed — used at app startup. */
export function warmSession(paneId: string): TerminalSessionInfo {
  const existing = sessions.get(paneId)
  if (existing?.alive) return toInfo(existing)
  if (existing && !existing.alive) sessions.delete(paneId)
  return toInfo(spawnPty(paneId))
}

export function restartSession(paneId: string): TerminalSessionInfo {
  const existing = sessions.get(paneId)
  if (existing?.alive) {
    try {
      existing.pty.kill()
    } catch {
      // ignore
    }
    sessions.delete(paneId)
    cancelWorkTitle(paneId)
  }
  return toInfo(spawnPty(paneId))
}

export function killSession(paneId: string, forgetCwd = false): void {
  const existing = sessions.get(paneId)
  if (!existing) {
    if (forgetCwd) forgetPaneCwd(paneId)
    return
  }
  try {
    if (existing.alive) existing.pty.kill()
  } catch {
    // ignore
  }
  sessions.delete(paneId)
  cancelWorkTitle(paneId)
  if (forgetCwd) forgetPaneCwd(paneId)
}

export function writeSession(paneId: string, data: string): void {
  sessions.get(paneId)?.pty.write(data)
}

export function resizeSession(paneId: string, cols: number, rows: number): void {
  const session = sessions.get(paneId)
  if (!session?.alive) return
  try {
    session.pty.resize(Math.max(cols, 10), Math.max(rows, 6))
  } catch {
    // ignore
  }
}

export function getSession(paneId: string): TerminalSessionInfo | null {
  const session = sessions.get(paneId)
  return session ? toInfo(session) : null
}

export function listSessions(): TerminalSessionInfo[] {
  return [...sessions.values()].map(toInfo)
}

export function disposeAllSessions(): void {
  for (const session of sessions.values()) {
    try {
      if (session.alive) session.pty.kill()
    } catch {
      // ignore
    }
  }
  sessions.clear()
  cancelAllWorkTitles()
}

function probePidCwd(pid: number): Promise<string | null> {
  if (process.platform === 'win32') {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    execFile(
      'lsof',
      ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'],
      { timeout: 1500 },
      (error, stdout) => {
        if (error) {
          resolve(null)
          return
        }
        const line = stdout.split('\n').find((row) => row.startsWith('n'))
        resolve(line ? line.slice(1).trim() : null)
      }
    )
  })
}

export function startIdleWatcher(): void {
  if (idleTimer) return
  idleTimer = setInterval(() => {
    const now = Date.now()
    for (const session of sessions.values()) {
      if (!session.alive) continue
      const next = detectStatus('', session.status, now, true)
      let changed = next.status !== session.status.status
      if (changed) session.status = next

      const refreshed = mergeActivitySnapshot({
        previous: session.activity,
        chunk: '',
        recentText: session.outputBuffer,
        commands: [],
        preferClaudeFiles: session.paneId === session.taskId
      })
      if (
        refreshed.activity !== session.activity.activity ||
        refreshed.workTitle !== session.activity.workTitle ||
        refreshed.workItems.join('\0') !== session.activity.workItems.join('\0')
      ) {
        session.activity = refreshed
        changed = true
      }

      if (changed) emitStatus(session)

      void probePidCwd(session.pty.pid).then((cwd) => {
        if (cwd) applyCwd(session, cwd)
      })
      void probeChildActivity(session.pty.pid).then((label) => {
        if (!label) return
        if (session.activity.activity === label) return
        if (session.activity.workItems.length > 0 || session.activity.workTitle) {
          if (session.activity.activity && session.activity.activity !== label) {
            session.activity = { ...session.activity, activity: label }
            emitStatus(session)
          }
          return
        }
        session.activity = {
          ...session.activity,
          activity: label
        }
        emitStatus(session)
      })
    }
  }, 2000)
}

function probeChildActivity(pid: number): Promise<string | null> {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const script = [
        `$p=${pid}`,
        '$rows=@()',
        'function Walk($id){',
        '  Get-CimInstance Win32_Process -Filter "ParentProcessId=$id" -ErrorAction SilentlyContinue | ForEach-Object {',
        '    $rows += $_',
        '    Walk $_.ProcessId',
        '  }',
        '}',
        'Walk $p',
        '($rows | ForEach-Object { "$($_.Name) $($_.CommandLine)" }) -join [char]10'
      ].join('; ')
      execFile(
        'powershell.exe',
        ['-NoProfile', '-Command', script],
        { timeout: 2500, windowsHide: true },
        (error, stdout) => {
          if (error || !stdout) {
            resolve(null)
            return
          }
          resolve(pickAgentLabel(stdout))
        }
      )
    })
  }

  return new Promise((resolve) => {
    execFile(
      'ps',
      ['-o', 'pid=,command=', '--ppid', String(pid)],
      { timeout: 1500 },
      (error, stdout) => {
        if (error || !stdout) {
          resolve(null)
          return
        }
        resolve(pickAgentLabel(stdout))
      }
    )
  })
}

function pickAgentLabel(stdout: string): string | null {
  const known = new Set(['claude', 'codex', 'gemini', 'aider', 'cursor', 'opencode', 'crush'])
  for (const line of stdout.split(/\r?\n/)) {
    const lower = line.toLowerCase()
    if (lower.includes('claude')) return 'claude'
    if (lower.includes('codex')) return 'codex'
    if (lower.includes('gemini')) return 'gemini'
    if (lower.includes('aider')) return 'aider'
    if (lower.includes('opencode')) return 'opencode'
    const label = labelFromProcessCommand(line)
    if (label && known.has(label)) return label
  }
  return null
}
