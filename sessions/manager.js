import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TRANSCRIPTS_DIR = path.join(__dirname, '..', 'transcripts')

/**
 * Gerenciador de sessões com armazenamento de transcrição em JSONL
 */
export default class SessionManager {
  constructor() {
    this.sessions = new Map()
    this.ensureTranscriptsDir()
  }

  ensureTranscriptsDir() {
    if (!fs.existsSync(TRANSCRIPTS_DIR)) {
      fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true })
    }
  }

  getSession(key) {
    if (!this.sessions.has(key)) {
      this.sessions.set(key, {
        key,
        lastRunId: null,
        lastActivity: Date.now(),
        transcript: []
      })
    }
    const session = this.sessions.get(key)
    session.lastActivity = Date.now()
    return session
  }

  getTranscriptFilename(key) {
    const sanitized = key.replace(/[^a-zA-Z0-9_-]/g, '_')
    return path.join(TRANSCRIPTS_DIR, `${sanitized}.jsonl`)
  }

  appendTranscript(key, entry) {
    const session = this.getSession(key)
    const timestampedEntry = { ...entry, timestamp: entry.timestamp || Date.now() }
    session.transcript.push(timestampedEntry)

    const filename = this.getTranscriptFilename(key)
    const line = JSON.stringify(timestampedEntry) + '\n'
    fs.appendFileSync(filename, line, 'utf-8')
  }

  getTranscript(key, limit = 50) {
    const session = this.getSession(key)

    if (session.transcript.length === 0) {
      const filename = this.getTranscriptFilename(key)
      if (fs.existsSync(filename)) {
        try {
          const content = fs.readFileSync(filename, 'utf-8')
          const lines = content.trim().split('\n').filter(Boolean)
          session.transcript = lines.map(line => JSON.parse(line))
        } catch (err) {
          console.error(`Erro ao carregar transcrição para ${key}:`, err)
        }
      }
    }

    return session.transcript.slice(-limit)
  }

  setLastRunId(key, runId) {
    const session = this.getSession(key)
    session.lastRunId = runId
  }

  getLastRunId(key) {
    const session = this.getSession(key)
    return session.lastRunId
  }
}
