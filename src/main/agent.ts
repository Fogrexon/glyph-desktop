import type { LlmTool } from './llm/types'
import { createProvider } from './llm/registry'
import type { LlmMessage } from './llm/types'
import { defaultModelFor, loadSettings, patchSettings } from './settings'
import {
  addMilestone,
  archiveTask,
  completeMilestone,
  completeNearestMilestone,
  createTask,
  getTaskView,
  listTaskViews,
  updateTask
} from './tasks'
import { getSession, listSessions, restartSession } from './terminals'
import { GLYPH_SELF_TASK_ID } from '@shared/ids'
import type {
  AgentContext,
  AgentRunResult,
  AgentStreamEvent,
  AgentUiAction,
  LlmProviderId
} from '@shared/types'
import { exitWorkspace, minimizeApp } from './windows'

const SYSTEM = `あなたは Glyph デスクトップの操作エージェントです。
ユーザーの自然言語を、このアプリでできる操作に翻訳して実行します。

できること:
- タスク・ゴール・マイルストーンの作成 / 更新 / 完了 / 開く
- 表示切替（now=開始日到来分だけ、all=全部）
- 設定（プロバイダ・モデル・API キー・MCP）をパレット内で開く。パレットは閉じない
- ショートカット（キー割り当て）一覧をパレット内で開く。パレットは閉じない
- ターミナルの状態確認・再起動・左右/上下分割・ペイン閉じる・フォーカス
- ワークスペースを閉じてランチャーへ戻る、トレイに退避
- Glyph 自身の開発タスクを開く

禁止:
- コードを書かない
- ターミナルにシェルコマンドを打ち込まない（実装・資料作成は各タスクのターミナルで動くエージェントに任せる）
- API キーを会話に出さない。キー入力が必要なら設定画面を開く

思想:
- マイルストーンに workStartAt（作業開始日時）がある場合、それより前の仕事は「今」の一覧から消す。
- 優先度は未完了マイルストーンの締め切りから決まる。期限超過が最優先。
- あいまいな依頼でも、確認できる範囲で実行し、足りない情報は短く質問する。
- これはマルチターンの会話。直前までの操作と状態を踏まえる。

返答は日本語。実行した操作を簡潔に報告する。`

export const WORKSPACE_TOOLS: LlmTool[] = [
  {
    name: 'list_tasks',
    description: 'タスク一覧。now は開始日到来分だけ。all は隠している分も含む。',
    parameters: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['now', 'all'] }
      }
    }
  },
  {
    name: 'get_task',
    description: 'タスク詳細とマイルストーン、ターミナル cwd を取得する。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  },
  {
    name: 'create_task',
    description: 'タスクを作る。milestones の日時は UNIX ミリ秒。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        goal: { type: 'string' },
        milestones: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              deadline: { type: 'number' },
              workStartAt: { type: 'number' }
            },
            required: ['title', 'deadline']
          }
        }
      },
      required: ['title']
    }
  },
  {
    name: 'update_task',
    description: 'タスクのタイトルやゴールを更新。archived=true で完了扱いにする。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        goal: { type: 'string' },
        archived: { type: 'boolean' }
      },
      required: ['id']
    }
  },
  {
    name: 'add_milestone',
    description: 'マイルストーンを追加。deadline / workStartAt は UNIX ミリ秒。',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        title: { type: 'string' },
        deadline: { type: 'number' },
        workStartAt: { type: 'number' }
      },
      required: ['taskId', 'title', 'deadline']
    }
  },
  {
    name: 'complete_milestone',
    description: 'マイルストーンを完了にする。id 省略時は taskId の直近未完了を完了。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        taskId: { type: 'string' }
      }
    }
  },
  {
    name: 'open_task',
    description: '指定タスクをワークスペースで開き、そのターミナルを表示する。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  },
  {
    name: 'get_workspace_state',
    description:
      '選択中タスク、表示モード、設定（キー除く）、全ターミナルセッション、タスク概要。',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'set_view_mode',
    description: 'タスク一覧の表示。now=今やる仕事だけ。all=開始日前も含む全部。',
    parameters: {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['now', 'all'] } },
      required: ['mode']
    }
  },
  {
    name: 'open_settings',
    description:
      'パレット内の設定一覧を開く（プロバイダ・モデル・API キー・MCP）。パレットは閉じない。キー割り当てには open_shortcuts を使う。',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'open_shortcuts',
    description:
      'パレット内のショートカット（キー割り当て）一覧を開く。キー設定を見せて／変えて、と言われたとき。パレットは閉じない。',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'open_task_editor',
    description: 'タスク作成フォームを開く。自然言語ではなく画面で入力させたいとき。',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'update_settings',
    description: 'パレット用プロバイダまたはモデル ID を変える。API キーは扱わない。',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['openrouter', 'gemini', 'vertex'] },
        model: { type: 'string' }
      }
    }
  },
  {
    name: 'restart_terminal',
    description: 'PTY を作り直す。paneId 省略時は選択中ペイン。',
    parameters: {
      type: 'object',
      properties: { paneId: { type: 'string' } }
    }
  },
  {
    name: 'split_terminal',
    description: '選択中ペインを分割。horizontal=左右、vertical=上下。',
    parameters: {
      type: 'object',
      properties: { dir: { type: 'string', enum: ['horizontal', 'vertical'] } },
      required: ['dir']
    }
  },
  {
    name: 'close_pane',
    description: '選択中の分割ペインを閉じる。最後の1枚は閉じられない。',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'focus_pane',
    description: '分割ペインのフォーカスを移す。',
    parameters: {
      type: 'object',
      properties: {
        dir: { type: 'string', enum: ['left', 'right', 'up', 'down', 'next', 'prev'] }
      },
      required: ['dir']
    }
  },
  {
    name: 'minimize_app',
    description: 'トレイに退避。ターミナルはバックグラウンドで継続。完全終了ではない。',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'exit_workspace',
    description: 'ワークスペースを閉じてランチャーに戻る。ターミナルは維持。',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'open_glyph_self',
    description: 'このリポジトリ（Glyph 自身）の開発タスクを開く。',
    parameters: { type: 'object', properties: {} }
  }
]

