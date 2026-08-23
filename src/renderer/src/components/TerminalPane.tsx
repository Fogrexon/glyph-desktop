import { useEffect, useRef, useState } from 'react'
import { relativeToGit } from '@renderer/lib/format'
import {
  attachTermHost,
  fitAndResize,
  refreshTermViewport,
  restoreTermOutput,
  termHosts
} from '@renderer/lib/termHosts'
import { hostLabel, looksLikeUrl, googleSearchUrl, omniboxUrl } from '@renderer/lib/urls'
import { suggestVisits, useBrowserHistory, type Visit } from '@renderer/lib/browserHistory'
import { statusLabel, useUi } from '@renderer/stores/ui'
import { useWorkspace } from '@renderer/stores/workspace'
import {
  leafActiveTab,
  leafActiveTabId,
  leafTabs,
  usePanes,
  type LeafNode,
  type PaneNode,
  type PaneTab,
  type SplitDir
} from '@renderer/stores/panes'
import type { TerminalSessionInfo } from '@shared/types'

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
        leaf={node}
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
        const parent = (
          e.currentTarget.parentElement as HTMLElement | null
        )?.getBoundingClientRect()
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

function tabLabel(tab: PaneTab, sessions: Record<string, TerminalSessionInfo>): string {
  if (tab.kind === 'browser') return hostLabel(tab.url)
  const activity = sessions[tab.id]?.activity?.trim()
  if (activity) return activity.split(/\s+/)[0] || 'zsh'
  return 'zsh'
}

type SuggestItem = { kind: 'search'; query: string; url: string } | { kind: 'visit'; visit: Visit }

function suggestItems(draft: string): SuggestItem[] {
  const query = draft.trim()
  const items: SuggestItem[] = suggestVisits(draft, 8).map((visit) => ({
    kind: 'visit' as const,
    visit
  }))
  if (query && !looksLikeUrl(query)) {
    items.unshift({ kind: 'search', query, url: googleSearchUrl(query) })
  }
  return items.slice(0, 8)
}

