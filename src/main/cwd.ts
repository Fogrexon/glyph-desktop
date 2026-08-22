import { existsSync } from 'fs'
import { dirname, join } from 'path'

export function findGitRoot(cwd: string): string | null {
  let dir = cwd
  for (let i = 0; i < 64; i++) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

export function basenamePath(cwd: string): string {
  const normalized = cwd.replace(/[\\/]+$/, '')
  const parts = normalized.split(/[/\\]/)
  return parts[parts.length - 1] || normalized
}
