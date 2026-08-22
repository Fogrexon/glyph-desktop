import { create } from 'zustand'

export interface ChatTurn {
  id: string
  role: 'user' | 'assistant' | 'tool'
  text: string
}

interface AgentChatState {
  turns: ChatTurn[]
  streaming: string
  busy: boolean
  appendUser: (text: string) => void
  appendAssistant: (text: string) => void
  appendTool: (name: string) => void
  setStreaming: (text: string) => void
  appendDelta: (text: string) => void
  setBusy: (busy: boolean) => void
  finishAssistant: (text: string) => void
  commitStreaming: () => void
  reset: () => void
}

export const useAgentChat = create<AgentChatState>((set) => ({
  turns: [],
  streaming: '',
  busy: false,
  appendUser: (text) =>
    set((state) => ({
      turns: [...state.turns, { id: crypto.randomUUID(), role: 'user', text }]
    })),
  appendAssistant: (text) =>
    set((state) => ({
      turns: [...state.turns, { id: crypto.randomUUID(), role: 'assistant', text }]
    })),
  appendTool: (name) =>
    set((state) => ({
      turns: [...state.turns, { id: crypto.randomUUID(), role: 'tool', text: `ツール: ${name}` }]
    })),
  setStreaming: (streaming) => set({ streaming }),
  appendDelta: (text) => set((state) => ({ streaming: state.streaming + text })),
  setBusy: (busy) => set({ busy }),
  finishAssistant: (text) =>
    set((state) => ({
      busy: false,
      streaming: '',
      turns: text
        ? [...state.turns, { id: crypto.randomUUID(), role: 'assistant', text }]
        : state.turns
    })),
  commitStreaming: () =>
    set((state) => ({
      streaming: '',
      turns: state.streaming
        ? [...state.turns, { id: crypto.randomUUID(), role: 'assistant', text: state.streaming }]
        : state.turns
    })),
  reset: () => set({ turns: [], streaming: '', busy: false })
}))
