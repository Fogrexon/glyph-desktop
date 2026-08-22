import type { GlyphAPI } from './index'

declare global {
  interface Window {
    glyph: GlyphAPI
  }
}

export {}
