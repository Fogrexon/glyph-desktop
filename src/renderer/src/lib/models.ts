import type { LlmProviderId } from '@shared/types'

export function defaultModelHint(provider: LlmProviderId): string {
  if (provider === 'openrouter') return 'google/gemini-2.5-flash'
  return 'gemini-2.5-flash'
}
