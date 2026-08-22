/** Shared quit flag so window close handlers can distinguish hide vs real exit. */

let quitting = false

export function isAppQuitting(): boolean {
  return quitting
}

export function markAppQuitting(): void {
  quitting = true
}
