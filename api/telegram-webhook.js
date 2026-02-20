/**
 * OpenClawD — Webhook do Telegram para Vercel
 *
 * Esta função serverless recebe mensagens do Telegram via webhook
 * e processa com o agente Claude.
 *
 * IMPORTANTE: Para usar no Vercel, você precisa registrar o webhook do Telegram:
 *   https://api.telegram.org/bot<SEU_TOKEN>/setWebhook?url=https://seu-projeto.vercel.app/api/telegram-webhook
 */

import 'dotenv/config'

// Cache do agente em memória (reutilizado entre invocações quentes)
let agentRunner = null
let sessionManager = null
let mcpServers = {}
let initialized = false

async function initialize() {
  if (initialized) return

  // Importações dinâmicas para compatibilidade com Vercel
  const { default: SessionManager } = await import('../sessions/manager.js')
  const { default: AgentRunner } = await import('../agent/runner.js')
  const { Composio } = await import('@composio/core')
  const config = (await import('../config.js')).default

  sessionManager = new SessionManager()
  agentRunner = new AgentRunner(sessionManager, {
    allowedTools: config.agent?.allowedTools || ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    maxTurns: config.agent?.maxTurns || 50,
    provider: config.agent?.provider || 'claude',
    permissionMode: 'bypassPermissions',
    opencode: config.agent?.opencode || {}
  })

  // Inicializar Composio
  try {
    const composio = new Composio()
    const session = await composio.create(config.agentId || 'openclawd')
    mcpServers.composio = {
      type: 'http',
      url: session.mcp.url,
      headers: session.mcp.headers
    }
    agentRunner.setMcpServers(mcpServers)
    console.log('[Vercel] Composio inicializado')
  } catch (err) {
    console.error('[Vercel] Composio falhou:', err.message)
  }

  initialized = true
  console.log('[Vercel] Agente inicializado')
}

async function sendTelegramMessage(token, chatId, text) {
  // Telegram tem limite de 4096 caracteres por mensagem
  const chunks = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= 4096) {
      chunks.push(remaining)
      break
    }
    let breakPoint = remaining.lastIndexOf('\n', 4096)
    if (breakPoint === -1 || breakPoint < 2048) breakPoint = remaining.lastIndexOf(' ', 4096)
    if (breakPoint === -1 || breakPoint < 2048) breakPoint = 4096
    chunks.push(remaining.substring(0, breakPoint))
    remaining = remaining.substring(breakPoint).trim()
  }

  for (const chunk of chunks) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk })
    })
  }
}

async function sendTyping(token, chatId) {
  const url = `https://api.telegram.org/bot${token}/sendChatAction`
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action: 'typing' })
  }).catch(() => { })
}

export default async function handler(req, res) {
  // Aceitar somente POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN não configurado' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada' })
  }

  let body = req.body
  if (!body) {
    return res.status(400).json({ error: 'Corpo da requisição vazio' })
  }

  const msg = body.message || body.channel_post
  if (!msg) {
    return res.status(200).json({ ok: true }) // Ignorar outros tipos de update
  }

  // Extrair informações da mensagem
  const chatId = msg.chat?.id?.toString()
  const text = msg.text || msg.caption || ''
  const isGroup = msg.chat?.type === 'group' || msg.chat?.type === 'supergroup'
  const sender = msg.from?.id?.toString() || chatId

  if (!chatId || !text) {
    return res.status(200).json({ ok: true })
  }

  // Verificar permissões
  const allowedDMs = (process.env.TELEGRAM_ALLOWED_DMS || '*').split(',').map(s => s.trim()).filter(Boolean)
  const allowedGroups = (process.env.TELEGRAM_ALLOWED_GROUPS || '*').split(',').map(s => s.trim()).filter(Boolean)

  if (isGroup) {
    if (allowedGroups.length > 0 && !allowedGroups.includes('*') && !allowedGroups.includes(chatId)) {
      return res.status(200).json({ ok: true })
    }
  } else {
    if (allowedDMs.length > 0 && !allowedDMs.includes('*') && !allowedDMs.includes(sender) && !allowedDMs.includes(chatId)) {
      return res.status(200).json({ ok: true })
    }
  }

  // Processar a mensagem e enviar resposta
  try {
    await initialize()
    await sendTyping(token, chatId)

    const config = (await import('../config.js')).default
    const agentId = config.agentId || 'openclawd'
    const type = isGroup ? 'group' : 'dm'
    const sessionKey = `agent:${agentId}:telegram:${type}:${chatId}`

    // Criar adapter virtual para Vercel
    const virtualAdapter = {
      sendMessage: async (id, responseText) => {
        await sendTelegramMessage(token, id, responseText)
      },
      sendTyping: async (id) => sendTyping(token, id),
      stopTyping: async () => { },
      generateSessionKey: () => sessionKey
    }

    const response = await agentRunner.enqueueRun(
      sessionKey,
      text,
      virtualAdapter,
      chatId,
      null
    )

    if (response && response.trim()) {
      await sendTelegramMessage(token, chatId, response)
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[Vercel] Erro ao processar mensagem:', err)
    try {
      await sendTelegramMessage(token, chatId, 'Desculpe, encontrei um erro. Por favor, tente novamente.')
    } catch (sendErr) {
      console.error('[Vercel] Falha ao enviar mensagem de erro:', sendErr)
    }
    return res.status(200).json({ ok: true })
  }
}
