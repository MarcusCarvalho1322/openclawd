import { getProvider, getAvailableProviders } from '../providers/index.js'

/**
 * Gerenciador de comandos de barra para OpenClawD
 * Processa comandos como /new, /reset, /status, /memory, /model, /provider
 */
export default class CommandHandler {
  constructor(gateway) {
    this.gateway = gateway
    this.pendingModelSelect = new Map()
    this.pendingProviderSelect = new Map()
  }

  isCommand(text) {
    return text.trim().startsWith('/')
  }

  parse(text) {
    const trimmed = text.trim()
    const spaceIndex = trimmed.indexOf(' ')
    if (spaceIndex === -1) {
      return { command: trimmed.slice(1).toLowerCase(), args: '' }
    }
    return { command: trimmed.slice(1, spaceIndex).toLowerCase(), args: trimmed.slice(spaceIndex + 1).trim() }
  }

  async execute(text, sessionKey, adapter, chatId) {
    if (!this.isCommand(text)) return { handled: false }

    const { command, args } = this.parse(text)

    switch (command) {
      case 'new':
      case 'reset':
        return this.handleReset(sessionKey, adapter, chatId)
      case 'status':
        return this.handleStatus(sessionKey)
      case 'memory':
        return this.handleMemory(args)
      case 'queue':
        return this.handleQueue()
      case 'help':
        return this.handleHelp()
      case 'stop':
        return this.handleStop(sessionKey)
      case 'model':
        return this.handleModel(args, chatId, adapter)
      case 'provider':
        return this.handleProvider(args, chatId, adapter)
      default:
        return { handled: false }
    }
  }

  handlePendingReply(text, chatId) {
    if (this.pendingModelSelect.has(chatId)) {
      const resolve = this.pendingModelSelect.get(chatId)
      this.pendingModelSelect.delete(chatId)
      resolve(text.trim())
      return true
    }
    if (this.pendingProviderSelect.has(chatId)) {
      const resolve = this.pendingProviderSelect.get(chatId)
      this.pendingProviderSelect.delete(chatId)
      resolve(text.trim())
      return true
    }
    return false
  }

  async handleReset(sessionKey, adapter, chatId) {
    const sessionManager = this.gateway.sessionManager
    const agentRunner = this.gateway.agentRunner

    if (agentRunner.agent.sessions.has(sessionKey)) {
      agentRunner.agent.sessions.delete(sessionKey)
    }
    if (sessionManager.sessions.has(sessionKey)) {
      sessionManager.sessions.delete(sessionKey)
    }

    return { handled: true, response: '🔄 Sessão reiniciada. Começando do zero!' }
  }

  handleStatus(sessionKey) {
    const sessionManager = this.gateway.sessionManager
    const agentRunner = this.gateway.agentRunner

    const agentSession = agentRunner.agent.sessions.get(sessionKey)
    const queueStatus = agentRunner.getQueueStatus(sessionKey)
    const globalStats = agentRunner.getGlobalStats()

    const lines = [
      '📊 Status',
      '',
      `Sessão: ${sessionKey.split(':').slice(-2).join(':')}`,
      `Mensagens: ${agentSession?.messageCount || 0}`,
      `Fila: ${queueStatus.pending} pendentes${queueStatus.processing ? ' (processando)' : ''}`,
      '',
      `Global: ${globalStats.totalProcessed} processados, ${globalStats.totalFailed} falharam`
    ]

    return { handled: true, response: lines.join('\n') }
  }

  handleMemory(args) {
    const memoryManager = this.gateway.agentRunner.agent.memoryManager

    if (args === 'list') {
      const files = memoryManager.listDailyFiles()
      const lines = [
        '📝 Arquivos de Memória',
        '',
        `MEMORY.md: ${memoryManager.readLongTermMemory() ? 'existe' : 'vazio'}`,
        '',
        'Logs diários:',
        ...files.slice(0, 10).map(f => `  • ${f}`)
      ]
      if (files.length > 10) lines.push(`  ... e mais ${files.length - 10}`)
      return { handled: true, response: lines.join('\n') }
    }

    if (args.startsWith('search ')) {
      const query = args.slice(7)
      const results = memoryManager.searchMemory(query)
      if (results.length === 0) {
        return { handled: true, response: `🔍 Nenhum resultado para "${query}"` }
      }
      const lines = [`🔍 Busca: "${query}"`, '']
      for (const result of results.slice(0, 5)) {
        lines.push(`${result.file}:`)
        for (const match of result.matches.slice(0, 2)) {
          lines.push(`  Linha ${match.line}: ${match.context.substring(0, 100)}...`)
        }
      }
      return { handled: true, response: lines.join('\n') }
    }

    const today = memoryManager.readTodayMemory()
    const longTerm = memoryManager.readLongTermMemory()

    const lines = [
      '🧠 Memória',
      '',
      'Longo prazo (MEMORY.md):',
      longTerm ? longTerm.substring(0, 500) + (longTerm.length > 500 ? '...' : '') : 'Vazio',
      '',
      'Hoje:',
      today ? today.substring(0, 500) + (today.length > 500 ? '...' : '') : 'Sem notas ainda'
    ]

    return { handled: true, response: lines.join('\n') }
  }

