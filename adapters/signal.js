import { spawn } from 'child_process'
import { createInterface } from 'readline'
import BaseAdapter from './base.js'

/**
 * Adapter Signal usando signal-cli
 * Requer signal-cli instalado e configurado
 */
export default class SignalAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
    this.process = null
    this.phoneNumber = config.phoneNumber
    this.signalCliPath = config.signalCliPath || 'signal-cli'
  }

  async start() {
    if (!this.phoneNumber) {
      throw new Error('Número de telefone Signal é obrigatório na config')
    }

    console.log('[Signal] Iniciando daemon signal-cli...')

    this.process = spawn(this.signalCliPath, [
      '-u', this.phoneNumber,
      'jsonRpc'
    ], { stdio: ['pipe', 'pipe', 'pipe'] })

    const rl = createInterface({ input: this.process.stdout })

    rl.on('line', async (line) => {
      try {
        const data = JSON.parse(line)
        if (data.method === 'receive') {
          await this.handleMessage(data.params)
        }
      } catch (err) { }
    })

    this.process.stderr.on('data', (data) => {
      const msg = data.toString().trim()
      if (msg && !msg.includes('DEBUG')) {
        console.error('[Signal]', msg)
      }
    })

    this.process.on('error', (err) => {
      console.error('[Signal] Erro no processo:', err.message)
    })

    this.process.on('close', (code) => {
      console.log('[Signal] Processo encerrado com código:', code)
      this.process = null
    })

    console.log(`[Signal] Conectado como ${this.phoneNumber}`)
  }

  async stop() {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    console.log('[Signal] Adapter parado')
  }

  async sendMessage(chatId, text) {
    return new Promise((resolve, reject) => {
      const isGroup = chatId.startsWith('group.')
      const args = ['-u', this.phoneNumber, 'send', '-m', text]
      if (isGroup) {
        args.push('-g', chatId.replace('group.', ''))
      } else {
        args.push(chatId)
      }

      const proc = spawn(this.signalCliPath, args)
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`signal-cli saiu com código ${code}`))
      })
      proc.on('error', reject)
    })
  }

  async handleMessage(params) {
    const envelope = params?.envelope
    if (!envelope) return
    if (envelope.source === this.phoneNumber) return

    const dataMessage = envelope.dataMessage
    if (!dataMessage) return

    const text = dataMessage.message || ''
    if (!text) return

    const isGroup = !!dataMessage.groupInfo
    const chatId = isGroup
      ? `group.${dataMessage.groupInfo.groupId}`
      : envelope.source
    const sender = envelope.source
    const mentions = dataMessage.mentions || []
    const isMentioned = mentions.some(m => m.number === this.phoneNumber)

    const message = {
      chatId, text, isGroup, sender,
      mentions: isMentioned ? ['self'] : [],
      image: null,
      raw: envelope
    }

    if (!this.shouldRespond(message, this.config)) return
    this.emitMessage(message)
  }
}
