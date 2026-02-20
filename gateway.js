import 'dotenv/config'
import http from 'http'
import QRCode from 'qrcode'
import config from './config.js'
import WhatsAppAdapter from './adapters/whatsapp.js'
import iMessageAdapter from './adapters/imessage.js'
import TelegramAdapter from './adapters/telegram.js'
import SignalAdapter from './adapters/signal.js'
import SessionManager from './sessions/manager.js'
import AgentRunner from './agent/runner.js'
import CommandHandler from './commands/handler.js'
import { Composio } from '@composio/core'

/**
 * OpenClawD Gateway — Roteador de mensagens entre plataformas e o agente Claude
 */
class Gateway {
  constructor() {
    this.sessionManager = new SessionManager()
    this.agentRunner = new AgentRunner(this.sessionManager, {
      allowedTools: config.agent?.allowedTools || ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
      maxTurns: config.agent?.maxTurns || 50,
      provider: config.agent?.provider || 'claude',
      permissionMode: 'bypassPermissions',
      opencode: config.agent?.opencode || {}
    })
    this.commandHandler = new CommandHandler(this)
    this.adapters = new Map()
    this.pendingApprovals = new Map()
    this.composio = new Composio()
    this.composioSession = null
    this.mcpServers = {}
    this.setupQueueMonitoring()
    this.setupAgentMonitoring()
    this.setupCronExecution()
  }

  async initMcpServers() {
    const userId = config.agentId || 'openclawd-user'
    console.log('[Composio] Inicializando sessão para:', userId)
    try {
      this.composioSession = await this.composio.create(userId)
      this.mcpServers.composio = {
        type: 'http',
        url: this.composioSession.mcp.url,
        headers: this.composioSession.mcp.headers
      }
      console.log('[Composio] Sessão pronta')
    } catch (err) {
      console.error('[Composio] Falha ao inicializar:', err.message)
    }
  }

  setupQueueMonitoring() {
    this.agentRunner.on('queued', ({ runId, sessionKey, position, queueLength }) => {
      if (position > 0) {
        console.log(`[Queue] 📥 Enfileirado: posição ${position + 1}, ${queueLength} pendentes`)
      }
    })

    this.agentRunner.on('processing', ({ runId, waitTimeMs, remainingInQueue }) => {
      if (waitTimeMs > 100) {
        console.log(`[Queue] ⚙️  Processando (aguardou ${Math.round(waitTimeMs)}ms, ${remainingInQueue} restantes)`)
      }
    })

    this.agentRunner.on('completed', ({ runId, processingTimeMs }) => {
      console.log(`[Queue] ✓ Concluído em ${Math.round(processingTimeMs)}ms`)
    })

    this.agentRunner.on('failed', ({ runId, error }) => {
      console.log(`[Queue] ✗ Falhou: ${error}`)
    })
  }

  setupAgentMonitoring() {
    this.agentRunner.on('agent:tool', ({ sessionKey, name }) => {
      console.log(`[Agent] 🔧 Usando ferramenta: ${name}`)
    })
  }

  setupCronExecution() {
    this.agentRunner.agent.cronScheduler.on('execute', async ({ jobId, platform, chatId, sessionKey, message, invokeAgent }) => {
      console.log(`[Cron] ⏰ Executando job ${jobId}${invokeAgent ? ' (invocando agente)' : ''}`)

      const adapter = this.adapters.get(platform)
      if (!adapter) {
        console.error(`[Cron] Sem adapter para plataforma: ${platform}`)
        return
      }

      try {
        if (invokeAgent) {
          const response = await this.agentRunner.agent.runAndCollect({
            message,
            sessionKey: sessionKey || `cron:${jobId}`,
            platform,
            chatId,
            mcpServers: this.mcpServers
          })
          if (response) {
            await adapter.sendMessage(chatId, response)
          }
        } else {
          await adapter.sendMessage(chatId, message)
        }
      } catch (err) {
        console.error(`[Cron] Falha ao executar job:`, err.message)
      }
    })
  }

  waitForApproval(chatId, adapter, message, timeoutMs = 120000) {
    const existing = this.pendingApprovals.get(chatId)
    if (existing) {
      clearTimeout(existing.timeout)
      existing.resolve(null)
    }

    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => {
        this.pendingApprovals.delete(chatId)
        resolve(null)
      }, timeoutMs)

