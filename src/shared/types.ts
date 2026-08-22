export type MilestoneStatus = 'pending' | 'done'

export interface Milestone {
  id: string
  taskId: string
  title: string
  deadline: number
  workStartAt: number | null
  status: MilestoneStatus
}

export interface Task {
  id: string
  title: string
  goal: string
  createdAt: number
  archivedAt: number | null
  lastCwd: string | null
}

export interface TaskView extends Task {
  milestones: Milestone[]
  visibleNow: boolean
  priority: number
  nearestDeadline: number | null
  overdue: boolean
}

export type AgentStatus = 'idle' | 'running' | 'needs_human' | 'exited' | 'none'

export interface TerminalSessionInfo {
  paneId: string
  taskId: string
  ptyPid: number | null
  cwd: string
  gitRoot: string | null
  lastCwd: string | null
  status: AgentStatus
  /** いま／直近のエージェントまたはコマンド名 */
  activity: string | null
  /** タスク一覧に並べる短い作業ラベル（エージェント内 Tasks 優先） */
  activities: string[]
  alive: boolean
}

export type LlmProviderId = 'openrouter' | 'gemini' | 'vertex'

export interface AppSettings {
  provider: LlmProviderId
  model: string
  vertexProject: string
  vertexLocation: string
  mcpServersJson: string
  openrouterApiKey: string
  geminiApiKey: string
}

export interface CreateTaskInput {
  title: string
  goal?: string
  milestones?: CreateMilestoneInput[]
}

export interface UpdateTaskInput {
  title?: string
  goal?: string
  archived?: boolean
}

export interface CreateMilestoneInput {
  title: string
  deadline: number
  workStartAt?: number | null
}

export interface AgentRunResult {
  text: string
  createdTaskId?: string
}

export type AgentStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'done'; text: string; createdTaskId?: string }
  | { type: 'error'; message: string }

export interface McpTestResult {
  ok: boolean
  message: string
  serverCount: number
}

export type TaskViewMode = 'now' | 'all'

export interface CommandDef {
  id: string
  title: string
  subtitle?: string
  aliases: string[]
  keywords: string[]
  group: 'task' | 'view' | 'term' | 'app'
}
