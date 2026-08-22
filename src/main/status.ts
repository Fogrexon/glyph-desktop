import type { AgentStatus } from '@shared/types'

const NEED_HUMAN: RegExp[] = [
  /do you want to/i,
  /allow this/i,
  /yes, and don't ask again/i,
  /permission required/i,
  /waiting for your (approval|response)/i,
  /human (approval|input)/i,
  /needs permission/i,
  /\[y\/n\]/i,
  /\(y\/n\)/i,
  /press enter to (continue|confirm)/i,
  /would you like to/i
]

const RUNNING: RegExp[] = [
  /esc to interrupt/i,
  /thinking/i,
  /running tool/i,
  /bash\(/i,
  /working\.\.\./i
]

export interface StatusSnapshot {
  status: AgentStatus
  lastOutputAt: number
}

export function detectStatus(
  chunk: string,
  previous: StatusSnapshot,
  now: number,
  alive: boolean
): StatusSnapshot {
  if (!alive) {
    return { status: 'exited', lastOutputAt: previous.lastOutputAt }
  }

  const hasOutput = chunk.length > 0
  const lastOutputAt = hasOutput ? now : previous.lastOutputAt

  if (NEED_HUMAN.some((re) => re.test(chunk))) {
    return { status: 'needs_human', lastOutputAt }
  }

  if (RUNNING.some((re) => re.test(chunk))) {
    return { status: 'running', lastOutputAt }
  }

  if (hasOutput && previous.status === 'needs_human') {
    return { status: 'running', lastOutputAt }
  }

  if (now - lastOutputAt > 8000) {
    return { status: lastOutputAt === 0 ? 'idle' : 'idle', lastOutputAt }
  }

  if (hasOutput) {
    return {
      status:
        previous.status === 'exited'
          ? 'running'
          : previous.status === 'none'
            ? 'idle'
            : previous.status,
      lastOutputAt
    }
  }

  return { ...previous, lastOutputAt }
}
