import type { AppSettings } from '@shared/types'
import { GeminiProvider } from './gemini'
import { OpenRouterProvider } from './openrouter'
import type { LlmProvider } from './types'

export function createProvider(settings: AppSettings): LlmProvider {
  if (settings.provider === 'openrouter') {
    return new OpenRouterProvider(settings.openrouterApiKey)
  }
  if (settings.provider === 'vertex') {
    return new GeminiProvider({
      id: 'vertex',
      project: settings.vertexProject || process.env.GOOGLE_CLOUD_PROJECT,
      location: settings.vertexLocation || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
    })
  }
  return new GeminiProvider({
    id: 'gemini',
    apiKey: settings.geminiApiKey
  })
}

export type { LlmProvider } from './types'
