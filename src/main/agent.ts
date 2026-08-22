import type { LlmTool } from './llm/types'
import { createProvider } from './llm/registry'
import type { LlmMessage } from './llm/types'
import { loadSettings } from './settings'
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
import { getSession } from './terminals'
import type { AgentRunResult, AgentStreamEvent } from '@shared/types'

const SYSTEM = `あなたは Glyph のワークスペース管理エージェントです。
役割はタスク管理だけです。コードを書かない、ターミナルにコマンドを送らない、資料本文を書かない。
ユーザーの自然言語を、タスク・ゴール・マイルストーン（締め切りと任意の作業開始日）の操作に翻訳します。

これはマルチターンの会話です。直前までの操作とタスク状態を踏まえ、追加の指示でタスクを改善・分割・締め切り調整してください。
足りない情報は短く質問してよい。

思想:
- マイルストーンに workStartAt（作業開始日時）がある場合、それより前の仕事は「今」の一覧から消す。
- 優先度は未完了マイルストーンの締め切りから決まる。期限超過が最優先。
- あいまいな依頼でも、確認できる範囲でタスクを切り、足りない日付は質問する。
- 高度な作業（実装・資料作成）は各タスクのターミナルで動くエージェントに任せる旨を短く伝える。

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
    description: '指定タスクをワークスペースで開くよう印を付ける。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  }
]

interface ToolContext {
  createdTaskId?: string
}

let conversation: LlmMessage[] = [{ role: 'system', content: SYSTEM }]

async function executeTool(name: string, rawArgs: string, ctx: ToolContext): Promise<string> {
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
      return JSON.stringify({ noted: id, title: task?.title, hint: 'パレットを閉じると一覧から開けます' })
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

export async function runWorkspaceAgent(
  prompt: string,
  emit?: (event: AgentStreamEvent) => void
): Promise<AgentRunResult> {
  const settings = loadSettings()
  const provider = createProvider(settings)
  const ctx: ToolContext = {}
  conversation.push({
    role: 'user',
    content: `現在時刻(ms): ${Date.now()}\nISO: ${new Date().toISOString()}\n\n${prompt}`
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
        return { text, createdTaskId: ctx.createdTaskId }
      }

      conversation.push({
        role: 'assistant',
        content: result.text,
        toolCalls: result.toolCalls
      })

      for (const call of result.toolCalls) {
        emit?.({ type: 'tool', name: call.name })
        const output = await executeTool(call.name, call.arguments, ctx)
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
    return { text, createdTaskId: ctx.createdTaskId }
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