function UrlField({
  url,
  autofocus,
  onSubmit
}: {
  url: string
  autofocus: boolean
  onSubmit: (url: string) => void
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  useBrowserHistory()
  const [focused, setFocused] = useState(autofocus)
  const [draft, setDraft] = useState(url === 'about:blank' ? '' : url)
  const [picked, setPicked] = useState(-1)
  const shown = focused ? draft : url === 'about:blank' ? '' : url
  const items = focused ? suggestItems(shown) : []

  useEffect(() => {
    if (!autofocus) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [autofocus])

  const commit = (target: string): void => {
    onSubmit(target)
    setFocused(false)
    setPicked(-1)
    inputRef.current?.blur()
  }

  return (
    <div className="url-omnibox">
      <input
        ref={inputRef}
        className="browser-url"
        value={shown}
        placeholder="URL または検索"
        spellCheck={false}
        onFocus={() => {
          setFocused(true)
          setDraft(url === 'about:blank' ? '' : url)
          setPicked(-1)
        }}
        onBlur={() => {
          setFocused(false)
          setPicked(-1)
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          setPicked(-1)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && items.length > 0) {
            e.preventDefault()
            setPicked((n) => (n + 1) % items.length)
            return
          }
          if (e.key === 'ArrowUp' && items.length > 0) {
            e.preventDefault()
            setPicked((n) => (n <= 0 ? items.length - 1 : n - 1))
            return
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            setFocused(false)
            inputRef.current?.blur()
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            const hit = picked >= 0 ? items[picked] : null
            if (hit?.kind === 'visit') {
              commit(hit.visit.url)
              return
            }
            if (hit?.kind === 'search') {
              commit(hit.url)
              return
            }
            commit(omniboxUrl(shown))
          }
        }}
      />
      {items.length > 0 && (
        <ul className="url-suggest" role="listbox">
          {items.map((item, index) => {
            const key = item.kind === 'search' ? `search:${item.query}` : item.visit.url
            const title = item.kind === 'search' ? item.query : item.visit.label
            const sub = item.kind === 'search' ? 'Google で検索' : item.visit.url
            return (
              <li key={key}>
                <button
                  type="button"
                  className={index === picked ? 'active' : ''}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(item.kind === 'search' ? item.url : item.visit.url)}
                >
                  <span>{title}</span>
                  <span className="item-sub">{sub}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function LeafPane({
  leaf,
  taskId,
  active,
  onFocus
}: {
  leaf: LeafNode
  taskId: string
  active: boolean
  onFocus: (paneId: string) => void
}): React.JSX.Element {
  const paletteOpen = useUi((s) => s.paletteOpen)
  const surface = useUi((s) => s.workspaceSurface)
  const sessions = useUi((s) => s.sessions)
  const selectTab = usePanes((s) => s.selectTab)
  const setTabUrl = usePanes((s) => s.setTabUrl)
  const task = useWorkspace((s) => s.tasks.find((t) => t.id === taskId))
  const tabs = leafTabs(leaf)
  const current = leafActiveTab(leaf)
  const currentId = leafActiveTabId(leaf)
  const session = current.kind === 'terminal' ? sessions[current.id] : undefined
  const cwd = session?.cwd || task?.lastCwd
  const gitRoot = session?.gitRoot ?? null
  const showBrowser = current.kind === 'browser' && !paletteOpen && surface === 'task'

  return (
    <div className={`term-leaf ${active ? 'active' : ''}`} onMouseDown={() => onFocus(leaf.id)}>
      {tabs.length > 1 && (
        <div className="pane-tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === currentId}
              className={`pane-tab ${tab.id === currentId ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                selectTab(taskId, tab.id)
              }}
            >
              {tabLabel(tab, sessions)}
            </button>
          ))}
        </div>
      )}
      <div className="term-bar">
        {current.kind === 'browser' ? (
          <UrlField
            key={current.id}
            url={current.url}
            autofocus={active && !paletteOpen && current.url === 'about:blank'}
            onSubmit={(next) => {
              if (next === current.url) return
              setTabUrl(current.id, next)
              void window.glyph.browser?.load(current.id, next)
            }}
          />
        ) : (
          <div className="term-bar-row">
            <div className="path" title={cwd ?? ''}>
              {gitRoot && (
                <span className="git">{gitRoot.split(/[/\\]/).filter(Boolean).pop()} </span>
              )}
              {cwd ? relativeToGit(cwd, gitRoot) : 'ディレクトリ未取得'}
            </div>
            <span className="hint">
              {session?.workTitle ? `${session.workTitle} · ` : ''}
              {statusLabel(session?.status)} · {task?.goal || 'ゴール未設定'}
            </span>
          </div>
        )}
      </div>
      <div className="pane-body">
        {tabs.map((tab) =>
          tab.kind === 'terminal' ? (
            <TermSlot
              key={tab.id}
              paneId={tab.id}
              visible={tab.id === currentId}
              active={active && tab.id === currentId}
              paletteOpen={paletteOpen}
            />
          ) : (
            <BrowserSlot
              key={tab.id}
              tabId={tab.id}
              url={tab.url}
              visible={tab.id === currentId}
              show={showBrowser && tab.id === currentId}
            />
          )
        )}
      </div>
    </div>
  )
}

function TermSlot({
  paneId,
  visible,
  active,
  paletteOpen
}: {
  paneId: string
  visible: boolean
  active: boolean
  paletteOpen: boolean
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

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
        refreshTermViewport(paneId)
        if (active && !useUi.getState().paletteOpen) host.term.focus()
      }
      requestAnimationFrame(() => requestAnimationFrame(layout))
    })
    return () => {
      cancelled = true
    }
    // active is read at attach time; focus is handled by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId])

  useEffect(() => {
    const host = termHosts.get(paneId)
    if (!host) return
    host.term.options.disableStdin = paletteOpen || !visible
    if (paletteOpen || !visible) {
      host.term.blur()
      return
    }
    if (active) host.term.focus()
  }, [active, paneId, paletteOpen, visible])

  useEffect(() => {
    if (!visible) return
    fitAndResize(paneId)
    refreshTermViewport(paneId)
  }, [paneId, visible])

  useEffect(() => {
    if (!hostRef.current || !visible) return
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
  }, [paneId, visible])

  return <div className="term-host" ref={hostRef} hidden={!visible} />
}

function BrowserSlot({
  tabId,
  url,
  visible,
  show
}: {
  tabId: string
  url: string
  visible: boolean
  show: boolean
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.glyph.browser) return
    void window.glyph.browser.ensure(tabId, url)
    // url is only the initial document; later navigations go through load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per tab
  }, [tabId])

  useEffect(() => {
    if (!window.glyph.browser) return
    void window.glyph.browser.setVisible(tabId, show)
    return () => {
      void window.glyph.browser?.setVisible(tabId, false)
    }
  }, [tabId, show])

  useEffect(() => {
    if (!show || !hostRef.current || !window.glyph.browser) return
    const el = hostRef.current
    const report = (): void => {
      const rect = el.getBoundingClientRect()
      void window.glyph.browser?.setBounds(tabId, {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      })
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    window.addEventListener('resize', report)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [tabId, show])

  return <div className="browser-host" ref={hostRef} hidden={!visible} />
}
