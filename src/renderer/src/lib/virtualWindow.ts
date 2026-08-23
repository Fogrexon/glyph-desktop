import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react'

export interface VirtualItem {
  index: number
  key: string
  start: number
  size: number
}

/**
 * Keep the scroll range equal to the full list, mount only the viewport slice.
 * Off-screen height changes adjust scrollTop so the visible rows stay put.
 */
export function useVirtualWindow<T>(opts: {
  items: T[]
  getKey: (item: T, index: number) => string
  estimate: (item: T, index: number) => number
  overscan?: number
}): {
  parentRef: RefObject<HTMLDivElement | null>
  totalSize: number
  virtualItems: VirtualItem[]
  measure: (key: string) => (node: HTMLElement | null) => void
} {
  const { items, getKey, estimate, overscan = 8 } = opts
  const parentRef = useRef<HTMLDivElement>(null)
  const measured = useRef(new Map<string, number>())
  const live = useRef(new Map<string, ResizeObserver>())
  const refFns = useRef(new Map<string, (node: HTMLElement | null) => void>())
  const prevAbove = useRef(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewHeight, setViewHeight] = useState(0)
  const [rev, setRev] = useState(0)

  useEffect(() => {
    const keys = new Set(items.map((item, index) => getKey(item, index)))
    for (const key of [...live.current.keys()]) {
      if (keys.has(key)) continue
      live.current.get(key)?.disconnect()
      live.current.delete(key)
      measured.current.delete(key)
      refFns.current.delete(key)
    }
  }, [getKey, items])

  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const sync = (): void => {
      setScrollTop(el.scrollTop)
      setViewHeight(el.clientHeight)
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    const onScroll = (): void => setScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', onScroll)
    }
  }, [])

  useEffect(() => {
    return () => {
      for (const observer of live.current.values()) observer.disconnect()
      live.current.clear()
    }
  }, [])

  const sizeOf = useCallback(
    (item: T, index: number): number => {
      const key = getKey(item, index)
      const est = estimate(item, index)
      if (live.current.has(key)) return measured.current.get(key) ?? est
      return est
    },
    [estimate, getKey]
  )

  const prevOffsets = useRef<number[]>([])
  const prevTotal = useRef(0)
  const { offsets, totalSize } = useMemo(() => {
    const next: number[] = []
    let acc = 0
    for (let i = 0; i < items.length; i++) {
      next.push(acc)
      const item = items[i]
      if (item !== undefined) acc += sizeOf(item, i)
    }
    const prev = prevOffsets.current
    if (prev.length === next.length && prevTotal.current === acc) {
      let same = true
      for (let i = 0; i < next.length; i++) {
        if (prev[i] !== next[i]) {
          same = false
          break
        }
      }
      if (same) return { offsets: prev, totalSize: prevTotal.current }
    }
    prevOffsets.current = next
    prevTotal.current = acc
    return { offsets: next, totalSize: acc }
    // rev: measured heights for live rows
  }, [items, sizeOf, rev])

  const startIndex = useMemo(() => {
    if (offsets.length === 0) return 0
    let lo = 0
    let hi = offsets.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if ((offsets[mid] ?? 0) <= scrollTop) lo = mid
      else hi = mid - 1
    }
    return Math.max(0, lo)
  }, [offsets, scrollTop])

  const endIndex = useMemo(() => {
    const bottom = scrollTop + viewHeight
    let i = startIndex
    while (i < items.length && (offsets[i] ?? 0) < bottom) i++
    return i
  }, [items.length, offsets, scrollTop, startIndex, viewHeight])

  const from = Math.max(0, startIndex - overscan)
  const to = Math.min(items.length, endIndex + overscan)
  const prevVirtual = useRef<VirtualItem[]>([])

  const virtualItems = useMemo((): VirtualItem[] => {
    const rows: VirtualItem[] = []
    for (let index = from; index < to; index++) {
      const item = items[index]
      if (item === undefined) continue
      rows.push({
        index,
        key: getKey(item, index),
        start: offsets[index] ?? 0,
        size: sizeOf(item, index)
      })
    }
    const prev = prevVirtual.current
    if (prev.length === rows.length) {
      let same = true
      for (let i = 0; i < rows.length; i++) {
        const a = prev[i]
        const b = rows[i]
        if (
          !a ||
          !b ||
          a.key !== b.key ||
          a.index !== b.index ||
          a.start !== b.start ||
          a.size !== b.size
        ) {
          same = false
          break
        }
      }
      if (same) return prev
    }
    prevVirtual.current = rows
    return rows
  }, [from, getKey, items, offsets, sizeOf, to])

  useLayoutEffect(() => {
    const el = parentRef.current
    const above = offsets[startIndex] ?? 0
    const delta = above - prevAbove.current
    prevAbove.current = above
    if (!el || !delta || el.scrollTop <= 0) return
    el.scrollTop += delta
  }, [offsets, startIndex])

  const measure = useCallback((key: string) => {
    const existing = refFns.current.get(key)
    if (existing) return existing
    const fn = (node: HTMLElement | null): void => {
      const prev = live.current.get(key)
      if (prev) {
        prev.disconnect()
        live.current.delete(key)
      }
      if (!node) return
      const apply = (): void => {
        const h = Math.round(node.offsetHeight)
        if (h <= 0) return
        if (measured.current.get(key) === h) return
        measured.current.set(key, h)
        setRev((n) => n + 1)
      }
      apply()
      const ro = new ResizeObserver(apply)
      ro.observe(node)
      live.current.set(key, ro)
    }
    refFns.current.set(key, fn)
    return fn
  }, [])

  return { parentRef, totalSize, virtualItems, measure }
}
