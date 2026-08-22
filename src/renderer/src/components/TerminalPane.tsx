import { useEffect, useRef } from 'react'
import { relativeToGit } from '@renderer/lib/format'
import { attachTermHost, fitAndResize, restoreTermOutput, termHosts } from '@renderer/lib/termHosts'
import { statusLabel, useUi } from '@renderer/stores/ui'
import { useWorkspace } from '@renderer/stores/workspace'
import { usePanes, type PaneNode, type SplitDir } from '@renderer/stores/panes'

export function TerminalPane(): React.JSX.Element {
  const selected = useUi((s) => s.selectedTaskId)
  const upsert = useUi((s) => s.upsertSession)
  const tasks = useWorkspace((s) => s.tasks)
  const tree = usePanes((s) => (selected ? s.trees[selected] : undefined))
  const ensureTree = usePanes((s) => s.ensureTree)
  const activeId = usePanes((s) => (selected ? (s.activePane[selected] ?? selected) : null))
  const focusPane = usePanes((s) => s.focusPane)
  const setRatio = usePanes((s) => s.setRatio)

  const task = tasks.find((t) => t.id === selected) ?? null

  useEffect(() => {
    if (selected) ensureTree(selected)
  }, [selected, ensureTree])

  useEffect(() => {
    const offStatus = window.glyph.terminals.onStatus((info) => upsert(info))
    const offCwd = window.glyph.terminals.onCwd((info) => upsert(info))
    return () => {
      offStatus()
      offCwd()
    }
  }, [upsert])

  if (!selected || !task) {
    return (
      <section className="terminal-wrap">
        <div className="empty-term">
          タスクを選ぶか、Ctrl+K でコマンドパレットを開いてください。
        </div>
      </section>
    )
  }

  const root = tree ?? { kind: 'leaf' as const, id: selected }

  return (
    <section className="terminal-wrap">
      <SplitNode
        node={root}
        taskId={selected}
        activeId={activeId ?? selected}
        onFocus={(paneId) => focusPane(selected, paneId)}
        onRatio={(splitId, ratio) => setRatio(selected, splitId, ratio)}
      />
    </section>
  )
}

function SplitNode({
  node,
  taskId,
  activeId,
  onFocus,
  onRatio
}: {
  node: PaneNode
  taskId: string
  activeId: string
  onFocus: (paneId: string) => void
  onRatio: (splitId: string, ratio: number) => void
}): React.JSX.Element {
  if (node.kind === 'leaf') {
    return (
      <LeafPane
        key={node.id}
        paneId={node.id}
        taskId={taskId}
        active={node.id === activeId}
        onFocus={onFocus}
      />
    )
  }
  return (
    <div className={`split split-${node.dir}`}>
      <div className="split-child" style={{ flex: `${node.ratio} 1 0` }}>
        <SplitNode
          node={node.a}
          taskId={taskId}
          activeId={activeId}
          onFocus={onFocus}
          onRatio={onRatio}
        />
      </div>
      <Sash dir={node.dir} ratio={node.ratio} onRatio={(ratio) => onRatio(node.id, ratio)} />
      <div className="split-child" style={{ flex: `${1 - node.ratio} 1 0` }}>
        <SplitNode
          node={node.b}
          taskId={taskId}
          activeId={activeId}
          onFocus={onFocus}
          onRatio={onRatio}
        />
      </div>
    </div>
  )
}

function Sash({
  dir,
  ratio,
  onRatio
}: {
  dir: SplitDir
  ratio: number
  onRatio: (ratio: number) => void
}): React.JSX.Element {
  const start = useRef<{ pos: number; size: number; ratio: number } | null>(null)

  useEffect(() => {
    const move = (e: MouseEvent): void => {
      const s = start.current
      if (!s) return
      const pos = dir === 'horizontal' ? e.clientX : e.clientY
      onRatio(s.ratio + (pos - s.pos) / s.size)
    }
    const up = (): void => {
      start.current = null
      document.body.classList.remove('sash-dragging')
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [dir, onRatio])

  return (
    <div
      className={`split-sash split-sash-${dir}`}
      onMouseDown={(e) => {
        const parent = (e.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect()
        if (!parent) return
        e.preventDefault()
        document.body.classList.add('sash-dragging')
        start.current = {
          pos: dir === 'horizontal' ? e.clientX : e.clientY,
          size: dir === 'horizontal' ? parent.width : parent.height,
          ratio
        }
      }}
    />
  )
}

function LeafPane({
  paneId,
  taskId,
  active,
  onFocus
}: {
  paneId: string
  taskId: string
  active: boolean
  onFocus: (paneId: string) => void
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const paletteOpen = useUi((s) => s.paletteOpen)
  const session = useUi((s) => s.sessions[paneId])
  const task = useWorkspace((s) => s.tasks.find((t) => t.id === taskId))

  useEffect(() => {
    if (!hostRef.current) return
    let cancelled = false
    const container = hostRef.current
    void window.glyph.terminals.ensure(paneId).then(async (info) => {
      if (cancelled || !hostRef.current) return
      useUi.getState().upsertSession(info)
      const host = attachTermHost(paneId, container)
      await restoreTermOutput(paneId)
      if (cancelled) return
      const layout = (): void => {
        if (cancelled) return
        fitAndResize(paneId)
        const rows = host.term.rows
        if (rows > 0) {
          try {
            host.term.refresh(0, rows - 1)
          } catch {
            // ignore
          }
        }
        if (active && !useUi.getState().paletteOpen) host.term.focus()
      }
      requestAnimationFrame(() => requestAnimationFrame(layout))
    })
    return () => {
      cancelled = true
    }
  }, [paneId])

  useEffect(() => {
    const host = termHosts.get(paneId)
    if (!host) return
    host.term.options.disableStdin = paletteOpen
    if (paletteOpen) {
      host.term.blur()
      return
    }
    if (active) host.term.focus()
  }, [active, paneId, paletteOpen])

  useEffect(() => {
    if (!hostRef.current) return
    const host = hostRef.current
    const observer = new ResizeObserver(() => fitAndResize(paneId))
    observer.observe(host)
    const lockScroll = (): void => {
      if (host.scrollLeft !== 0 || host.scrollTop !== 0) {
        host.scrollLeft = 0
        host.scrollTop = 0
      }
    }
    host.addEventListener('scroll', lockScroll)
    return () => {
      observer.disconnect()
      host.removeEventListener('scroll', lockScroll)
    }
  }, [paneId])

  const cwd = session?.cwd || task?.lastCwd
  const gitRoot = session?.gitRoot ?? null

  return (
    <div
      className={`term-leaf ${active ? 'active' : ''}`}
      onMouseDown={() => onFocus(paneId)}
    >
      <div className="term-bar">
        <div className="path" title={cwd ?? ''}>
          {gitRoot && <span className="git">{gitRoot.split(/[/\\]/).filter(Boolean).pop()} </span>}
          {cwd ? relativeToGit(cwd, gitRoot) : 'ディレクトリ未取得'}
        </div>
        <span className="hint">
          {session?.workTitle || session?.activity
            ? `${session.workTitle || session.activity} · `
            : ''}
          {statusLabel(session?.status)} · {task?.goal || 'ゴール未設定'}
        </span>
      </div>
      <div className="term-host" ref={hostRef} />
    </div>
  )
}
