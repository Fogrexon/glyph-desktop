import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { disposeTermHost } from '@renderer/lib/termHosts'
import { useUi } from '@renderer/stores/ui'

export type SplitDir = 'horizontal' | 'vertical'
export type FocusDir = 'left' | 'right' | 'up' | 'down'

export type PaneTab =
  { kind: 'terminal'; id: string } | { kind: 'browser'; id: string; url: string }

export type LeafNode = {
  kind: 'leaf'
  id: string
  tabs?: PaneTab[]
  activeTabId?: string
}

export type SplitNode = {
  kind: 'split'
  id: string
  dir: SplitDir
  a: PaneNode
  b: PaneNode
  ratio: number
}

export type PaneNode = LeafNode | SplitNode

const STORAGE_KEY = 'glyph.panes.v2'

interface PersistedPanes {
  trees: Record<string, PaneNode>
  activePane: Record<string, string>
}

function isTab(value: unknown): value is PaneTab {
  if (!value || typeof value !== 'object') return false
  const tab = value as PaneTab
  if (tab.kind === 'terminal') return typeof tab.id === 'string' && tab.id.length > 0
  if (tab.kind === 'browser') {
    return typeof tab.id === 'string' && tab.id.length > 0 && typeof tab.url === 'string'
  }
  return false
}

