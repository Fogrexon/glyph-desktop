import { create } from 'zustand'
import { disposeTermHost } from '@renderer/lib/termHosts'
import { useUi } from '@renderer/stores/ui'

export type SplitDir = 'horizontal' | 'vertical'
export type FocusDir = 'left' | 'right' | 'up' | 'down'

export type PaneNode =
  | { kind: 'leaf'; id: string }
  | { kind: 'split'; id: string; dir: SplitDir; a: PaneNode; b: PaneNode; ratio: number }

const STORAGE_KEY = 'glyph.panes.v1'

interface PersistedPanes {
  trees: Record<string, PaneNode>
  activePane: Record<string, string>
}

function isPaneNode(value: unknown): value is PaneNode {
  if (!value || typeof value !== 'object') return false
  const node = value as PaneNode
  if (node.kind === 'leaf') return typeof node.id === 'string' && node.id.length > 0
  if (node.kind === 'split') {
    return (
      typeof node.id === 'string' &&
      (node.dir === 'horizontal' || node.dir === 'vertical') &&
      typeof node.ratio === 'number' &&
      node.ratio > 0 &&
      node.ratio < 1 &&
      isPaneNode(node.a) &&
      isPaneNode(node.b)
    )
  }
  return false
}

function loadPersisted(): PersistedPanes {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as unknown
    if (!raw || typeof raw !== 'object') return { trees: {}, activePane: {} }
    const trees: Record<string, PaneNode> = {}
    const activePane: Record<string, string> = {}
    const source = raw as PersistedPanes
    if (source.trees && typeof source.trees === 'object') {
      for (const [taskId, node] of Object.entries(source.trees)) {
        if (typeof taskId === 'string' && isPaneNode(node)) trees[taskId] = node
      }
    }
    if (source.activePane && typeof source.activePane === 'object') {
      for (const [taskId, paneId] of Object.entries(source.activePane)) {
        if (typeof taskId === 'string' && typeof paneId === 'string') activePane[taskId] = paneId
      }
    }
    for (const [taskId, paneId] of Object.entries(activePane)) {
      const tree = trees[taskId]
      if (!tree) {
        delete activePane[taskId]
        continue
      }
      if (!collectLeaves(tree).includes(paneId)) {
        activePane[taskId] = firstLeaf(tree)
      }
    }
    return { trees, activePane }
  } catch {
    return { trees: {}, activePane: {} }
  }
}

function persistPanes(trees: Record<string, PaneNode>, activePane: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ trees, activePane }))
  } catch {
    // quota / private mode
  }
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface PanesState {
  trees: Record<string, PaneNode>
  activePane: Record<string, string>
  ensureTree: (taskId: string) => PaneNode
  splitActive: (taskId: string, dir: SplitDir) => string | null
  closeActive: (taskId: string) => boolean
  focusPane: (taskId: string, paneId: string) => void
  focusDir: (taskId: string, dir: FocusDir) => void
  focusCycle: (taskId: string, delta: 1 | -1) => void
  setRatio: (taskId: string, splitId: string, ratio: number) => void
}

function leaf(id: string): PaneNode {
  return { kind: 'leaf', id }
}

function firstLeaf(node: PaneNode): string {
  return node.kind === 'leaf' ? node.id : firstLeaf(node.a)
}

function collectLeaves(node: PaneNode): string[] {
  if (node.kind === 'leaf') return [node.id]
  return [...collectLeaves(node.a), ...collectLeaves(node.b)]
}

function replaceLeaf(node: PaneNode, id: string, replacement: PaneNode): PaneNode {
  if (node.kind === 'leaf') return node.id === id ? replacement : node
  return {
    ...node,
    a: replaceLeaf(node.a, id, replacement),
    b: replaceLeaf(node.b, id, replacement)
  }
}

function removeLeaf(
  node: PaneNode,
  id: string
): { tree: PaneNode; siblingId: string } | null {
  if (node.kind === 'leaf') return null
  if (node.a.kind === 'leaf' && node.a.id === id) {
    return { tree: node.b, siblingId: firstLeaf(node.b) }
  }
  if (node.b.kind === 'leaf' && node.b.id === id) {
    return { tree: node.a, siblingId: firstLeaf(node.a) }
  }
  const left = removeLeaf(node.a, id)
  if (left) return { tree: { ...node, a: left.tree }, siblingId: left.siblingId }
  const right = removeLeaf(node.b, id)
  if (right) return { tree: { ...node, b: right.tree }, siblingId: right.siblingId }
  return null
}

function updateRatio(node: PaneNode, splitId: string, ratio: number): PaneNode {
  if (node.kind === 'leaf') return node
  if (node.id === splitId) return { ...node, ratio }
  return {
    ...node,
    a: updateRatio(node.a, splitId, ratio),
    b: updateRatio(node.b, splitId, ratio)
  }
}

function layoutBoxes(node: PaneNode, box: Box): { id: string; box: Box }[] {
  if (node.kind === 'leaf') return [{ id: node.id, box }]
  if (node.dir === 'horizontal') {
    const w = box.w * node.ratio
    return [
      ...layoutBoxes(node.a, { ...box, w }),
      ...layoutBoxes(node.b, { x: box.x + w, y: box.y, w: box.w - w, h: box.h })
    ]
  }
  const h = box.h * node.ratio
  return [
    ...layoutBoxes(node.a, { ...box, h }),
    ...layoutBoxes(node.b, { x: box.x, y: box.y + h, w: box.w, h: box.h - h })
  ]
}

