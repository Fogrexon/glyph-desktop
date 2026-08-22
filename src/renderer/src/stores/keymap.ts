import { create } from 'zustand'
import {
  defaultKeymap,
  mergeKeymap,
  type Chord,
  type Keymap,
  type ShortcutAction
} from '@renderer/lib/keymap'

const STORAGE_KEY = 'glyph.keymap.v1'

function loadMap(): Keymap {
  try {
    return mergeKeymap(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'))
  } catch {
    return defaultKeymap()
  }
}

function persist(map: Keymap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

interface KeymapState {
  map: Keymap
  recording: ShortcutAction | null
  setChord: (action: ShortcutAction, chord: Chord) => void
  resetAction: (action: ShortcutAction) => void
  resetAll: () => void
  startRecording: (action: ShortcutAction) => void
  cancelRecording: () => void
}

export const useKeymap = create<KeymapState>((set, get) => ({
  map: loadMap(),
  recording: null,
  setChord: (action, chord) => {
    const map = { ...get().map, [action]: chord }
    persist(map)
    set({ map, recording: null })
  },
  resetAction: (action) => {
    const map = { ...get().map, [action]: defaultKeymap()[action] }
    persist(map)
    set({ map, recording: null })
  },
  resetAll: () => {
    const map = defaultKeymap()
    persist(map)
    set({ map, recording: null })
  },
  startRecording: (action) => set({ recording: action }),
  cancelRecording: () => set({ recording: null })
}))
