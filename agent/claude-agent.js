import { EventEmitter } from 'events'
import MemoryManager from '../memory/manager.js'
import { createCronMcpServer, setContext as setCronContext, getScheduler } from '../tools/cron.js'
import { createGatewayMcpServer, setGatewayContext } from '../tools/gateway.js'
import { createAppleScriptMcpServer } from '../tools/applescript.js'
import { getProvider } from '../providers/index.js'

function buildSystemPrompt(memoryContext, sessionInfo, cronInfo, providerName = 'claude') {
  const now = new Date()
  const dateStr = now.toLocaleDateString('pt-BR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
  const timeStr = now.toLocaleTimeString('pt-BR', { hour12: false })

  return `Você é o OpenClawD, um assistente de IA pessoal se comunicando via plataformas de mensagens (WhatsApp, Telegram, iMessage).

## Contexto Atual
- Data: ${dateStr}
- Hora: ${timeStr}
- Sessão: ${sessionInfo.sessionKey}
- Plataforma: ${sessionInfo.platform}

## Sistema de Memória

Você tem acesso a um sistema de memória persistente. Use-o para lembrar informações importantes entre conversas.

### Estrutura de Memória
- **MEMORY.md**: Memória de longo prazo curada para fatos importantes, preferências e decisões
- **memory/YYYY-MM-DD.md**: Notas diárias (log append-only para cada dia)

### Quando Escrever na Memória
- **Somente quando o usuário pedir** — ex: "lembre disso", "salve isso", "não esqueça"
- **Escreva em MEMORY.md** para: preferências, decisões importantes, informações recorrentes, relacionamentos, fatos chave
- **Escreva no log diário** para: tarefas concluídas, notas temporárias, contexto de conversa, coisas que aconteceram hoje

### Ferramentas de Memória
- Use a ferramenta \`Read\` para ler arquivos de memória de ~/openclawd/
- Use as ferramentas \`Write\` ou \`Edit\` para atualizar arquivos de memória
- Caminho do workspace: ~/openclawd/
- Todos os arquivos de memória devem ser .md (markdown)

## Contexto de Memória Atual
${memoryContext || 'Nenhum arquivo de memória encontrado ainda. Comece a construir sua memória!'}

## Agendamento / Lembretes

Você tem ferramentas cron para agendar mensagens:
- \`mcp__cron__schedule_delayed\`: Lembrete único após atraso (em segundos)
- \`mcp__cron__schedule_recurring\`: Repetir em intervalo (em segundos)
- \`mcp__cron__schedule_cron\`: Expressão cron (minuto hora dia mês díasemana)
- \`mcp__cron__list_scheduled\`: Listar todos os jobs agendados
- \`mcp__cron__cancel_scheduled\`: Cancelar um job pelo ID

Quando o usuário disser "me lembre em X minutos/horas", use schedule_delayed.
Quando disser "todo dia às 9h", use schedule_cron com "0 9 * * *".

### Jobs Agendados Atualmente
${cronInfo || 'Nenhum job agendado'}

## Tratamento de Imagens

Quando o usuário enviar uma imagem, você a receberá no contexto. Você pode:
- Descrever o que vê na imagem
- Responder perguntas sobre a imagem
- Extrair texto de imagens (OCR)
- Analisar gráficos, diagramas, capturas de tela

## Estilo de Comunicação
- Seja prestativo e conversacional
- Mantenha respostas concisas para mensagens (evite paredes de texto)
- NÃO use formatação markdown (sem **, \`, #, -, etc.) — plataformas de mensagens não renderizam
- Use apenas texto simples — escreva naturalmente sem sintaxe de formatação
- Use emojis com moderação e adequadamente
- Lembre o contexto da conversa
- Use ferramentas proativamente quando necessário
- NÃO mencione detalhes de contas conectadas (emails, nomes de usuário, IDs de conta) a menos que explicitamente perguntado

## Ferramentas Disponíveis
Integradas: Read, Write, Edit, Bash, Glob, Grep, TodoWrite, Skill
Agendamento: mcp__cron__schedule_delayed, mcp__cron__schedule_recurring, mcp__cron__schedule_cron, mcp__cron__list_scheduled, mcp__cron__cancel_scheduled
Gateway: mcp__gateway__send_message, mcp__gateway__list_platforms, mcp__gateway__get_queue_status, mcp__gateway__get_current_context, mcp__gateway__list_sessions, mcp__gateway__broadcast_message
Composio: Acesso a 500+ integrações de apps (Gmail, Slack, GitHub, Google Sheets, etc.)

## Integrações de Apps via Composio

Use as ferramentas Composio para tudo — integrações de apps E tarefas no navegador.
Para tarefas envolvendo Gmail, Slack, GitHub, Google Sheets, Calendário, Notion, Trello, Jira e outros apps, SEMPRE use ferramentas MCP Composio.

## Importante
- O workspace em ~/openclawd/ é sua casa — use-o para armazenar arquivos e memória
- Sempre verifique a memória antes de pedir ao usuário informações que ele pode já ter fornecido
- Atualize a memória quando aprender novas informações persistentes sobre o usuário
- Quando o usuário pedir para ser lembrado, use as ferramentas de agendamento cron
`
}

export default class ClaudeAgent extends EventEmitter {
  constructor(config = {}) {
    super()
    this.memoryManager = new MemoryManager()
    this.cronMcpServer = createCronMcpServer()
    this.cronScheduler = getScheduler()
    this.gatewayMcpServer = createGatewayMcpServer()
    this.gateway = null
    this.sessions = new Map()
    this.abortControllers = new Map()

    this.providerName = config.provider || 'claude'
    const providerConfig = {
      allowedTools: config.allowedTools,
      maxTurns: config.maxTurns,
      permissionMode: config.permissionMode,
    }
    if (this.providerName === 'opencode') {
      Object.assign(providerConfig, config.opencode || {})
    }
    this.provider = getProvider(this.providerName, providerConfig)

    this.allowedTools = config.allowedTools || [
      'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'TodoWrite', 'Skill', 'AskUserQuestion'
    ]

    this.cronTools = [
      'mcp__cron__schedule_delayed', 'mcp__cron__schedule_recurring',
      'mcp__cron__schedule_cron', 'mcp__cron__list_scheduled', 'mcp__cron__cancel_scheduled'
    ]

    this.gatewayTools = [
      'mcp__gateway__send_message', 'mcp__gateway__list_platforms',
      'mcp__gateway__get_queue_status', 'mcp__gateway__get_current_context',
      'mcp__gateway__list_sessions', 'mcp__gateway__broadcast_message'
    ]

    this.applescriptMcpServer = createAppleScriptMcpServer()
    this.applescriptTools = this.applescriptMcpServer ? [
      'mcp__applescript__run_script', 'mcp__applescript__list_apps',
      'mcp__applescript__activate_app', 'mcp__applescript__display_notification'
    ] : []

    this.maxTurns = config.maxTurns || 50
    this.permissionMode = config.permissionMode || 'default'

    this.cronScheduler.on('execute', (data) => this.emit('cron:execute', data))
  }

  getSession(sessionKey) {
    if (!this.sessions.has(sessionKey)) {
      this.sessions.set(sessionKey, {
        sdkSessionId: null,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        messageCount: 0
      })
    }
    return this.sessions.get(sessionKey)
  }

  abort(sessionKey) {
    return this.provider.abort(sessionKey)
  }

  getCronSummary() {
    const jobs = this.cronScheduler.list()
    if (jobs.length === 0) return null
    return jobs.map(j => `- ${j.id}: ${j.description} (${j.type})`).join('\n')
  }

  buildPrompt(message, image) {
    if (!image) return message

    return [
      { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
      { type: 'text', text: message }
    ]
  }

  async *generateMessages(message, image) {
    yield {
      type: 'user',
      message: { role: 'user', content: this.buildPrompt(message, image) }
    }
  }

  async *run(params) {
    const {
      message, sessionKey, platform = 'unknown', chatId = null,
      image = null, mcpServers = {}, canUseTool
    } = params

    const session = this.getSession(sessionKey)
    session.lastActivity = Date.now()
    session.messageCount++

    setCronContext({ platform, chatId, sessionKey })
    setGatewayContext({ gateway: this.gateway, currentPlatform: platform, currentChatId: chatId, currentSessionKey: sessionKey })

    const memoryContext = this.memoryManager.getMemoryContext()
    const cronInfo = this.getCronSummary()
    const systemPrompt = buildSystemPrompt(memoryContext, { sessionKey, platform }, cronInfo, this.providerName)

    const allAllowedTools = [...this.allowedTools, ...this.cronTools, ...this.gatewayTools, ...this.applescriptTools]

    const allMcpServers = {
      cron: this.cronMcpServer,
      gateway: this.gatewayMcpServer,
      ...(this.applescriptMcpServer ? { applescript: this.applescriptMcpServer } : {}),
      ...mcpServers
    }

    if (image) console.log('[ClaudeAgent] Com anexo de imagem')

    this.emit('run:start', { sessionKey, message, hasImage: !!image })

    try {
      let fullText = ''
      let hasStreamedContent = false

      const queryParams = {
        prompt: this.generateMessages(message, image),
        chatId: sessionKey,
        mcpServers: allMcpServers,
        allowedTools: allAllowedTools,
        maxTurns: this.maxTurns,
        systemPrompt,
        permissionMode: this.permissionMode
      }
      if (canUseTool) queryParams.canUseTool = canUseTool

      for await (const chunk of this.provider.query(queryParams)) {
        if (chunk.type === 'stream_event' && chunk.event) {
          const event = chunk.event
          hasStreamedContent = true

          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const text = event.delta.text
            if (text) {
              fullText += text
              yield { type: 'text', content: text, isReasoning: !!event.isReasoning }
              this.emit('run:text', { sessionKey, content: text })
            }
          } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
            yield { type: 'tool_use', name: event.content_block.name, input: event.content_block.input || {}, id: event.content_block.id }
            this.emit('run:tool', { sessionKey, name: event.content_block.name })
          }
          continue
        }

        if (chunk.type === 'assistant' && chunk.message?.content) {
          for (const block of chunk.message.content) {
            if (block.type === 'text' && block.text && !hasStreamedContent) {
              fullText += block.text
              yield { type: 'text', content: block.text }
              this.emit('run:text', { sessionKey, content: block.text })
            } else if (block.type === 'tool_use' && !hasStreamedContent) {
              yield { type: 'tool_use', name: block.name, input: block.input, id: block.id }
              this.emit('run:tool', { sessionKey, name: block.name })
            }
          }
          continue
        }

        if (chunk.type === 'tool_result' || chunk.type === 'result') {
          yield { type: 'tool_result', result: chunk.result || chunk.content }
          continue
        }

        if (chunk.type === 'done') break
        if (chunk.type === 'aborted') {
          yield { type: 'aborted' }
          this.emit('run:aborted', { sessionKey })
          return
        }
        if (chunk.type === 'error') {
          yield { type: 'error', error: chunk.error }
          this.emit('run:error', { sessionKey, error: chunk.error })
          return
        }

        if (chunk.type !== 'system') yield chunk
      }

      yield { type: 'done', fullText }
      this.emit('run:complete', { sessionKey, response: fullText })
    } catch (error) {
      if (error.name === 'AbortError') {
        yield { type: 'aborted' }
        this.emit('run:aborted', { sessionKey })
      } else {
        console.error('[ClaudeAgent] Erro:', error)
        yield { type: 'error', error: error.message }
        this.emit('run:error', { sessionKey, error })
        throw error
      }
    }
  }

  async runAndCollect(params) {
    let fullText = ''
    for await (const chunk of this.run(params)) {
      if (chunk.type === 'text') fullText += chunk.content
      if (chunk.type === 'done') return chunk.fullText || fullText
      if (chunk.type === 'error') throw new Error(chunk.error)
    }
    return fullText
  }

  stopCron() {
    this.cronScheduler.stop()
  }
}