function isPaneNode(value: unknown): value is PaneNode {
  if (!value || typeof value !== 'object') return false
  const node = value as PaneNode
  if (node.kind === 'leaf') {
    if (typeof node.id !== 'string' || node.id.length === 0) return false
    if (node.tabs !== undefined) {
      if (!Array.isArray(node.tabs) || node.tabs.length === 0 || !node.tabs.every(isTab))
        return false
    }
    if (node.activeTabId !== undefined && typeof node.activeTabId !== 'string') return false
    return true
  }
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

export function leafTabs(leaf: LeafNode): PaneTab[] {
  const tabs = leaf.tabs
  if (tabs && tabs.length > 0) return tabs
  return [{ kind: 'terminal', id: leaf.id }]
}

export function leafActiveTabId(leaf: LeafNode): string {
  const tabs = leafTabs(leaf)
  if (leaf.activeTabId && tabs.some((tab) => tab.id === leaf.activeTabId)) return leaf.activeTabId
  return tabs[0]?.id ?? leaf.id
}

export function leafActiveTab(leaf: LeafNode): PaneTab {
  const tabs = leafTabs(leaf)
  const id = leafActiveTabId(leaf)
  return tabs.find((tab) => tab.id === id) ?? tabs[0] ?? { kind: 'terminal', id: leaf.id }
}

function terminalLeaf(id: string): LeafNode {
  return { kind: 'leaf', id, tabs: [{ kind: 'terminal', id }], activeTabId: id }
}

function browserLeaf(id: string, url: string): LeafNode {
  return { kind: 'leaf', id, tabs: [{ kind: 'browser', id, url }], activeTabId: id }
}

function withTabs(leaf: LeafNode, tabs: PaneTab[], activeTabId: string): LeafNode {
  return { kind: 'leaf', id: leaf.id, tabs, activeTabId }
}

function loadPersisted(): PersistedPanes {
  try {
    const raw = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || localStorage.getItem('glyph.panes.v1') || 'null'
    ) as unknown
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
      const leaf = findLeafContaining(tree, paneId)
      if (!leaf) activePane[taskId] = firstLeaf(tree)
      else activePane[taskId] = leaf.id
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

function firstLeaf(node: PaneNode): string {
  return node.kind === 'leaf' ? node.id : firstLeaf(node.a)
}

function collectLeaves(node: PaneNode): string[] {
  if (node.kind === 'leaf') return [node.id]
  return [...collectLeaves(node.a), ...collectLeaves(node.b)]
}

export function findLeaf(node: PaneNode, leafId: string): LeafNode | null {
  if (node.kind === 'leaf') return node.id === leafId ? node : null
  return findLeaf(node.a, leafId) ?? findLeaf(node.b, leafId)
}

export function findLeafContaining(node: PaneNode, id: string): LeafNode | null {
  if (node.kind === 'leaf') {
    if (node.id === id) return node
    return leafTabs(node).some((tab) => tab.id === id) ? node : null
  }
  return findLeafContaining(node.a, id) ?? findLeafContaining(node.b, id)
}

function replaceLeaf(node: PaneNode, id: string, replacement: PaneNode): PaneNode {
  if (node.kind === 'leaf') return node.id === id ? replacement : node
  return {
    ...node,
    a: replaceLeaf(node.a, id, replacement),
    b: replaceLeaf(node.b, id, replacement)
  }
}

function mapLeaf(node: PaneNode, id: string, fn: (leaf: LeafNode) => LeafNode): PaneNode {
  if (node.kind === 'leaf') return node.id === id ? fn(node) : node
  return {
    ...node,
    a: mapLeaf(node.a, id, fn),
    b: mapLeaf(node.b, id, fn)
  }
}

function mapAnyLeaf(node: PaneNode, fn: (leaf: LeafNode) => LeafNode): PaneNode {
  if (node.kind === 'leaf') return fn(node)
  return { ...node, a: mapAnyLeaf(node.a, fn), b: mapAnyLeaf(node.b, fn) }
}

function removeLeaf(node: PaneNode, id: string): { tree: PaneNode; siblingId: string } | null {
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
    const overlapX =
      Math.min(current.box.x + current.box.w, other.box.x + other.box.w) -
      Math.max(current.box.x, other.box.x)
    const overlapY =
      Math.min(current.box.y + current.box.h, other.box.y + other.box.h) -
      Math.max(current.box.y, other.box.y)
    let ok = false
    let dist = Infinity
    if (dir === 'left' && other.box.x + other.box.w <= current.box.x + eps && overlapY > eps) {
      ok = true
      dist = current.box.x - (other.box.x + other.box.w)
    } else if (
      dir === 'right' &&
      other.box.x + eps >= current.box.x + current.box.w &&
      overlapY > eps
    ) {
      ok = true
      dist = other.box.x - (current.box.x + current.box.w)
    } else if (dir === 'up' && other.box.y + other.box.h <= current.box.y + eps && overlapX > eps) {
      ok = true
      dist = current.box.y - (other.box.y + other.box.h)
    } else if (
      dir === 'down' &&
      other.box.y + eps >= current.box.y + current.box.h &&
      overlapX > eps
    ) {
      ok = true
      dist = other.box.y - (current.box.y + current.box.h)
    }
    if (!ok) continue
    if (!best || dist < best.dist) best = { id: other.id, dist }
  }
  return best?.id ?? null
}

function disposeTab(tab: PaneTab): void {
  if (tab.kind === 'terminal') {
    disposeTermHost(tab.id)
    useUi.getState().removeSession(tab.id)
    void window.glyph.terminals.kill(tab.id)
    return
  }
  void window.glyph.browser.destroy(tab.id)
}

function disposeLeaf(leaf: LeafNode): void {
  for (const tab of leafTabs(leaf)) disposeTab(tab)
}

interface PanesState {
  trees: Record<string, PaneNode>
  activePane: Record<string, string>
  ensureTree: (taskId: string) => PaneNode
  splitActive: (
    taskId: string,
    dir: SplitDir,
    kind?: 'terminal' | 'browser',
    url?: string
  ) => string | null
  addTab: (taskId: string, kind: 'terminal' | 'browser', url?: string) => string | null
  addBrowserBeside: (openerId: string, url: string) => string | null
  closeActive: (taskId: string) => boolean
  closeActiveTab: (taskId: string) => boolean
  selectTab: (taskId: string, tabId: string) => void
  setTabUrl: (tabId: string, url: string) => void
  focusPane: (taskId: string, paneId: string) => void
  focusDir: (taskId: string, dir: FocusDir) => void
  focusCycle: (taskId: string, delta: 1 | -1) => void
  setRatio: (taskId: string, splitId: string, ratio: number) => void
}

const persisted = loadPersisted()

function createPanesStore(): UseBoundStore<StoreApi<PanesState>> {
  return create<PanesState>((set, get) => ({
    trees: persisted.trees,
    activePane: persisted.activePane,
    ensureTree: (taskId) => {
      const existing = get().trees[taskId]
      if (existing) return existing
      const next = terminalLeaf(taskId)
      set((state) => {
        const trees = { ...state.trees, [taskId]: next }
        const activePane = { ...state.activePane, [taskId]: state.activePane[taskId] ?? taskId }
        persistPanes(trees, activePane)
        return { trees, activePane }
      })
      return next
    },
    splitActive: (taskId, dir, kind = 'terminal', url = 'about:blank') => {
      get().ensureTree(taskId)
      const tree = get().trees[taskId]
      const active = get().activePane[taskId] ?? taskId
      if (!tree) return null
      const newId =
        kind === 'browser'
          ? `${taskId}::b::${crypto.randomUUID()}`
          : `${taskId}::${crypto.randomUUID()}`
      const newLeaf = kind === 'browser' ? browserLeaf(newId, url) : terminalLeaf(newId)
      const replacement: PaneNode = {
        kind: 'split',
        id: crypto.randomUUID(),
        dir,
        a: findLeaf(tree, active) ?? terminalLeaf(active),
        b: newLeaf,
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
    addTab: (taskId, kind, url = 'about:blank') => {
      get().ensureTree(taskId)
      const tree = get().trees[taskId]
      const active = get().activePane[taskId] ?? taskId
      if (!tree) return null
      const leaf = findLeaf(tree, active)
      if (!leaf) return null
      const id =
        kind === 'browser'
          ? `${taskId}::b::${crypto.randomUUID()}`
          : `${taskId}::${crypto.randomUUID()}`
      const tab: PaneTab =
        kind === 'browser' ? { kind: 'browser', id, url } : { kind: 'terminal', id }
      set((state) => {
        const trees = {
          ...state.trees,
          [taskId]: mapLeaf(tree, leaf.id, (current) =>
            withTabs(current, [...leafTabs(current), tab], id)
          )
        }
        persistPanes(trees, state.activePane)
        return { trees }
      })
      return id
    },
    addBrowserBeside: (openerId, url) => {
      for (const [taskId, tree] of Object.entries(get().trees)) {
        const leaf = findLeafContaining(tree, openerId)
        if (!leaf) continue
        const id = `${taskId}::b::${crypto.randomUUID()}`
        const tab: PaneTab = { kind: 'browser', id, url }
        set((state) => {
          const current = state.trees[taskId]
          if (!current) return state
          const trees = {
            ...state.trees,
            [taskId]: mapLeaf(current, leaf.id, (node) =>
              withTabs(node, [...leafTabs(node), tab], id)
            )
          }
          const activePane = { ...state.activePane, [taskId]: leaf.id }
          persistPanes(trees, activePane)
          return { trees, activePane }
        })
        return id
      }
      return null
    },
    closeActive: (taskId) => {
      const tree = get().trees[taskId]
      const active = get().activePane[taskId]
      if (!tree || !active || tree.kind === 'leaf') return false
      const leaf = findLeaf(tree, active)
      const removed = removeLeaf(tree, active)
      if (!removed) return false
      if (leaf) disposeLeaf(leaf)
      set((state) => {
        const trees = { ...state.trees, [taskId]: removed.tree }
        const activePane = { ...state.activePane, [taskId]: removed.siblingId }
        persistPanes(trees, activePane)
        return { trees, activePane }
      })
      return true
    },
    closeActiveTab: (taskId) => {
      const tree = get().trees[taskId]
      const active = get().activePane[taskId]
      if (!tree || !active) return false
      const leaf = findLeaf(tree, active)
      if (!leaf) return false
      const tabs = leafTabs(leaf)
      if (tabs.length <= 1) return get().closeActive(taskId)
      const currentId = leafActiveTabId(leaf)
      const index = tabs.findIndex((tab) => tab.id === currentId)
      const closing = tabs[index] ?? tabs[tabs.length - 1]
      if (!closing) return false
      const nextTabs = tabs.filter((tab) => tab.id !== closing.id)
      const nextActive = nextTabs[Math.max(0, index - 1)]?.id ?? nextTabs[0]?.id
      if (!nextActive) return false
      disposeTab(closing)
      set((state) => {
        const current = state.trees[taskId]
        if (!current) return state
        const trees = {
          ...state.trees,
          [taskId]: mapLeaf(current, leaf.id, () => withTabs(leaf, nextTabs, nextActive))
        }
        persistPanes(trees, state.activePane)
        return { trees }
      })
      return true
    },
    selectTab: (taskId, tabId) => {
      const tree = get().trees[taskId]
      if (!tree) return
      const leaf = findLeafContaining(tree, tabId)
      if (!leaf) return
      set((state) => {
        const current = state.trees[taskId]
        if (!current) return state
        const trees = {
          ...state.trees,
          [taskId]: mapLeaf(current, leaf.id, (node) => withTabs(node, leafTabs(node), tabId))
        }
        const activePane = { ...state.activePane, [taskId]: leaf.id }
        persistPanes(trees, activePane)
        return { trees, activePane }
      })
    },
    setTabUrl: (tabId, url) => {
      set((state) => {
        let changed = false
        const trees: Record<string, PaneNode> = {}
        for (const [taskId, tree] of Object.entries(state.trees)) {
          const next = mapAnyLeaf(tree, (leaf) => {
            const tabs = leafTabs(leaf)
            const index = tabs.findIndex((tab) => tab.id === tabId)
            const tab = tabs[index]
            if (!tab || tab.kind !== 'browser' || tab.url === url) return leaf
            changed = true
            const nextTabs = [...tabs]
            nextTabs[index] = { kind: 'browser', id: tab.id, url }
            return withTabs(leaf, nextTabs, leafActiveTabId(leaf))
          })
          trees[taskId] = next
        }
        if (!changed) return state
        persistPanes(trees, state.activePane)
        return { trees }
      })
    },
    focusPane: (taskId, paneId) => {
      const tree = get().trees[taskId]
      if (!tree) return
      const leaf = findLeafContaining(tree, paneId) ?? findLeaf(tree, paneId)
      if (!leaf) return
      set((state) => {
        if (state.activePane[taskId] === leaf.id) return state
        const activePane = { ...state.activePane, [taskId]: leaf.id }
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
      if (next) get().focusPane(taskId, next)
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
}

const glyphWindow = window as Window & { __glyphPanesStore2?: ReturnType<typeof createPanesStore> }
export const usePanes = glyphWindow.__glyphPanesStore2 ?? createPanesStore()
glyphWindow.__glyphPanesStore2 = usePanes

export function activePaneId(taskId: string | null): string | null {
  if (!taskId) return null
  return usePanes.getState().activePane[taskId] ?? taskId
}

export function activeTabForTask(taskId: string | null): PaneTab | null {
  if (!taskId) return null
  const tree = usePanes.getState().trees[taskId]
  const leafId = usePanes.getState().activePane[taskId] ?? taskId
  if (!tree) return { kind: 'terminal', id: taskId }
  const leaf = findLeaf(tree, leafId)
  if (!leaf) return { kind: 'terminal', id: leafId }
  return leafActiveTab(leaf)
}