      this.pendingApprovals.set(chatId, { resolve, timeout })

      try {
        await adapter.sendMessage(chatId, message)
      } catch (err) {
        console.error('[Gateway] Falha ao enviar prompt de aprovação:', err.message)
        clearTimeout(timeout)
        this.pendingApprovals.delete(chatId)
        resolve(null)
      }
    })
  }

  async start() {
    console.log('='.repeat(50))
    console.log('OpenClawD Gateway Iniciando')
    console.log('='.repeat(50))
    console.log(`Agent ID: ${config.agentId}`)
    console.log(`Workspace: ~/openclawd/`)
    console.log('')

    const platforms = ['whatsapp', 'imessage', 'telegram', 'signal']
    for (const p of platforms) {
      const pc = config[p]
      if (!pc?.enabled) continue
      const dms = pc.allowedDMs?.length ? pc.allowedDMs.join(', ') : 'NENHUM (todos bloqueados)'
      const groups = pc.allowedGroups?.length ? pc.allowedGroups.join(', ') : 'NENHUM (todos bloqueados)'
      console.log(`[Security] ${p}: DMs=${dms} | Grupos=${groups}`)
    }

    await this.initMcpServers()
    this.agentRunner.setMcpServers(this.mcpServers)

    if (this.agentRunner.agent.provider.initialize) {
      try {
        await this.agentRunner.agent.provider.initialize()
        console.log('[Provider] Pronto')
      } catch (err) {
        console.error('[Provider] Falha na inicialização:', err.message)
      }
    }

    this.agentRunner.agent.gateway = this

    if (config.whatsapp.enabled) {
      console.log('[Gateway] Inicializando adapter WhatsApp...')
      const whatsapp = new WhatsAppAdapter(config.whatsapp)
      this.setupAdapter(whatsapp, 'whatsapp', config.whatsapp)
      this.adapters.set('whatsapp', whatsapp)
      try {
        await whatsapp.start()
      } catch (err) {
        console.error('[Gateway] Adapter WhatsApp falhou ao iniciar:', err.message)
      }
    }

    if (config.imessage.enabled) {
      console.log('[Gateway] Inicializando adapter iMessage...')
      const imessage = new iMessageAdapter(config.imessage)
      this.setupAdapter(imessage, 'imessage', config.imessage)
      this.adapters.set('imessage', imessage)
      try {
        await imessage.start()
      } catch (err) {
        console.error('[Gateway] Adapter iMessage falhou ao iniciar:', err.message)
      }
    }

    if (config.telegram?.enabled) {
      console.log('[Gateway] Inicializando adapter Telegram...')
      const telegram = new TelegramAdapter(config.telegram)
      this.setupAdapter(telegram, 'telegram', config.telegram)
      this.adapters.set('telegram', telegram)
      try {
        await telegram.start()
      } catch (err) {
        console.error('[Gateway] Adapter Telegram falhou ao iniciar:', err.message)
      }
    }

    if (config.signal?.enabled) {
      console.log('[Gateway] Inicializando adapter Signal...')
      const signal = new SignalAdapter(config.signal)
      this.setupAdapter(signal, 'signal', config.signal)
      this.adapters.set('signal', signal)
      try {
        await signal.start()
      } catch (err) {
        console.error('[Gateway] Adapter Signal falhou ao iniciar:', err.message)
      }
    }

    process.on('SIGINT', () => this.stop())
    process.on('SIGTERM', () => this.stop())

    this.startHttpServer()

    console.log('')
    console.log('[Gateway] Pronto e aguardando mensagens')
    console.log('[Gateway] Usando Claude Agent SDK com memória + cron + Composio')
    console.log('[Gateway] Comandos: /help, /new, /status, /memory, /stop')
  }

  setupAdapter(adapter, platform, platformConfig) {
    adapter.onMessage(async (message) => {
      const sessionKey = adapter.generateSessionKey(config.agentId, platform, message)

      console.log('')
      console.log(`[${platform.toUpperCase()}] Mensagem recebida:`)
      console.log(`  Sessão: ${sessionKey}`)
      console.log(`  De: ${message.sender}`)
      console.log(`  Grupo: ${message.isGroup}`)
      console.log(`  Texto: ${message.text.substring(0, 100)}${message.text.length > 100 ? '...' : ''}`)
      if (message.image) {
        console.log(`  Imagem: ${Math.round(message.image.data.length / 1024)}KB`)
      }

      const pending = this.pendingApprovals.get(message.chatId)
      if (pending) {
        console.log(`[${platform.toUpperCase()}] Resolvendo aprovação pendente com: ${message.text}`)
        clearTimeout(pending.timeout)
        this.pendingApprovals.delete(message.chatId)
        pending.resolve(message.text)
        return
      }

      if (this.commandHandler.handlePendingReply(message.text, message.chatId)) {
        return
      }

      try {
        const commandResult = await this.commandHandler.execute(
          message.text,
          sessionKey,
          adapter,
          message.chatId
        )

        if (commandResult.handled) {
          if (commandResult.response) {
            await adapter.sendMessage(message.chatId, commandResult.response)
          }
          return
        }

        const queueStatus = this.agentRunner.getQueueStatus(sessionKey)

        if (adapter.sendTyping) {
          await adapter.sendTyping(message.chatId)
        }

        if (queueStatus.pending > 0 && adapter.react && message.raw?.key?.id) {
          await adapter.react(message.chatId, message.raw.key.id, '⏳')
        }

        const response = await this.agentRunner.enqueueRun(
          sessionKey,
          message.text,
          adapter,
          message.chatId,
          message.image
        )

        if (adapter.stopTyping) {
          await adapter.stopTyping(message.chatId)
        }

        console.log(`[${platform.toUpperCase()}] Concluído`)
      } catch (error) {
        console.error(`[${platform.toUpperCase()}] Erro:`, error.message)

        if (adapter.stopTyping) {
          await adapter.stopTyping(message.chatId)
        }

        try {
          await adapter.sendMessage(
            message.chatId,
            "Desculpe, encontrei um erro. Por favor, tente novamente."
          )
        } catch (sendErr) {
          console.error(`[${platform.toUpperCase()}] Falha ao enviar mensagem de erro:`, sendErr.message)
        }
      }
    })
  }

  startHttpServer() {
    const port = process.env.PORT || 4096

    this.httpServer = http.createServer(async (req, res) => {
      if (req.url === '/qr') {
        const wa = this.adapters.get('whatsapp')
        if (!wa || !wa.latestQr) {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          const status = wa?.myJid ? 'WhatsApp conectado.' : 'Nenhum QR code disponível. Aguardando WhatsApp...'
          res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>WhatsApp QR</title><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#111;color:#fff}</style></head><body><p>${status}</p></body></html>`)
          return
        }

        try {
          const qrDataUrl = await QRCode.toDataURL(wa.latestQr, { width: 400, margin: 2 })
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="10"><title>WhatsApp QR</title><style>body{font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#111;color:#fff}img{border-radius:12px}</style></head><body><h2>Escanear com WhatsApp</h2><img src="${qrDataUrl}" alt="QR Code"/><p>Página atualiza automaticamente.</p></body></html>`)
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('Falha ao gerar QR')
        }
        return
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      const adaptersStatus = {}
      for (const [name, adapter] of this.adapters) {
        adaptersStatus[name] = { connected: !!adapter.sock || !!adapter.bot }
      }
      res.end(JSON.stringify({ status: 'ok', agent: config.agentId, adapters: adaptersStatus }))
    })

    this.httpServer.listen(port, () => {
      console.log(`[HTTP] Ouvindo na porta ${port} (QR code em /qr)`)
    })
  }

  async stop() {
    console.log('\n[Gateway] Encerrando...')
    this.agentRunner.agent.stopCron()
    for (const adapter of this.adapters.values()) {
      try {
        await adapter.stop()
      } catch (err) {
        console.error('[Gateway] Erro ao parar adapter:', err.message)
      }
    }
    console.log('[Gateway] Até logo!')
    process.exit(0)
  }
}

const gateway = new Gateway()
gateway.start().catch((err) => {
  console.error('[Gateway] Erro fatal:', err)
  process.exit(1)
})
