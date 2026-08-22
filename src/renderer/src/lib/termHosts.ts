import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

export interface TermHost {
  term: Terminal
  fit: FitAddon
}

interface TermRuntime {
  hosts: Map<string, TermHost>
  restoring: Set<string>
  pendingLive: Map<string, string[]>
  restoreChain: Map<string, Promise<void>>
  offLive: (() => void) | null
}

const glyphWindow = window as Window & { __glyphTerms?: TermRuntime }
const WRITE_CHUNK = 32_768

function runtime(): TermRuntime {
  if (!glyphWindow.__glyphTerms) {
    glyphWindow.__glyphTerms = {
      hosts: new Map(),
      restoring: new Set(),
      pendingLive: new Map(),
      restoreChain: new Map(),
      offLive: null
    }
  }
  const current = glyphWindow.__glyphTerms
  if (!current.restoreChain) current.restoreChain = new Map()
  return current
}

export const termHosts: Map<string, TermHost> = runtime().hosts

function bindLiveData(): void {
  const r = runtime()
  if (r.offLive || !window.glyph?.terminals) return
  r.offLive = window.glyph.terminals.onData(({ paneId, data }) => {
    const cur = runtime()
    if (cur.restoring.has(paneId)) {
      const queue = cur.pendingLive.get(paneId) ?? []
      queue.push(data)
      cur.pendingLive.set(paneId, queue)
      return
    }
    cur.hosts.get(paneId)?.term.write(data)
  })
}

export function disposeTermHost(paneId: string): void {
  const r = runtime()
  const host = r.hosts.get(paneId)
  r.restoring.delete(paneId)
  r.pendingLive.delete(paneId)
  if (!host) return
  try {
    host.term.dispose()
  } catch {
    // ignore
  }
  r.hosts.delete(paneId)
}

function detachOtherXterms(container: HTMLElement, keep?: HTMLElement | null): void {
  for (const child of Array.from(container.children)) {
    if (child instanceof HTMLElement && child.classList.contains('xterm') && child !== keep) {
      child.remove()
    }
  }
}

function createHost(paneId: string, container: HTMLElement): TermHost {
  const term = new Terminal({
    cursorBlink: true,
    scrollback: 10_000,
    fontFamily:
      'Menlo, Monaco, "Cascadia Code", Consolas, "SF Mono", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", monospace',
    fontSize: 13,
    rescaleOverlappingGlyphs: true,
    theme: {
      background: '#0e1016',
      foreground: '#e8e6e1',
      cursor: '#d4a574',
      selectionBackground: '#3a3228'
    },
    convertEol: false
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.onData((data) => {
    void window.glyph.terminals.write(paneId, data)
  })
  detachOtherXterms(container)
  term.open(container)
  const host = { term, fit }
  runtime().hosts.set(paneId, host)
  return host
}

export function attachTermHost(paneId: string, container: HTMLElement): TermHost {
  bindLiveData()
  const existing = runtime().hosts.get(paneId)
  if (existing) {
    const el = existing.term.element
    if (el && !el.isConnected) {
      disposeTermHost(paneId)
    } else if (el) {
      detachOtherXterms(container, el)
      if (el.parentElement !== container) container.appendChild(el)
      return existing
    } else {
      disposeTermHost(paneId)
    }
  }
  return createHost(paneId, container)
}

function writeChunk(term: Terminal, chunk: string): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      resolve()
    }
    try {
      term.write(chunk, finish)
    } catch {
      finish()
      return
    }
    window.setTimeout(finish, 4000)
  })
}

async function writeAll(term: Terminal, data: string): Promise<void> {
  if (!data) return
  for (let i = 0; i < data.length; i += WRITE_CHUNK) {
    await writeChunk(term, data.slice(i, i + WRITE_CHUNK))
  }
}

function frames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number): void => {
      if (left <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(() => step(left - 1))
    }
    step(count)
  })
}

async function restoreOnce(paneId: string): Promise<void> {
  bindLiveData()
  const host = runtime().hosts.get(paneId)
  if (!host) return
  const r = runtime()
  r.restoring.add(paneId)
  try {
    await frames(2)
    if (runtime().hosts.get(paneId) !== host) return
    try {
      host.fit.fit()
    } catch {
      // container may still be 0-sized
    }
    let backlog = ''
    try {
      const raw = await window.glyph.terminals.replay(paneId)
      backlog = typeof raw === 'string' ? raw : ''
    } catch {
      backlog = ''
    }
    if (runtime().hosts.get(paneId) !== host) return
    // Empty replay must not reset — that wipes the only remaining buffer.
    if (backlog) {
      try {
        host.term.reset()
      } catch {
        return
      }
      await writeAll(host.term, backlog)
    }
    if (runtime().hosts.get(paneId) !== host) return
    const queued = runtime().pendingLive.get(paneId)
    runtime().pendingLive.delete(paneId)
    if (queued?.length) await writeAll(host.term, queued.join(''))
    try {
      host.term.scrollToBottom()
    } catch {
      // ignore
    }
  } finally {
    r.restoring.delete(paneId)
  }
}

/** Paint PTY backlog into the xterm. Safe to call on every remount / reload. */
export function restoreTermOutput(paneId: string): Promise<void> {
  const r = runtime()
  const next = (r.restoreChain.get(paneId) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => restoreOnce(paneId))
  r.restoreChain.set(paneId, next)
  return next
}

export function fitAndResize(paneId: string): void {
  const host = runtime().hosts.get(paneId)
  const el = host?.term.element
  const parent = el?.parentElement
  if (!host || !el || !parent) return
  if (parent.clientWidth < 20 || parent.clientHeight < 20) return
  try {
    host.fit.fit()
  } catch {
    return
  }
  const dims = host.fit.proposeDimensions()
  if (dims && dims.cols > 1 && dims.rows > 1) {
    void window.glyph.terminals.resize(paneId, dims.cols, dims.rows)
  }
}

/** Relayout without wiping the buffer. Used after HMR / focus. */
export function relayoutTermHosts(): void {
  for (const paneId of [...runtime().hosts.keys()]) {
    fitAndResize(paneId)
    const host = runtime().hosts.get(paneId)
    const rows = host?.term.rows ?? 0
    if (!host || rows <= 0) continue
    try {
      host.term.refresh(0, rows - 1)
    } catch {
      // ignore
    }
  }
}
