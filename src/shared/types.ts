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
  /** このペインの作業タイトル */
  workTitle: string | null
  /** このペインの作業リスト */
  workItems: string[]
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
  /** ヒューリスティック / アプリ内蔵の軽量モデル。ターミナル作業タイトル用 */
  titleMode: 'heuristic' | 'local'
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

export interface AgentContext {
  selectedTaskId: string | null
  viewMode: TaskViewMode
  activePaneId: string | null
}

export type AgentUiAction =
  | { type: 'selectTask'; taskId: string }
  | { type: 'setViewMode'; mode: TaskViewMode }
  | { type: 'openSettings' }
  | { type: 'openShortcuts' }
  | { type: 'openTaskEditor' }
  | { type: 'closePalette' }
  | { type: 'splitPane'; dir: 'horizontal' | 'vertical' }
  | { type: 'closePane' }
  | { type: 'focusPane'; dir: 'left' | 'right' | 'up' | 'down' | 'next' | 'prev' }
  | { type: 'toast'; text: string; kind?: 'info' | 'warn' | 'ok' }

export interface AgentRunResult {
  text: string
  createdTaskId?: string
  actions: AgentUiAction[]
}

export type AgentStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'action'; action: AgentUiAction }
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
