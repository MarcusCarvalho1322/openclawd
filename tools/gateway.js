import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

let gatewayContext = {
  gateway: null,
  currentPlatform: null,
  currentChatId: null,
  currentSessionKey: null
}

export function setGatewayContext(ctx) {
  gatewayContext = { ...gatewayContext, ...ctx }
}

export function getGatewayContext() {
  return gatewayContext
}

export function createGatewayMcpServer() {
  return createSdkMcpServer({
    name: 'gateway',
    version: '1.0.0',
    tools: [
      tool(
        'send_message',
        'Enviar uma mensagem para um chat específico em qualquer plataforma conectada.',
        {
          platform: z.enum(['whatsapp', 'imessage', 'telegram', 'signal']).describe('A plataforma de mensagens'),
          chat_id: z.string().describe('O ID do chat para enviar'),
          message: z.string().describe('O texto da mensagem')
        },
        async ({ platform, chat_id, message }) => {
          const { gateway } = gatewayContext
          if (!gateway) return { success: false, error: 'Gateway não disponível' }

          const adapter = gateway.adapters.get(platform)
          if (!adapter) return { success: false, error: `Plataforma ${platform} não conectada` }

          try {
            await adapter.sendMessage(chat_id, message)
            return { success: true, platform, chat_id, message_length: message.length }
          } catch (err) {
            return { success: false, error: err.message }
          }
        }
      ),
      tool(
        'list_platforms',
        'Listar todas as plataformas de mensagens conectadas e seus status',
        {},
        async () => {
          const { gateway } = gatewayContext
          if (!gateway) return { success: false, error: 'Gateway não disponível' }

          const platforms = []
          for (const [name, adapter] of gateway.adapters) {
            platforms.push({
              name,
              connected: !!adapter.sock || !!adapter.bot || !!adapter.process
            })
          }
          return { success: true, platforms }
        }
      ),
      tool(
        'get_queue_status',
        'Obter o status da fila para todas as sessões ou uma sessão específica',
        { session_key: z.string().optional().describe('Chave de sessão específica (opcional)') },
        async ({ session_key }) => {
          const { gateway } = gatewayContext
          if (!gateway) return { success: false, error: 'Gateway não disponível' }

          if (session_key) {
            const status = gateway.agentRunner.getQueueStatus(session_key)
            return { success: true, session: session_key, ...status }
          }

          const globalStats = gateway.agentRunner.getGlobalStats()
          return { success: true, ...globalStats }
        }
      ),
      tool(
        'get_current_context',
        'Obter informações sobre o contexto de conversa atual',
        {},
        async () => {
          const { currentPlatform, currentChatId, currentSessionKey } = gatewayContext
          return { success: true, platform: currentPlatform, chat_id: currentChatId, session_key: currentSessionKey }
        }
      ),
      tool(
        'list_sessions',
        'Listar todas as sessões ativas',
        {},
        async () => {
          const { gateway } = gatewayContext
          if (!gateway) return { success: false, error: 'Gateway não disponível' }

          const sessions = []
          for (const [key, data] of gateway.agentRunner.agent.sessions) {
            sessions.push({
              key,
              message_count: data.messageCount,
              last_activity: new Date(data.lastActivity).toISOString(),
              created: new Date(data.createdAt).toISOString()
            })
          }
          return { success: true, sessions, count: sessions.length }
        }
      ),
      tool(
        'broadcast_message',
        'Enviar uma mensagem para múltiplos chats. Use com cuidado.',
        {
          targets: z.array(z.object({
            platform: z.enum(['whatsapp', 'imessage', 'telegram', 'signal']),
            chat_id: z.string()
          })).describe('Array de destinos'),
          message: z.string().describe('A mensagem para transmitir')
        },
        async ({ targets, message }) => {
          const { gateway } = gatewayContext
          if (!gateway) return { success: false, error: 'Gateway não disponível' }

          const results = []
          for (const target of targets) {
            const adapter = gateway.adapters.get(target.platform)
            if (!adapter) {
              results.push({ ...target, success: false, error: 'Plataforma não conectada' })
              continue
            }
            try {
              await adapter.sendMessage(target.chat_id, message)
              results.push({ ...target, success: true })
            } catch (err) {
              results.push({ ...target, success: false, error: err.message })
            }
          }

          const successful = results.filter(r => r.success).length
          return { success: true, sent: successful, failed: results.length - successful, results }
        }
      )
    ]
  })
}
