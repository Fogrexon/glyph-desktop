export function normalizeUrl(raw: string): string {
  const text = raw.trim()
  if (!text) return 'about:blank'
  if (text === 'about:blank') return text
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text
  if (
    text.startsWith('localhost') ||
    text.startsWith('127.') ||
    text.startsWith('[::1]') ||
    /^\d{1,3}(\.\d{1,3}){3}(?::\d+)?/.test(text)
  ) {
    return `http://${text}`
  }
  return `https://${text}`
}

export function looksLikeUrl(raw: string): boolean {
  const text = raw.trim()
  if (!text || /\s/.test(text)) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return true
  if (text.startsWith('localhost') || text.startsWith('127.') || text.startsWith('[::1]')) {
    return true
  }
  if (/^\d{1,3}(\.\d{1,3}){3}(?::\d+)?/.test(text)) return true
  return /^[^\s/]+\.[a-z]{2,}([/:?#].*)?$/i.test(text)
}

export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

export function googleQuery(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.endsWith('google.com') || parsed.pathname !== '/search') return null
    const q = parsed.searchParams.get('q')
    return q && q.trim() ? q : null
  } catch {
    return null
  }
}

/** Chrome-like omnibox: URL if it looks like one, otherwise Google search. */
export function omniboxUrl(raw: string): string {
  const text = raw.trim()
  if (!text) return 'about:blank'
  if (looksLikeUrl(text)) return normalizeUrl(text)
  return googleSearchUrl(text)
}

export function hostLabel(url: string): string {
  if (!url || url === 'about:blank') return 'browser'
  const query = googleQuery(url)
  if (query) return query
  try {
    const host = new URL(url).host
    return host || 'browser'
  } catch {
    return 'browser'
  }
}

export function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return url
  }
}