interface ToolContext {
  createdTaskId?: string
  actions: AgentUiAction[]
  ui: AgentContext
}

let conversation: LlmMessage[] = [{ role: 'system', content: SYSTEM }]

function pushAction(
  ctx: ToolContext,
  action: AgentUiAction,
  emit?: (event: AgentStreamEvent) => void
): void {
  ctx.actions.push(action)
  emit?.({ type: 'action', action })
}

function paneIdOf(ctx: ToolContext, explicit?: unknown): string | null {
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim()
  return ctx.ui.activePaneId || ctx.ui.selectedTaskId
}

async function executeTool(
  name: string,
  rawArgs: string,
  ctx: ToolContext,
  emit?: (event: AgentStreamEvent) => void
): Promise<string> {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(rawArgs || '{}') as Record<string, unknown>
  } catch {
    args = {}
  }

  switch (name) {
    case 'list_tasks': {
      const view = args.view === 'all' ? 'all' : 'now'
      const tasks = await listTaskViews(view)
      return JSON.stringify(
        tasks.map((t) => ({
          id: t.id,
          title: t.title,
          goal: t.goal,
          visibleNow: t.visibleNow,
          overdue: t.overdue,
          nearestDeadline: t.nearestDeadline,
          lastCwd: t.lastCwd,
          milestones: t.milestones
        }))
      )
    }
    case 'get_task': {
      const id = String(args.id || '')
      const task = await getTaskView(id)
      const session = getSession(id)
      return JSON.stringify({ task, session })
    }
    case 'create_task': {
      const title = String(args.title || '').trim()
      if (!title) return JSON.stringify({ error: 'title required' })
      const created = await createTask({
        title,
        goal: args.goal ? String(args.goal) : '',
        milestones: Array.isArray(args.milestones)
          ? (
              args.milestones as Array<{ title: string; deadline: number; workStartAt?: number }>
            ).map((m) => ({
              title: m.title,
              deadline: Number(m.deadline),
              workStartAt: m.workStartAt ? Number(m.workStartAt) : null
            }))
          : []
      })
      ctx.createdTaskId = created.id
      pushAction(ctx, { type: 'selectTask', taskId: created.id }, emit)
      return JSON.stringify(created)
    }
    case 'update_task': {
      const updated = await updateTask(String(args.id), {
        title: args.title ? String(args.title) : undefined,
        goal: args.goal !== undefined ? String(args.goal) : undefined,
        archived: typeof args.archived === 'boolean' ? args.archived : undefined
      })
      return JSON.stringify(updated)
    }
    case 'add_milestone': {
      const ms = await addMilestone(String(args.taskId), {
        title: String(args.title),
        deadline: Number(args.deadline),
        workStartAt: args.workStartAt ? Number(args.workStartAt) : null
      })
      return JSON.stringify(ms)
    }
    case 'complete_milestone': {
      if (args.id) {
        await completeMilestone(String(args.id))
        return JSON.stringify({ ok: true, id: args.id })
      }
      if (args.taskId) {
        const done = await completeNearestMilestone(String(args.taskId))
        return JSON.stringify({ ok: true, milestone: done })
      }
      return JSON.stringify({ error: 'id or taskId required' })
    }
    case 'open_task': {
      const id = String(args.id)
      const task = await getTaskView(id)
      if (!task) return JSON.stringify({ error: 'task not found', id })
      pushAction(ctx, { type: 'selectTask', taskId: id }, emit)
      pushAction(ctx, { type: 'closePalette' }, emit)
      return JSON.stringify({ opened: id, title: task.title })
    }
    case 'get_workspace_state': {
      const settings = loadSettings()
      const sessions = listSessions()
      const tasks = await listTaskViews(ctx.ui.viewMode)
      return JSON.stringify({
        selectedTaskId: ctx.ui.selectedTaskId,
        viewMode: ctx.ui.viewMode,
        activePaneId: ctx.ui.activePaneId,
        settings: {
          provider: settings.provider,
          model: settings.model,
          vertexProject: settings.vertexProject,
          vertexLocation: settings.vertexLocation,
          hasOpenrouterKey: Boolean(settings.openrouterApiKey),
          hasGeminiKey: Boolean(settings.geminiApiKey)
        },
        sessions: sessions.map((s) => ({
          paneId: s.paneId,
          taskId: s.taskId,
          cwd: s.cwd,
          gitRoot: s.gitRoot,
          status: s.status,
          activity: s.activity,
          workTitle: s.workTitle,
          workItems: s.workItems,
          alive: s.alive
        })),
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          overdue: t.overdue,
          nearestDeadline: t.nearestDeadline,
          lastCwd: t.lastCwd
        }))
      })
    }
    case 'set_view_mode': {
      const mode = args.mode === 'all' ? 'all' : 'now'
      pushAction(ctx, { type: 'setViewMode', mode }, emit)
      return JSON.stringify({ ok: true, mode })
    }
    case 'open_settings': {
      pushAction(ctx, { type: 'openSettings' }, emit)
      return JSON.stringify({ ok: true })
    }
    case 'open_shortcuts': {
      pushAction(ctx, { type: 'openShortcuts' }, emit)
      return JSON.stringify({ ok: true })
    }
    case 'open_task_editor': {
      pushAction(ctx, { type: 'openTaskEditor' }, emit)
      return JSON.stringify({ ok: true })
    }
    case 'update_settings': {
      const providers: LlmProviderId[] = ['openrouter', 'gemini', 'vertex']
      const patch: { provider?: LlmProviderId; model?: string } = {}
      if (typeof args.provider === 'string' && providers.includes(args.provider as LlmProviderId)) {
        patch.provider = args.provider as LlmProviderId
      }
      if (typeof args.model === 'string' && args.model.trim()) {
        patch.model = args.model.trim()
      }
      if (!patch.provider && !patch.model) {
        return JSON.stringify({ error: 'provider or model required' })
      }
      if (patch.provider && !patch.model) {
        patch.model = defaultModelFor(patch.provider)
      }
      const next = patchSettings(patch)
      return JSON.stringify({
        ok: true,
        provider: next.provider,
        model: next.model
      })
    }
    case 'restart_terminal': {
      const paneId = paneIdOf(ctx, args.paneId)
      if (!paneId) return JSON.stringify({ error: 'no pane selected' })
      const info = restartSession(paneId)
      pushAction(ctx, { type: 'closePalette' }, emit)
      return JSON.stringify({ ok: true, paneId, cwd: info.cwd })
    }
    case 'split_terminal': {
      const dir = args.dir === 'vertical' ? 'vertical' : 'horizontal'
      if (!ctx.ui.selectedTaskId) return JSON.stringify({ error: 'no task selected' })
      pushAction(ctx, { type: 'splitPane', dir }, emit)
      pushAction(ctx, { type: 'closePalette' }, emit)
      return JSON.stringify({ ok: true, dir })
    }
    case 'close_pane': {
      if (!ctx.ui.selectedTaskId) return JSON.stringify({ error: 'no task selected' })
      pushAction(ctx, { type: 'closePane' }, emit)
      pushAction(ctx, { type: 'closePalette' }, emit)
      return JSON.stringify({ ok: true })
    }
    case 'focus_pane': {
      const dir = String(args.dir || '')
      const allowed = ['left', 'right', 'up', 'down', 'next', 'prev'] as const
      if (!allowed.includes(dir as (typeof allowed)[number])) {
        return JSON.stringify({ error: 'dir must be left|right|up|down|next|prev' })
      }
      pushAction(ctx, { type: 'focusPane', dir: dir as (typeof allowed)[number] }, emit)
      return JSON.stringify({ ok: true, dir })
    }
    case 'minimize_app': {
      minimizeApp()
      return JSON.stringify({ ok: true })
    }
    case 'exit_workspace': {
      exitWorkspace()
      return JSON.stringify({ ok: true })
    }
    case 'open_glyph_self': {
      pushAction(ctx, { type: 'selectTask', taskId: GLYPH_SELF_TASK_ID }, emit)
      pushAction(ctx, { type: 'closePalette' }, emit)
      return JSON.stringify({ opened: GLYPH_SELF_TASK_ID })
    }
    case 'archive_task': {
      await archiveTask(String(args.id))
      return JSON.stringify({ ok: true })
    }
    default:
      return JSON.stringify({ error: `unknown tool ${name}` })
  }
}

