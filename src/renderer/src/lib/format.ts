export function formatDeadline(ms: number | null): string {
  if (ms == null) return '期限なし'
  const diff = ms - Date.now()
  const abs = Math.abs(diff)
  const hours = Math.round(abs / 36e5)
  if (diff < 0) {
    if (hours < 24) return `${hours}時間超過`
    return `${Math.round(hours / 24)}日超過`
  }
  if (hours < 24) return `残り${Math.max(hours, 0)}時間`
  return `残り${Math.round(hours / 24)}日`
}

export function toDatetimeLocalValue(ms: number | null | undefined): string {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocalValue(value: string): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function shortenPath(cwd: string | null | undefined): string {
  if (!cwd) return ''
  const parts = cwd.replace(/[\\/]+$/, '').split(/[/\\]/)
  return parts[parts.length - 1] || cwd
}

export function relativeToGit(cwd: string, gitRoot: string | null): string {
  if (!gitRoot) return cwd
  if (cwd.toLowerCase().startsWith(gitRoot.toLowerCase())) {
    const rel = cwd.slice(gitRoot.length).replace(/^[\\/]/, '')
    const name = gitRoot.split(/[/\\]/).filter(Boolean).pop() || gitRoot
    return rel ? `${name}/${rel.replace(/\\/g, '/')}` : name
  }
  return cwd
}
