/**
 * Interface base do provider de IA
 */
export class BaseProvider {
  constructor(config = {}) {
    this.config = config
    this.sessions = new Map()
    this.currentModel = config.model || null
  }

  setModel(model) {
    this.currentModel = model
  }

  getModel() {
    return this.currentModel
  }

  getAvailableModels() {
    return []
  }

  get name() {
    throw new Error('Provider deve implementar o getter name')
  }

  async initialize() { }

  async *query(params) {
    throw new Error('Provider deve implementar o método query')
  }

  getSession(chatId) {
    return this.sessions.get(chatId) || null
  }

  setSession(chatId, sessionId) {
    this.sessions.set(chatId, sessionId)
  }

  abort(chatId) {
    return false
  }

  async cleanup() {
    this.sessions.clear()
  }
}