function neighbor(tree: PaneNode, paneId: string, dir: FocusDir): string | null {
  const boxes = layoutBoxes(tree, { x: 0, y: 0, w: 1, h: 1 })
  const current = boxes.find((b) => b.id === paneId)
  if (!current) return null
  const eps = 0.02
  let best: { id: string; dist: number } | null = null
  for (const other of boxes) {
    if (other.id === paneId) continue
    const overlapX = Math.min(current.box.x + current.box.w, other.box.x + other.box.w) - Math.max(current.box.x, other.box.x)
    const overlapY = Math.min(current.box.y + current.box.h, other.box.y + other.box.h) - Math.max(current.box.y, other.box.y)
    let ok = false
    let dist = Infinity
    if (dir === 'left' && other.box.x + other.box.w <= current.box.x + eps && overlapY > eps) {
      ok = true
      dist = current.box.x - (other.box.x + other.box.w)
    } else if (dir === 'right' && other.box.x + eps >= current.box.x + current.box.w && overlapY > eps) {
      ok = true
      dist = other.box.x - (current.box.x + current.box.w)
    } else if (dir === 'up' && other.box.y + other.box.h <= current.box.y + eps && overlapX > eps) {
      ok = true
      dist = current.box.y - (other.box.y + other.box.h)
    } else if (dir === 'down' && other.box.y + eps >= current.box.y + current.box.h && overlapX > eps) {
      ok = true
      dist = other.box.y - (current.box.y + current.box.h)
    }
    if (!ok) continue
    if (!best || dist < best.dist) best = { id: other.id, dist }
  }
  return best?.id ?? null
}

const persisted = loadPersisted()

export const usePanes = create<PanesState>((set, get) => ({
  trees: persisted.trees,
  activePane: persisted.activePane,
  ensureTree: (taskId) => {
    const existing = get().trees[taskId]
    if (existing) return existing
    const next = leaf(taskId)
    set((state) => {
      const trees = { ...state.trees, [taskId]: next }
      const activePane = { ...state.activePane, [taskId]: state.activePane[taskId] ?? taskId }
      persistPanes(trees, activePane)
      return { trees, activePane }
    })
    return next
  },
  splitActive: (taskId, dir) => {
    get().ensureTree(taskId)
    const tree = get().trees[taskId]
    const active = get().activePane[taskId] ?? taskId
    const newId = `${taskId}::${crypto.randomUUID()}`
    const replacement: PaneNode = {
      kind: 'split',
      id: crypto.randomUUID(),
      dir,
      a: leaf(active),
      b: leaf(newId),
      ratio: 0.5
    }
    set((state) => {
      const trees = { ...state.trees, [taskId]: replaceLeaf(tree, active, replacement) }
      const activePane = { ...state.activePane, [taskId]: newId }
      persistPanes(trees, activePane)
      return { trees, activePane }
    })
    return newId
  },
  closeActive: (taskId) => {
    const tree = get().trees[taskId]
    const active = get().activePane[taskId]
    if (!tree || !active || tree.kind === 'leaf') return false
    const removed = removeLeaf(tree, active)
    if (!removed) return false
    set((state) => {
      const trees = { ...state.trees, [taskId]: removed.tree }
      const activePane = { ...state.activePane, [taskId]: removed.siblingId }
      persistPanes(trees, activePane)
      return { trees, activePane }
    })
    disposeTermHost(active)
    useUi.getState().removeSession(active)
    void window.glyph.terminals.kill(active)
    return true
  },
  focusPane: (taskId, paneId) => {
    set((state) => {
      const activePane = { ...state.activePane, [taskId]: paneId }
      persistPanes(state.trees, activePane)
      return { activePane }
    })
  },
  focusDir: (taskId, dir) => {
    const tree = get().trees[taskId]
    const active = get().activePane[taskId]
    if (!tree || !active) return
    const next = neighbor(tree, active, dir)
    if (next) get().focusPane(taskId, next)
  },
  focusCycle: (taskId, delta) => {
    const tree = get().trees[taskId]
    const active = get().activePane[taskId]
    if (!tree || !active) return
    const leaves = collectLeaves(tree)
    const idx = leaves.indexOf(active)
    if (idx < 0) return
    const next = leaves[(idx + delta + leaves.length) % leaves.length]
    get().focusPane(taskId, next)
  },
  setRatio: (taskId, splitId, ratio) => {
    const tree = get().trees[taskId]
    if (!tree) return
    const clamped = Math.min(0.8, Math.max(0.2, ratio))
    set((state) => {
      const trees = { ...state.trees, [taskId]: updateRatio(tree, splitId, clamped) }
      persistPanes(trees, state.activePane)
      return { trees }
    })
  }
}))

export function activePaneId(taskId: string | null): string | null {
  if (!taskId) return null
  return usePanes.getState().activePane[taskId] ?? taskId
}
