import fs from 'fs'
import path from 'path'
import os from 'os'

const WORKSPACE = process.env.OPENCLAWD_WORKSPACE || path.join(os.homedir(), 'openclawd')
const MEMORY_DIR = path.join(WORKSPACE, 'memory')

/**
 * Gerenciador de Memória do OpenClawD
 */
export default class MemoryManager {
  constructor() {
    this.workspace = WORKSPACE
    this.memoryDir = MEMORY_DIR
    this.ensureDirectories()
  }

  ensureDirectories() {
    if (!fs.existsSync(this.workspace)) {
      fs.mkdirSync(this.workspace, { recursive: true })
    }
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true })
    }
  }

  getToday() {
    return new Date().toISOString().split('T')[0]
  }

  getYesterday() {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  }

  getDailyPath(date) {
    return path.join(this.memoryDir, `${date}.md`)
  }

  getMemoryPath() {
    return path.join(this.workspace, 'MEMORY.md')
  }

  readFile(filepath) {
    try {
      if (fs.existsSync(filepath)) {
        return fs.readFileSync(filepath, 'utf-8')
      }
    } catch (err) {
      console.error(`[Memory] Falha ao ler ${filepath}:`, err.message)
    }
    return null
  }

  writeFile(filepath, content) {
    try {
      fs.writeFileSync(filepath, content, 'utf-8')
      return true
    } catch (err) {
      console.error(`[Memory] Falha ao escrever ${filepath}:`, err.message)
      return false
    }
  }

  appendFile(filepath, content) {
    try {
      fs.appendFileSync(filepath, content, 'utf-8')
      return true
    } catch (err) {
      console.error(`[Memory] Falha ao anexar em ${filepath}:`, err.message)
      return false
    }
  }

  readTodayMemory() {
    return this.readFile(this.getDailyPath(this.getToday()))
  }

  readYesterdayMemory() {
    return this.readFile(this.getDailyPath(this.getYesterday()))
  }

  readLongTermMemory() {
    return this.readFile(this.getMemoryPath())
  }

  appendToDailyMemory(content) {
    const filepath = this.getDailyPath(this.getToday())
    const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false })
    const entry = `\n## ${timestamp}\n${content}\n`
    return this.appendFile(filepath, entry)
  }

  appendToLongTermMemory(content) {
    const filepath = this.getMemoryPath()
    const timestamp = new Date().toISOString().split('T')[0]
    const entry = `\n## ${timestamp}\n${content}\n`
    return this.appendFile(filepath, entry)
  }

  getMemoryContext() {
    const parts = []

    const longTerm = this.readLongTermMemory()
    if (longTerm) {
      parts.push(`## Memória de Longo Prazo (MEMORY.md)\n${longTerm}`)
    }

    const yesterday = this.readYesterdayMemory()
    if (yesterday) {
      parts.push(`## Notas de Ontem (${this.getYesterday()})\n${yesterday}`)
    }

    const today = this.readTodayMemory()
    if (today) {
      parts.push(`## Notas de Hoje (${this.getToday()})\n${today}`)
    }

    return parts.join('\n\n---\n\n')
  }

  listDailyFiles() {
    try {
      return fs.readdirSync(this.memoryDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse()
    } catch (err) {
      return []
    }
  }

  searchMemory(query) {
    const results = []
    const queryLower = query.toLowerCase()

    const longTerm = this.readLongTermMemory()
    if (longTerm && longTerm.toLowerCase().includes(queryLower)) {
      results.push({
        file: 'MEMORY.md',
        matches: this.extractMatches(longTerm, query)
      })
    }

    for (const file of this.listDailyFiles().slice(0, 30)) {
      const content = this.readFile(path.join(this.memoryDir, file))
      if (content && content.toLowerCase().includes(queryLower)) {
        results.push({
          file: `memory/${file}`,
          matches: this.extractMatches(content, query)
        })
      }
    }

    return results
  }

  extractMatches(content, query) {
    const lines = content.split('\n')
    const queryLower = query.toLowerCase()
    const matches = []

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(queryLower)) {
        const start = Math.max(0, i - 1)
        const end = Math.min(lines.length, i + 2)
        matches.push({
          line: i + 1,
          context: lines.slice(start, end).join('\n')
        })
      }
    }

    return matches.slice(0, 5)
  }
}
