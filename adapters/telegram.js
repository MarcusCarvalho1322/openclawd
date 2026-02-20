import TelegramBot from 'node-telegram-bot-api'
import BaseAdapter from './base.js'

/**
 * Adapter Telegram usando node-telegram-bot-api
 * Suporta mensagens de texto e imagem
 */
export default class TelegramAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
    this.bot = null
    this.botInfo = null
  }

  async start() {
    if (!this.config.token) {
      throw new Error('Token do bot Telegram é obrigatório. Obtenha com @BotFather')
    }

    this.bot = new TelegramBot(this.config.token, { polling: true })
    this.botInfo = await this.bot.getMe()
    console.log(`[Telegram] Conectado como @${this.botInfo.username}`)

    this.bot.on('message', async (msg) => {
      await this.handleMessage(msg)
    })

    this.bot.on('polling_error', (err) => {
      console.error('[Telegram] Erro de polling:', err.message)
    })

    console.log('[Telegram] Adapter iniciado')
  }

  async stop() {
    if (this.bot) {
      await this.bot.stopPolling()
      this.bot = null
    }
    console.log('[Telegram] Adapter parado')
  }

  async sendMessage(chatId, text) {
    if (!this.bot) {
      throw new Error('Telegram não conectado')
    }

    if (text.length > 4096) {
      const chunks = this.splitMessage(text, 4096)
      for (const chunk of chunks) {
        await this.bot.sendMessage(chatId, chunk)
      }
    } else {
      await this.bot.sendMessage(chatId, text)
    }
  }

  splitMessage(text, maxLength) {
    const chunks = []
    let remaining = text
    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining)
        break
      }
      let breakPoint = remaining.lastIndexOf('\n', maxLength)
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf(' ', maxLength)
      }
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = maxLength
      }
      chunks.push(remaining.substring(0, breakPoint))
      remaining = remaining.substring(breakPoint).trim()
    }
    return chunks
  }

  async sendTyping(chatId) {
    if (!this.bot) return
    try {
      await this.bot.sendChatAction(chatId, 'typing')
    } catch (err) { }
  }

  async handleMessage(msg) {
    if (!msg.text && !msg.photo && !msg.caption) return

    const chatId = msg.chat.id.toString()
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup'
    const sender = msg.from?.id?.toString() || chatId
    let text = msg.text || msg.caption || ''

    let image = null
    if (msg.photo && msg.photo.length > 0) {
      const photo = msg.photo[msg.photo.length - 1]
      try {
        const fileLink = await this.bot.getFileLink(photo.file_id)
        const response = await fetch(fileLink)
        const buffer = Buffer.from(await response.arrayBuffer())
        image = { data: buffer.toString('base64'), mediaType: 'image/jpeg' }
        if (!text) text = '[Imagem]'
      } catch (err) {
        console.error('[Telegram] Falha ao baixar imagem:', err.message)
      }
    }

    if (!text && !image) return

    const botMentioned = text.includes(`@${this.botInfo.username}`)
    if (botMentioned) {
      text = text.replace(`@${this.botInfo.username}`, '').trim()
    }

    const message = {
      chatId,
      text,
      isGroup,
      sender,
      mentions: botMentioned ? ['self'] : [],
      image,
      raw: msg
    }

    if (!this.shouldRespond(message, this.config)) return

    this.emitMessage(message)
  }
}
