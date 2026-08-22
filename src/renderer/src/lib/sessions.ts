import type { AgentStatus, TerminalSessionInfo } from '@shared/types'

export function sessionsForTask(
  sessions: Record<string, TerminalSessionInfo>,
  taskId: string
): TerminalSessionInfo[] {
  return Object.values(sessions)
    .filter((s) => s.taskId === taskId)
    .sort((a, b) => {
      if (a.paneId === taskId) return -1
      if (b.paneId === taskId) return 1
      return a.paneId.localeCompare(b.paneId)
    })
}

export function sessionForPane(
  sessions: Record<string, TerminalSessionInfo>,
  paneId: string | null | undefined
): TerminalSessionInfo | undefined {
  if (!paneId) return undefined
  return sessions[paneId]
}

export function taskAgentStatus(
  sessions: Record<string, TerminalSessionInfo>,
  taskId: string
): AgentStatus | undefined {
  const list = sessionsForTask(sessions, taskId)
  if (list.length === 0) return undefined
  if (list.some((s) => s.status === 'needs_human')) return 'needs_human'
  if (list.some((s) => s.status === 'running')) return 'running'
  if (list.some((s) => s.status === 'idle')) return 'idle'
  if (list.some((s) => s.status === 'exited')) return 'exited'
  return list[0]?.status
}

export function representativeSession(
  sessions: Record<string, TerminalSessionInfo>,
  taskId: string
): TerminalSessionInfo | undefined {
  const list = sessionsForTask(sessions, taskId)
  return list.find((s) => s.paneId === taskId) ?? list[0]
}

export function paneWorkTitle(session: TerminalSessionInfo): string | null {
  return session.workTitle || session.activity
}

export function paneWorkItems(session: TerminalSessionInfo): string[] {
  const title = paneWorkTitle(session)
  return (session.workItems ?? []).filter((item) => item !== title)
}

export function paneHasWork(session: TerminalSessionInfo): boolean {
  return Boolean(paneWorkTitle(session) || (session.workItems && session.workItems.length > 0))
}