export function resetWorkspaceAgent(): void {
  conversation = [{ role: 'system', content: SYSTEM }]
}

function formatContext(ui: AgentContext): string {
  return [
    `選択中タスクID: ${ui.selectedTaskId || '(なし)'}`,
    `表示モード: ${ui.viewMode}`,
    `アクティブペインID: ${ui.activePaneId || '(なし)'}`
  ].join('\n')
}

export async function runWorkspaceAgent(
  prompt: string,
  emit?: (event: AgentStreamEvent) => void,
  context?: AgentContext
): Promise<AgentRunResult> {
  const settings = loadSettings()
  const provider = createProvider(settings)
  const ui: AgentContext = context ?? {
    selectedTaskId: null,
    viewMode: 'now',
    activePaneId: null
  }
  const ctx: ToolContext = { actions: [], ui }
  conversation.push({
    role: 'user',
    content: `現在時刻(ms): ${Date.now()}\nISO: ${new Date().toISOString()}\n${formatContext(ui)}\n\n${prompt}`
  })

  try {
    for (let i = 0; i < 8; i++) {
      let streamed = ''
      const result = await provider.complete({
        model: settings.model,
        messages: conversation,
        tools: WORKSPACE_TOOLS,
        onDelta: (text) => {
          streamed += text
          emit?.({ type: 'delta', text })
        }
      })

      if (!result.toolCalls.length) {
        const text = result.text || streamed || '完了しました。'
        conversation.push({ role: 'assistant', content: text })
        emit?.({ type: 'done', text, createdTaskId: ctx.createdTaskId })
        return { text, createdTaskId: ctx.createdTaskId, actions: ctx.actions }
      }

      conversation.push({
        role: 'assistant',
        content: result.text,
        toolCalls: result.toolCalls
      })

      for (const call of result.toolCalls) {
        emit?.({ type: 'tool', name: call.name })
        const output = await executeTool(call.name, call.arguments, ctx, emit)
        conversation.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: output
        })
      }
    }

    const text = '操作が長すぎたため途中で止めました。もう一度指示してください。'
    emit?.({ type: 'done', text, createdTaskId: ctx.createdTaskId })
    return { text, createdTaskId: ctx.createdTaskId, actions: ctx.actions }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emit?.({ type: 'error', message })
    throw error
  }
}

export function testMcpConfig(jsonText: string): {
  ok: boolean
  message: string
  serverCount: number
} {
  try {
    const parsed = JSON.parse(jsonText) as { mcpServers?: Record<string, unknown> }
    const servers = parsed.mcpServers ?? (parsed as Record<string, unknown>)
    const count = servers && typeof servers === 'object' ? Object.keys(servers).length : 0
    return {
      ok: true,
      serverCount: count,
      message:
        count === 0
          ? 'JSON は妥当です。mcpServers は空です（接続の骨組みのみ）。'
          : `${count} 件の MCP サーバ定義を読みました。実際の接続は次のフェーズです。`
    }
  } catch (error) {
    return {
      ok: false,
      serverCount: 0,
      message: error instanceof Error ? error.message : 'JSON を解析できません'
    }
  }
}