  handleQueue() {
    const stats = this.gateway.agentRunner.getGlobalStats()
    const lines = [
      '📋 Status da Fila',
      '',
      `Pendentes: ${stats.totalPending}`,
      `Sessões ativas: ${stats.activeSessions}`,
      `Total de sessões: ${stats.totalSessions}`,
      '',
      `Processados: ${stats.totalProcessed}`,
      `Falharam: ${stats.totalFailed}`
    ]
    return { handled: true, response: lines.join('\n') }
  }

  handleStop(sessionKey) {
    const aborted = this.gateway.agentRunner.abort(sessionKey)
    return { handled: true, response: aborted ? '⏹️ Operação atual parada' : '⏹️ Nada para parar' }
  }

  async handleModel(args, chatId, adapter) {
    const agent = this.gateway.agentRunner.agent
    const provider = agent.provider
    const models = provider.getAvailableModels()
    const current = provider.getModel()

    if (args) {
      const idx = parseInt(args) - 1
      if (idx >= 0 && idx < models.length) {
        provider.setModel(models[idx].id)
        return { handled: true, response: `✅ Modelo definido para: ${models[idx].label} (${models[idx].id})` }
      }
      const match = models.find(m => m.id.includes(args.toLowerCase()) || m.label.toLowerCase().includes(args.toLowerCase()))
      if (match) {
        provider.setModel(match.id)
        return { handled: true, response: `✅ Modelo definido para: ${match.label} (${match.id})` }
      }
      return { handled: true, response: `Modelo desconhecido. Use /model para ver as opções.` }
    }

    const lines = [`🤖 Modelos (${agent.providerName})`, `Atual: ${current || '(padrão)'}`, '']
    for (let i = 0; i < models.length; i++) {
      const marker = models[i].id === current ? ' ←' : ''
      lines.push(`${i + 1}) ${models[i].label}${marker}`)
    }
    lines.push('', 'Responda com um número para trocar.')

    await adapter.sendMessage(chatId, lines.join('\n'))

    const reply = await new Promise((resolve) => {
      this.pendingModelSelect.set(chatId, resolve)
      setTimeout(() => {
        if (this.pendingModelSelect.has(chatId)) {
          this.pendingModelSelect.delete(chatId)
          resolve(null)
        }
      }, 30000)
    })

    if (!reply) return { handled: true, response: '' }
    const idx = parseInt(reply) - 1
    if (idx >= 0 && idx < models.length) {
      provider.setModel(models[idx].id)
      return { handled: true, response: `✅ Modelo definido para: ${models[idx].label}` }
    }
    return { handled: true, response: 'Sem mudança.' }
  }

  async handleProvider(args, chatId, adapter) {
    const agent = this.gateway.agentRunner.agent
    const available = getAvailableProviders()
    const current = agent.providerName

    if (args) {
      const target = args.toLowerCase()
      if (!available.includes(target)) {
        return { handled: true, response: `Provider desconhecido. Disponíveis: ${available.join(', ')}` }
      }
      if (target === current) return { handled: true, response: `Já usando ${current}.` }
      this.switchProvider(agent, target)
      return { handled: true, response: `✅ Trocado para ${target}` }
    }

    const lines = ['🔌 Providers', `Atual: ${current}`, '']
    for (let i = 0; i < available.length; i++) {
      const marker = available[i] === current ? ' ←' : ''
      lines.push(`${i + 1}) ${available[i]}${marker}`)
    }
    lines.push('', 'Responda com um número para trocar.')

    await adapter.sendMessage(chatId, lines.join('\n'))

    const reply = await new Promise((resolve) => {
      this.pendingProviderSelect.set(chatId, resolve)
      setTimeout(() => {
        if (this.pendingProviderSelect.has(chatId)) {
          this.pendingProviderSelect.delete(chatId)
          resolve(null)
        }
      }, 30000)
    })

    if (!reply) return { handled: true, response: '' }
    const idx = parseInt(reply) - 1
    if (idx >= 0 && idx < available.length) {
      const target = available[idx]
      if (target === current) return { handled: true, response: `Já usando ${current}.` }
      this.switchProvider(agent, target)
      return { handled: true, response: `✅ Trocado para ${target}` }
    }
    return { handled: true, response: 'Sem mudança.' }
  }

  switchProvider(agent, providerName) {
    const config = agent.provider.config || {}
    const newProvider = getProvider(providerName, config)
    agent.provider = newProvider
    agent.providerName = providerName
    agent.sessions.clear()
  }

  handleHelp() {
    const lines = [
      '📖 Comandos',
      '',
      '/new ou /reset — Iniciar nova sessão',
      '/status — Ver status da sessão',
      '/memory — Ver resumo da memória',
      '/memory list — Listar arquivos de memória',
      '/memory search <consulta> — Buscar na memória',
      '/queue — Ver status da fila',
      '/model — Trocar modelo de IA',
      '/model 2 — Trocar para modelo por número',
      '/provider — Trocar provider (claude/opencode)',
      '/stop — Parar operação atual',
      '/help — Mostrar esta ajuda'
    ]
    return { handled: true, response: lines.join('\n') }
  }
}
