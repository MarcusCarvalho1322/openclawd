/**
 * Interface base de adapter para plataformas de mensagens
 */
export default class BaseAdapter {
  constructor(config) {
    this.config = config
    this.messageCallback = null
  }

  async start() {
    throw new Error('start() deve ser implementado pela subclasse')
  }

  async stop() {
    throw new Error('stop() deve ser implementado pela subclasse')
  }

  async sendMessage(chatId, text) {
    throw new Error('sendMessage() deve ser implementado pela subclasse')
  }

  onMessage(callback) {
    this.messageCallback = callback
  }

  emitMessage(message) {
    if (this.messageCallback) {
      this.messageCallback(message)
    }
  }

  shouldRespond(message, config) {
    const { chatId, isGroup, sender, mentions } = message

    if (isGroup) {
      if (config.allowedGroups.length === 0) {
        console.log(`[Security] Mensagem de grupo bloqueada de ${chatId} (nenhum grupo permitido)`)
        return false
      }
      if (!config.allowedGroups.includes('*') && !config.allowedGroups.includes(chatId)) {
        console.log(`[Security] Mensagem de grupo bloqueada de ${chatId} (não está na allowlist)`)
        return false
      }
      if (config.respondToMentionsOnly && mentions && !mentions.includes('self')) {
        return false
      }
    } else {
      if (config.allowedDMs.length === 0) {
        console.log(`[Security] DM bloqueado de ${sender || chatId} (nenhum DM permitido — configure allowedDMs no .env)`)
        return false
      }
      if (!config.allowedDMs.includes('*') && !config.allowedDMs.includes(chatId)) {
        console.log(`[Security] DM bloqueado de ${sender || chatId} (não está na allowlist)`)
        return false
      }
    }

    return true
  }

  generateSessionKey(agentId, platform, message) {
    const type = message.isGroup ? 'group' : 'dm'
    return `agent:${agentId}:${platform}:${type}:${message.chatId}`
  }
}
