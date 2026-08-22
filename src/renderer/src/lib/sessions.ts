import type { AgentStatus, TerminalSessionInfo } from '@shared/types'

export function sessionsForTask(
  sessions: Record<string, TerminalSessionInfo>,
  taskId: string
): TerminalSessionInfo[] {
  return Object.values(sessions).filter((s) => s.taskId === taskId)
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

/** タスク内ペインの作業ラベルを、出現順の一意リストで返す */
export function taskActivities(
  sessions: Record<string, TerminalSessionInfo>,
  taskId: string
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const session of sessionsForTask(sessions, taskId)) {
    const label = session.activity?.trim()
    if (!label || seen.has(label)) continue
    seen.add(label)
    out.push(label)
  }
  return out
}
