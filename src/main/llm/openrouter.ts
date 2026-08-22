import OpenAI from 'openai'
import type { LlmCompleteRequest, LlmCompleteResult, LlmMessage, LlmProvider } from './types'

function toOpenAiMessages(messages: LlmMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = []
  for (const message of messages) {
    if (message.role === 'system') {
      out.push({ role: 'system', content: message.content })
    } else if (message.role === 'user') {
      out.push({ role: 'user', content: message.content })
    } else if (message.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.toolCalls?.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments }
        }))
      })
    } else if (message.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: message.toolCallId || '',
        content: message.content
      })
    }
  }
  return out
}

export class OpenRouterProvider implements LlmProvider {
  id = 'openrouter'

  constructor(private apiKey: string) {}

  async complete(req: LlmCompleteRequest): Promise<LlmCompleteResult> {
    if (!this.apiKey) {
      throw new Error('OpenRouter の API キーが未設定です')
    }
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://glyph.desktop',
        'X-Title': 'Glyph'
      }
    })
    const stream = await client.chat.completions.create({
      model: req.model,
      stream: true,
      messages: toOpenAiMessages(req.messages),
      tools: req.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      })),
      tool_choice: 'auto'
    })

    let text = ''
    const tools = new Map<number, { id: string; name: string; arguments: string }>()
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta
      if (!delta) continue
      if (delta.content) {
        text += delta.content
        req.onDelta?.(delta.content)
      }
      for (const call of delta.tool_calls ?? []) {
        const index = call.index ?? 0
        const current = tools.get(index) ?? { id: '', name: '', arguments: '' }
        if (call.id) current.id = call.id
        if (call.function?.name) current.name += call.function.name
        if (call.function?.arguments) current.arguments += call.function.arguments
        tools.set(index, current)
      }
    }

    return {
      text,
      toolCalls: [...tools.values()]
        .filter((call) => call.name)
        .map((call) => ({
          id: call.id || `tool-${call.name}`,
          name: call.name,
          arguments: call.arguments
        }))
    }
  }
}
