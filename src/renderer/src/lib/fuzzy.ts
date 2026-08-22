export function fuzzyScore(query: string, ...fields: string[]): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const hay = fields.filter(Boolean).join(' ').toLowerCase()
  if (!hay) return -1
  if (hay === q) return 400
  if (hay.startsWith(q)) return 300 - hay.length
  if (hay.includes(q)) return 200 - hay.indexOf(q)
  let qi = 0
  let score = 80
  let last = -2
  for (let i = 0; i < hay.length && qi < q.length; i++) {
    if (hay[i] === q[qi]) {
      if (i === last + 1) score += 4
      score += 2
      last = i
      qi += 1
    }
  }
  return qi === q.length ? score - hay.length * 0.05 : -1
}
