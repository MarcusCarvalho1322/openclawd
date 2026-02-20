import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import path from 'path'
import { fileURLToPath } from 'url'
import BaseAdapter from './base.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = path.join(__dirname, '..', 'auth_whatsapp')

/**
 * Adapter WhatsApp usando Baileys
 * Suporta mensagens de texto e imagem
 */
export default class WhatsAppAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
    this.sock = null
    this.myJid = null
    this.myLid = null
    this.jidMap = new Map()
    this.latestQr = null
    this.sentMessageIds = new Set()
    this.lidToPhone = new Map()
    this.phoneToLid = new Map()
    this.config.allowedDMs = this.config.allowedDMs.map(entry => {
      if (entry === '*') return entry
      if (entry.includes('@')) return entry
      return `${entry}@s.whatsapp.net`
    })
  }

  async start() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
    const { version } = await fetchLatestBaileysVersion()

    const logger = pino({ level: 'silent' })

    this.sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false
    })

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        this.latestQr = qr
        console.log('\n[WhatsApp] Escaneie o QR code para conectar:')
        qrcode.generate(qr, { small: true })
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        console.log(`[WhatsApp] Conexão encerrada. Status: ${statusCode}`)

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('[WhatsApp] Desconectado. Delete a pasta auth_whatsapp e reinicie.')
        } else if (this.myJid) {
          console.log('[WhatsApp] Reconectando...')
          this.start()
        } else {
          console.log('[WhatsApp] QR code expirou. Reinicie para tentar novamente.')
        }
      }

      if (connection === 'open') {
        this.latestQr = null
        this.myJid = this.sock.user?.id
        this.myLid = this.sock.user?.lid || null
        console.log(`[WhatsApp] Conectado como ${this.myJid} (LID: ${this.myLid})`)

        if (!this.config.allowedDMs.includes('*')) {
          if (this.myJid) {
            const selfJid = this.myJid.replace(/:.*@/, '@')
            if (!this.config.allowedDMs.includes(selfJid)) {
              this.config.allowedDMs.push(selfJid)
            }
          }
          if (this.myLid) {
            const selfLid = this.myLid.replace(/:.*@/, '@')
            if (!this.config.allowedDMs.includes(selfLid)) {
              this.config.allowedDMs.push(selfLid)
            }
          }
        }

        if (this.myJid && this.myLid) {
          this._mapContact(this.myJid, this.myLid)
        }

        this._resolveAllowlist()
      }
    })

    this.sock.ev.on('creds.update', saveCreds)

    const learnContacts = (contacts) => {
      let learned = 0
      for (const c of contacts) {
        if (c.id && c.lid) { this._mapContact(c.id, c.lid); learned++ }
      }
      if (learned) console.log(`[WhatsApp] Aprendidos ${learned} contatos`)
    }
    this.sock.ev.on('contacts.upsert', learnContacts)
    this.sock.ev.on('contacts.update', learnContacts)
    this.sock.ev.on('messaging-history.set', ({ contacts }) => {
      if (contacts?.length) learnContacts(contacts)
    })

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return
      for (const msg of messages) {
        await this.handleMessage(msg)
      }
    })

    console.log('[WhatsApp] Adapter iniciando...')
  }

  async stop() {
    if (this.sock) {
      this.sock.end()
      this.sock = null
    }
    console.log('[WhatsApp] Adapter parado')
  }

  async sendMessage(chatId, text) {
    if (!this.sock) {
      throw new Error('WhatsApp não conectado')
    }
    const targetJid = this.jidMap?.get(chatId) || chatId
    const sentMsg = await this.sock.sendMessage(targetJid, { text })
    if (sentMsg?.key?.id) {
      this.sentMessageIds.add(sentMsg.key.id)
      setTimeout(() => this.sentMessageIds.delete(sentMsg.key.id), 10000)
    }
  }

  async sendTyping(chatId) {
    if (!this.sock) return
    try {
      await this.sock.sendPresenceUpdate('composing', chatId)
    } catch (err) { }
  }

  async stopTyping(chatId) {
    if (!this.sock) return
    try {
      await this.sock.sendPresenceUpdate('paused', chatId)
    } catch (err) { }
  }

  async react(chatId, messageId, emoji) {
    if (!this.sock) return
    try {
      await this.sock.sendMessage(chatId, {
        react: { text: emoji, key: { remoteJid: chatId, id: messageId } }
      })
    } catch (err) { }
  }

  async downloadImage(msg) {
    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
        logger: pino({ level: 'silent' }),
        reuploadRequest: this.sock.updateMediaMessage
      })
      return buffer
    } catch (err) {
      console.error('[WhatsApp] Falha ao baixar imagem:', err.message)
      return null
    }
  }

  async _resolveAllowlist() {
    const phoneEntries = this.config.allowedDMs.filter(e => e.endsWith('@s.whatsapp.net'))
    if (!phoneEntries.length || this.config.allowedDMs.includes('*')) return

    for (const phoneJid of phoneEntries) {
      if (this.phoneToLid.has(phoneJid)) continue
      const num = phoneJid.replace('@s.whatsapp.net', '')
      try {
        const [result] = await this.sock.onWhatsApp(num)
        if (result?.lid) {
          const lid = result.lid.replace(/:.*@/, '@')
          this._mapContact(phoneJid, lid)
          if (!this.config.allowedDMs.includes(lid)) {
            this.config.allowedDMs.push(lid)
          }
        }
      } catch (err) {
        console.log(`[WhatsApp] Não foi possível resolver ${num}: ${err.message}`)
      }
    }
  }

  _mapContact(phoneJid, lidJid) {
    const phone = phoneJid.replace(/:.*@/, '@')
    const lid = lidJid.replace(/:.*@/, '@')
    this.lidToPhone.set(lid, phone)
    this.phoneToLid.set(phone, lid)
  }

  _isAllowedDM(chatId, allowedDMs) {
    if (allowedDMs.includes('*')) return true
    if (allowedDMs.includes(chatId)) return true
    const alt = this.lidToPhone.get(chatId) || this.phoneToLid.get(chatId)
    if (alt && allowedDMs.includes(alt)) return true
    return false
  }

  async handleMessage(msg) {
    if (msg.key.fromMe) {
      if (this.sentMessageIds.has(msg.key.id)) {
        this.sentMessageIds.delete(msg.key.id)
        return
      }
    }

    const jid = msg.key.remoteJid
    const isGroup = jid?.endsWith('@g.us')
    const sender = isGroup ? msg.key.participant : jid

    if (!isGroup) {
      if (!this._isAllowedDM(jid, this.config.allowedDMs)) return
    } else {
      if (this.config.allowedGroups.length === 0) return
      if (!this.config.allowedGroups.includes('*') && !this.config.allowedGroups.includes(jid)) return
    }

    let text = msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      ''

    const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
    const myNumber = this.myJid?.split('@')[0]?.split(':')[0]
    const myLidNumber = this.myLid?.split('@')[0]?.split(':')[0]
    const isMentioned = mentions.some(m => {
      const mBase = m.split('@')[0]?.split(':')[0]
      return (myNumber && mBase === myNumber) || (myLidNumber && mBase === myLidNumber)
    })

    if (isGroup && this.config.respondToMentionsOnly && !isMentioned) return

    let image = null
    if (msg.message?.imageMessage) {
      const buffer = await this.downloadImage(msg)
      if (buffer) {
        image = { data: buffer.toString('base64'), mediaType: 'image/jpeg' }
      }
      if (!text) text = '[Imagem]'
    }

    if (!text && !image) return

    this.emitMessage({
      chatId: jid,
      text,
      isGroup,
      sender,
      mentions: isMentioned ? ['self'] : mentions,
      image,
      raw: msg
    })
  }
}
