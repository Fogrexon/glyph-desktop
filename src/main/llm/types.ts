export interface LlmTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface LlmToolCall {
  id: string
  name: string
  arguments: string
}

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool'

export interface LlmMessage {
  role: LlmRole
  content: string
  toolCallId?: string
  name?: string
  toolCalls?: LlmToolCall[]
}

export interface LlmCompleteRequest {
  model: string
  messages: LlmMessage[]
  tools: LlmTool[]
  onDelta?: (text: string) => void
}

export interface LlmCompleteResult {
  text: string
  toolCalls: LlmToolCall[]
}

export interface LlmProvider {
  id: string
  complete(req: LlmCompleteRequest): Promise<LlmCompleteResult>
}
