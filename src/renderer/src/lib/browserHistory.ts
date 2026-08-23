import { useSyncExternalStore } from 'react'
import { canonicalUrl, googleQuery, hostLabel } from '@renderer/lib/urls'

export interface Visit {
  url: string
  host: string
  label: string
  at: number
  count: number
}

const STORAGE_KEY = 'glyph.browser.history.v1'
const MAX = 200

interface HistoryRuntime {
  visits: Visit[]
  listeners: Set<() => void>
}

const glyphWindow = window as Window & { __glyphBrowserHistory?: HistoryRuntime }

function runtime(): HistoryRuntime {
  if (!glyphWindow.__glyphBrowserHistory) {
    glyphWindow.__glyphBrowserHistory = { visits: load(), listeners: new Set() }
  }
  return glyphWindow.__glyphBrowserHistory
}

function load(): Visit[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter(isVisit).slice(0, MAX)
  } catch {
    return []
  }
}

function isVisit(value: unknown): value is Visit {
  if (!value || typeof value !== 'object') return false
  const v = value as Visit
  return (
    typeof v.url === 'string' &&
    typeof v.host === 'string' &&
    typeof v.label === 'string' &&
    typeof v.at === 'number' &&
    typeof v.count === 'number'
  )
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runtime().visits))
  } catch {
    // quota
  }
}

function emit(): void {
  for (const listener of runtime().listeners) listener()
}

function skipUrl(url: string): boolean {
  if (!url || url === 'about:blank') return true
  if (url.startsWith('about:')) return true
  if (url.startsWith('chrome-error:')) return true
  if (url.startsWith('data:')) return true
  return false
}

export function recordVisit(url: string, title?: string): void {
  if (skipUrl(url)) return
  const key = canonicalUrl(url)
  const query = googleQuery(key)
  let host = ''
  try {
    host = new URL(key).host
  } catch {
    host = ''
  }
  const label = (title && title.trim()) || query || hostLabel(key) || key
  const state = runtime()
  const existing = state.visits.find((item) => item.url === key)
  const next: Visit = existing
    ? {
        ...existing,
        at: Date.now(),
        count: existing.count + 1,
        label: title?.trim() || existing.label || label,
        host
      }
    : { url: key, host, label, at: Date.now(), count: 1 }
  state.visits = [next, ...state.visits.filter((item) => item.url !== key)].slice(0, MAX)
  persist()
  emit()
}

export function setVisitTitle(url: string, title: string): void {
  const trimmed = title.trim()
  if (!trimmed || skipUrl(url)) return
  const key = canonicalUrl(url)
  if (googleQuery(key)) return
  const state = runtime()
  const index = state.visits.findIndex((item) => item.url === key)
  if (index < 0) return
  const current = state.visits[index]
  if (!current || current.label === trimmed) return
  const copy = [...state.visits]
  copy[index] = { ...current, label: trimmed }
  state.visits = copy
  persist()
  emit()
}

export function suggestVisits(query: string, limit = 8): Visit[] {
  const q = query.trim().toLowerCase()
  const list = runtime().visits
  if (!q) return list.slice(0, limit)
  return list
    .filter(
      (item) =>
        item.url.toLowerCase().includes(q) ||
        item.host.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q)
    )
    .sort((a, b) => b.count - a.count || b.at - a.at)
    .slice(0, limit)
}

function subscribe(listener: () => void): () => void {
  runtime().listeners.add(listener)
  return () => {
    runtime().listeners.delete(listener)
  }
}

function snapshot(): Visit[] {
  return runtime().visits
}

export function useBrowserHistory(): Visit[] {
  return useSyncExternalStore(subscribe, snapshot)
}
