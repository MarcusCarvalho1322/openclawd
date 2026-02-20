import { ClaudeProvider } from './claude-provider.js'
import { OpencodeProvider } from './opencode-provider.js'

const providers = {
  claude: ClaudeProvider,
  opencode: OpencodeProvider
}

const providerInstances = new Map()

export function getProvider(providerName, config = {}) {
  const name = providerName?.toLowerCase() || 'claude'

  if (!providers[name]) {
    throw new Error(`Provider desconhecido: ${name}. Disponíveis: ${Object.keys(providers).join(', ')}`)
  }

  const cacheKey = `${name}:${JSON.stringify(config)}`
  if (providerInstances.has(cacheKey)) {
    return providerInstances.get(cacheKey)
  }

  const ProviderClass = providers[name]
  const instance = new ProviderClass(config)
  providerInstances.set(cacheKey, instance)
  return instance
}

export function getAvailableProviders() {
  return Object.keys(providers)
}

export async function clearProviderCache() {
  for (const instance of providerInstances.values()) {
    if (instance.cleanup) await instance.cleanup()
  }
  providerInstances.clear()
}

export { ClaudeProvider } from './claude-provider.js'
export { OpencodeProvider } from './opencode-provider.js'
export { BaseProvider } from './base-provider.js'
