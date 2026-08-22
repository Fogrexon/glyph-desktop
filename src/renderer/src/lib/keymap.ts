export type ShortcutAction =
  | 'palette.toggle'
  | 'settings.open'
  | 'term.splitRight'
  | 'term.splitDown'
  | 'term.closePane'
  | 'term.focusLeft'
  | 'term.focusRight'
  | 'term.focusUp'
  | 'term.focusDown'
  | 'term.focusNext'
  | 'term.focusPrev'
  | 'term.restart'
  | 'workspace.exit'
  | 'app.minimize'

export interface Chord {
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
}

export interface ShortcutDef {
  action: ShortcutAction
  label: string
  group: 'app' | 'term'
}

export const SHORTCUT_DEFS: ShortcutDef[] = [
  { action: 'palette.toggle', label: 'コマンドパレット', group: 'app' },
  { action: 'settings.open', label: '設定を開く', group: 'app' },
  { action: 'workspace.exit', label: 'ワークスペースを閉じる', group: 'app' },
  { action: 'app.minimize', label: 'トレイに退避', group: 'app' },
  { action: 'term.splitRight', label: '右に分割', group: 'term' },
  { action: 'term.splitDown', label: '下に分割', group: 'term' },
  { action: 'term.closePane', label: 'ペインを閉じる', group: 'term' },
  { action: 'term.focusLeft', label: '左のペインへ', group: 'term' },
  { action: 'term.focusRight', label: '右のペインへ', group: 'term' },
  { action: 'term.focusUp', label: '上のペインへ', group: 'term' },
  { action: 'term.focusDown', label: '下のペインへ', group: 'term' },
  { action: 'term.focusNext', label: '次のペインへ', group: 'term' },
  { action: 'term.focusPrev', label: '前のペインへ', group: 'term' },
  { action: 'term.restart', label: 'ターミナルを再起動', group: 'term' }
]

export type Keymap = Record<ShortcutAction, Chord>

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

function chord(
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}
): Chord {
  return {
    key,
    ctrl: Boolean(mods.ctrl),
    shift: Boolean(mods.shift),
    alt: Boolean(mods.alt),
    meta: Boolean(mods.meta)
  }
}

export function defaultKeymap(): Keymap {
  if (isMac) {
    return {
      'palette.toggle': chord('k', { meta: true }),
      'settings.open': chord(',', { meta: true }),
      'workspace.exit': chord('escape', { meta: true }),
      'app.minimize': chord('m', { meta: true }),
      'term.splitRight': chord('d', { meta: true }),
      'term.splitDown': chord('d', { meta: true, shift: true }),
      'term.closePane': chord('w', { meta: true, shift: true }),
      'term.focusLeft': chord('arrowleft', { meta: true, alt: true }),
      'term.focusRight': chord('arrowright', { meta: true, alt: true }),
      'term.focusUp': chord('arrowup', { meta: true, alt: true }),
      'term.focusDown': chord('arrowdown', { meta: true, alt: true }),
      'term.focusNext': chord('tab', { ctrl: true }),
      'term.focusPrev': chord('tab', { ctrl: true, shift: true }),
      'term.restart': chord('r', { meta: true, shift: true })
    }
  }
  return {
    'palette.toggle': chord('k', { ctrl: true }),
    'settings.open': chord(',', { ctrl: true }),
    'workspace.exit': chord('escape', { ctrl: true }),
    'app.minimize': chord('m', { ctrl: true }),
    'term.splitRight': chord('d', { ctrl: true, shift: true }),
    'term.splitDown': chord('\\', { ctrl: true, shift: true }),
    'term.closePane': chord('w', { ctrl: true, shift: true }),
    'term.focusLeft': chord('arrowleft', { ctrl: true, alt: true }),
    'term.focusRight': chord('arrowright', { ctrl: true, alt: true }),
    'term.focusUp': chord('arrowup', { ctrl: true, alt: true }),
    'term.focusDown': chord('arrowdown', { ctrl: true, alt: true }),
    'term.focusNext': chord('tab', { ctrl: true }),
    'term.focusPrev': chord('tab', { ctrl: true, shift: true }),
    'term.restart': chord('r', { ctrl: true, shift: true })
  }
}

const MODIFIER_KEYS = new Set([
  'control',
  'shift',
  'alt',
  'meta',
  'os',
  'hyper',
  'super',
  'unidentified'
])

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key.toLowerCase())
}

export function normalizeKey(key: string): string {
  if (key === ' ') return 'space'
  if (key === 'Esc') return 'escape'
  if (key === '\\') return '\\'
  return key.toLowerCase()
}

export function eventToChord(e: KeyboardEvent): Chord {
  return {
    key: normalizeKey(e.key),
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey
  }
}

export function chordsEqual(a: Chord | null | undefined, b: Chord | null | undefined): boolean {
  if (!a || !b) return a === b
  return (
    a.key === b.key && a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt && a.meta === b.meta
  )
}

export function formatChord(c: Chord | null | undefined): string {
  if (!c || typeof c.key !== 'string') return '未設定'
  const parts: string[] = []
  if (isMac) {
    if (c.ctrl) parts.push('⌃')
    if (c.alt) parts.push('⌥')
    if (c.shift) parts.push('⇧')
    if (c.meta) parts.push('⌘')
  } else {
    if (c.ctrl) parts.push('Ctrl')
    if (c.alt) parts.push('Alt')
    if (c.shift) parts.push('Shift')
    if (c.meta) parts.push('Win')
  }
  const keyLabel = formatKey(c.key)
  return isMac ? `${parts.join('')}${keyLabel}` : [...parts, keyLabel].join('+')
}

function formatKey(key: string): string {
  switch (key) {
    case 'escape':
      return 'Esc'
    case 'arrowleft':
      return '←'
    case 'arrowright':
      return '→'
    case 'arrowup':
      return '↑'
    case 'arrowdown':
      return '↓'
    case 'tab':
      return 'Tab'
    case 'space':
      return 'Space'
    case '\\':
      return '\\'
    case ',':
      return ','
    default:
      return key.length === 1 ? key.toUpperCase() : key
  }
}

export function matchAction(chord: Chord, map: Keymap): ShortcutAction | null {
  for (const def of SHORTCUT_DEFS) {
    if (chordsEqual(map[def.action], chord)) return def.action
  }
  return null
}

export function conflictingActions(map: Keymap, action: ShortcutAction): ShortcutAction[] {
  const target = map[action]
  return SHORTCUT_DEFS.filter((d) => d.action !== action && chordsEqual(map[d.action], target)).map(
    (d) => d.action
  )
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('.xterm')) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

export function mergeKeymap(raw: unknown): Keymap {
  const defaults = defaultKeymap()
  if (!raw || typeof raw !== 'object') return defaults
  const next = { ...defaults }
  for (const def of SHORTCUT_DEFS) {
    const value = (raw as Record<string, unknown>)[def.action]
    if (isChord(value)) next[def.action] = value
  }
  return next
}

function isChord(value: unknown): value is Chord {
  if (!value || typeof value !== 'object') return false
  const c = value as Chord
  return (
    typeof c.key === 'string' &&
    typeof c.ctrl === 'boolean' &&
    typeof c.shift === 'boolean' &&
    typeof c.alt === 'boolean' &&
    typeof c.meta === 'boolean'
  )
}
