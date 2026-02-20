import { spawn, execFile } from 'child_process'
import path from 'path'
import os from 'os'
import BaseAdapter from './base.js'

const IMSG_PATH = process.env.IMSG_PATH || path.join(os.homedir(), 'bin', 'imsg')

/**
 * Adapter iMessage usando imsg CLI (somente macOS)
 */
export default class iMessageAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
    this.watchProcess = null
    this.buffer = ''
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.watchProcess = spawn(IMSG_PATH, ['watch', '--json'], {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      this.watchProcess.on('error', (err) => {
        console.error('[iMessage] Falha ao iniciar imsg watch:', err.message)
        reject(err)
      })

      this.watchProcess.on('close', (code) => {
        console.log(`[iMessage] Processo watch encerrado com código ${code}`)
        this.watchProcess = null
      })

      this.watchProcess.stdout.on('data', (data) => {
        this.handleData(data.toString())
      })

      this.watchProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim()
        if (msg) console.error('[iMessage] stderr:', msg)
      })

      setTimeout(() => {
        if (this.watchProcess && !this.watchProcess.killed) {
          console.log('[iMessage] Adapter iniciado')
          resolve()
        }
      }, 1000)
    })
  }

  async stop() {
    if (this.watchProcess) {
      this.watchProcess.kill()
      this.watchProcess = null
    }
    console.log('[iMessage] Adapter parado')
  }

  handleData(data) {
    this.buffer += data
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop()
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const json = JSON.parse(line)
        this.handleMessage(json)
      } catch (err) { }
    }
  }

  handleMessage(msg) {
    if (msg.is_from_me) return

    const chatId = msg.chat_id?.toString() || msg.chat_identifier
    const text = msg.text
    const sender = msg.sender || msg.handle_id

    if (!chatId || !text) return

    const isGroup = msg.chat_identifier?.includes(',') || msg.participants?.length > 2
    const message = {
      chatId, text,
      isGroup: Boolean(isGroup),
      sender, mentions: [], raw: msg
    }

    if (!this.shouldRespond(message, this.config)) return
    this.emitMessage(message)
  }

  async sendMessage(chatId, text) {
    return new Promise((resolve, reject) => {
      execFile(IMSG_PATH, ['send', '--chat-id', chatId.toString(), '--text', text], (error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }
}
