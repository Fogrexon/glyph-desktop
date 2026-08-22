import { GoogleGenAI, type FunctionDeclaration } from '@google/genai'
import { randomUUID } from 'crypto'
import type {
  LlmCompleteRequest,
  LlmCompleteResult,
  LlmMessage,
  LlmProvider,
  LlmTool
} from './types'

function toDeclarations(tools: LlmTool[]): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parameters
  }))
}

function toGeminiContents(messages: LlmMessage[]): Array<{
  role: 'user' | 'model'
  parts: Array<Record<string, unknown>>
}> {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = []
  for (const message of messages) {
    if (message.role === 'system') continue
    if (message.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: message.content }] })
    } else if (message.role === 'assistant') {
      const parts: Array<Record<string, unknown>> = []
      if (message.content) parts.push({ text: message.content })
      for (const call of message.toolCalls ?? []) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(call.arguments || '{}') as Record<string, unknown>
        } catch {
          args = {}
        }
        parts.push({ functionCall: { name: call.name, args } })
      }
      contents.push({ role: 'model', parts })
    } else if (message.role === 'tool') {
      let response: unknown = message.content
      try {
        response = JSON.parse(message.content)
      } catch {
        response = { result: message.content }
      }
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: message.name || 'tool',
              response
            }
          }
        ]
      })
    }
  }
  return contents
}

function systemText(messages: LlmMessage[]): string {
  return messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
}

export class GeminiProvider implements LlmProvider {
  id: string

  constructor(
    private options: {
      id: 'gemini' | 'vertex'
      apiKey?: string
      project?: string
      location?: string
    }
  ) {
    this.id = options.id
  }

  private client(): GoogleGenAI {
    if (this.options.id === 'vertex') {
      if (!this.options.project) {
        throw new Error('Vertex AI の project が未設定です（GOOGLE_CLOUD_PROJECT または設定）')
      }
      return new GoogleGenAI({
        vertexai: true,
        project: this.options.project,
        location: this.options.location || 'us-central1'
      })
    }
    if (!this.options.apiKey) {
      throw new Error('Gemini API キーが未設定です')
    }
    return new GoogleGenAI({ apiKey: this.options.apiKey })
  }

  async complete(req: LlmCompleteRequest): Promise<LlmCompleteResult> {
    const ai = this.client()
    const params = {
      model: req.model,
      contents: toGeminiContents(req.messages) as never,
      config: {
        systemInstruction: systemText(req.messages),
        tools: [{ functionDeclarations: toDeclarations(req.tools) }]
      }
    }
    const stream = await ai.models.generateContentStream(params)
    let text = ''
    let last = null as Awaited<ReturnType<typeof ai.models.generateContent>> | null
    for await (const chunk of stream) {
      last = chunk
      const piece = chunk.text ?? ''
      if (!piece) continue
      if (piece.startsWith(text)) {
        const more = piece.slice(text.length)
        text = piece
        if (more) req.onDelta?.(more)
      } else {
        text += piece
        req.onDelta?.(piece)
      }
    }

    const toolCalls = (last?.functionCalls ?? []).map((call) => ({
      id: randomUUID(),
      name: call.name || 'unknown',
      arguments: JSON.stringify(call.args ?? {})
    }))

    return {
      text: text || (last?.text ?? ''),
      toolCalls
    }
  }
}
