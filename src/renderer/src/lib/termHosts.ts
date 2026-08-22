import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

export interface TermHost {
  term: Terminal
  fit: FitAddon
}

export const termHosts = new Map<string, TermHost>()

export function disposeTermHost(paneId: string): void {
  const host = termHosts.get(paneId)
  if (!host) return
  try {
    host.term.dispose()
  } catch {
    // ignore
  }
  termHosts.delete(paneId)
}

export function attachTermHost(paneId: string, container: HTMLElement): TermHost {
  let host = termHosts.get(paneId)
  if (!host) {
    const term = new Terminal({
      cursorBlink: true,
      fontFamily:
        'Cascadia Code, Consolas, "Noto Sans JP", "Yu Gothic", "Hiragino Sans", SF Mono, monospace',
      fontSize: 13,
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
    term.open(container)
    host = { term, fit }
    termHosts.set(paneId, host)
    return host
  }

  const el = host.term.element
  if (el) {
    if (el.parentElement !== container) {
      container.appendChild(el)
    }
  } else {
    host.term.open(container)
  }
  return host
}

export function fitAndResize(paneId: string): void {
  const host = termHosts.get(paneId)
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
