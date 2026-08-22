export interface OscEvents {
  cwds: string[]
  commands: string[]
  commandFinished: boolean
}

export function parseOscCwd(chunk: string): string[] {
  const found: string[] = []
  const re =
    // ESC / BEL sequences from shell integration
    // eslint-disable-next-line no-control-regex
    /\x1b\](?:7;(file:\/\/[^\x07\x1b]*)|633;P;Cwd=([^\x07\x1b]*))(?:\x07|\x1b\\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(chunk)) !== null) {
    if (match[1]) {
      const decoded = decodeFileUri(match[1])
      if (decoded) found.push(decoded)
    } else if (match[2]) {
      found.push(normalizePath(match[2]))
    }
  }
  return found
}

/** VS Code 互換: OSC 633;E;<command> と 633;D（終了） */
export function parseOscCommandEvents(chunk: string): { commands: string[]; finished: boolean } {
  const commands: string[] = []
  let finished = false
  const re =
    // eslint-disable-next-line no-control-regex
    /\x1b\]633;([A-Za-z])(?:;([^\x07\x1b]*))?(?:\x07|\x1b\\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(chunk)) !== null) {
    const kind = match[1]
    const payload = match[2] ?? ''
    if (kind === 'E' && payload) {
      const cmd = sanitizeCommand(payload)
      if (cmd) commands.push(cmd)
    } else if (kind === 'D') {
      finished = true
    }
  }
  return { commands, finished }
}

function sanitizeCommand(raw: string): string {
  return raw
    .replace(/\x1b/g, '')
    .replace(/[\x00-\x1f]/g, ' ')
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16)
      return code >= 32 && code < 127 ? String.fromCharCode(code) : ' '
    })
    .trim()
}

function decodeFileUri(uri: string): string | undefined {
  try {
    const url = new URL(uri)
    if (url.protocol !== 'file:') return undefined
    let pathname = decodeURIComponent(url.pathname || '')
    if (/^\/[A-Za-z]:/.test(pathname)) {
      pathname = pathname.slice(1)
    }
    if (process.platform === 'win32') {
      pathname = pathname.replace(/\//g, '\\')
    }
    return pathname || undefined
  } catch {
    return undefined
  }
}

function normalizePath(input: string): string {
  return input.replace(/\r/g, '').trim()
}

export class OscScanner {
  private buffer = ''

  push(chunk: string): OscEvents {
    this.buffer += chunk
    const cwds = parseOscCwd(this.buffer)
    const { commands, finished } = parseOscCommandEvents(this.buffer)
    const lastBel = Math.max(this.buffer.lastIndexOf('\x07'), this.buffer.lastIndexOf('\x1b\\'))
    if (lastBel >= 0) {
      this.buffer = this.buffer.slice(lastBel + 1)
    } else if (this.buffer.length > 8192) {
      this.buffer = this.buffer.slice(-2048)
    }
    return { cwds, commands, commandFinished: finished }
  }
}
