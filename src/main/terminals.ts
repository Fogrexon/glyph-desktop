import { execFile } from 'child_process'
import { homedir } from 'os'
import type { IPty } from 'node-pty'
import * as nodePty from 'node-pty'
import type { TerminalSessionInfo } from '@shared/types'
import { findGitRoot } from './cwd'
import { detectActivityFromOutput, shortActivityLabel } from './activity'
import { OscScanner } from './osc'
import { cwdForPane, resolveShellLaunch } from './shell-hooks'
import { detectStatus, type StatusSnapshot } from './status'
import { rememberCwd } from './tasks'
import { forgetPaneCwd, rememberPaneCwd } from './pane-cwd'

export type DataHandler = (paneId: string, data: string) => void
export type StatusHandler = (info: TerminalSessionInfo) => void
export type ExitHandler = (paneId: string, exitCode: number) => void

interface Session {
  paneId: string
  taskId: string
  pty: IPty
  cwd: string
  gitRoot: string | null
  lastCwd: string | null
  scanner: OscScanner
  status: StatusSnapshot
  activity: string | null
  alive: boolean
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
    activity: session.activity,
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
    activity: null,
    alive: true
  }

  pty.onData((data) => {
    const events = session.scanner.push(data)
    if (events.cwds.length > 0) {
      applyCwd(session, events.cwds[events.cwds.length - 1])
    }
    if (events.commands.length > 0) {
      const label = shortActivityLabel(events.commands[events.commands.length - 1])
      if (label) session.activity = label
    } else {
      session.activity = detectActivityFromOutput(data, session.activity)
    }
    session.status = detectStatus(data, session.status, Date.now(), session.alive)
    emitStatus(session)
    onData?.(session.paneId, data)
  })

  pty.onExit(({ exitCode }) => {
    session.alive = false
    session.status = { status: 'exited', lastOutputAt: session.status.lastOutputAt }
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

export function restartSession(paneId: string): TerminalSessionInfo {
  const existing = sessions.get(paneId)
  if (existing?.alive) {
    try {
      existing.pty.kill()
    } catch {
      // ignore
    }
    sessions.delete(paneId)
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
      if (next.status !== session.status.status) {
        session.status = next
        emitStatus(session)
      }
      void probePidCwd(session.pty.pid).then((cwd) => {
        if (cwd) applyCwd(session, cwd)
      })
    }
  }, 2000)
}
