import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { EventEmitter } from 'events'

const JOBS_FILE = path.join(os.homedir(), '.openclawd', 'cron-jobs.json')

class CronScheduler extends EventEmitter {
  constructor() {
    super()
    this.jobs = new Map()
    this.timers = new Map()
    this.ensureDir()
    this.loadJobs()
  }

  ensureDir() {
    const dir = path.dirname(JOBS_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  loadJobs() {
    try {
      if (fs.existsSync(JOBS_FILE)) {
        const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'))
        for (const job of data) {
          this.jobs.set(job.id, job)
          this.scheduleJob(job)
        }
        console.log(`[Cron] ${this.jobs.size} jobs carregados`)
      }
    } catch (err) {
      console.error('[Cron] Falha ao carregar jobs:', err.message)
    }
  }

  saveJobs() {
    try {
      const data = Array.from(this.jobs.values())
      fs.writeFileSync(JOBS_FILE, JSON.stringify(data, null, 2))
    } catch (err) {
      console.error('[Cron] Falha ao salvar jobs:', err.message)
    }
  }

  generateId() {
    return `cron_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  }

  scheduleDelayed(params) {
    const { platform, chatId, message, delaySeconds, description, sessionKey, invokeAgent } = params
    const id = this.generateId()
    const executeAt = Date.now() + (delaySeconds * 1000)

    const job = {
      id, type: 'delayed', platform, chatId, sessionKey, message, executeAt,
      description: description || `Enviar em ${delaySeconds}s`,
      invokeAgent: invokeAgent || false,
      createdAt: Date.now()
    }

    this.jobs.set(id, job)
    this.saveJobs()
    this.scheduleJob(job)
    return { success: true, jobId: id, executeAt: new Date(executeAt).toISOString() }
  }

  scheduleRecurring(params) {
    const { platform, chatId, message, intervalSeconds, description, sessionKey, invokeAgent } = params
    const id = this.generateId()

    const job = {
      id, type: 'recurring', platform, chatId, sessionKey, message,
      intervalMs: intervalSeconds * 1000,
      description: description || `A cada ${intervalSeconds}s`,
      invokeAgent: invokeAgent || false,
      createdAt: Date.now(), lastRun: null, runCount: 0
    }

    this.jobs.set(id, job)
    this.saveJobs()
    this.scheduleJob(job)
    return { success: true, jobId: id, intervalSeconds }
  }

  scheduleCron(params) {
    const { platform, chatId, message, cron, description, sessionKey, invokeAgent } = params
    const id = this.generateId()

    const job = {
      id, type: 'cron', platform, chatId, sessionKey, message, cron,
      description: description || `Cron: ${cron}`,
      invokeAgent: invokeAgent || false,
      createdAt: Date.now(), lastRun: null, runCount: 0
    }

    this.jobs.set(id, job)
    this.saveJobs()
    this.scheduleJob(job)
    return { success: true, jobId: id, cron, nextRun: this.getNextCronRun(cron)?.toISOString() }
  }

  list() {
    return Array.from(this.jobs.values()).map(job => ({
      id: job.id, type: job.type, platform: job.platform,
      description: job.description,
      createdAt: new Date(job.createdAt).toISOString(),
      lastRun: job.lastRun ? new Date(job.lastRun).toISOString() : null,
      runCount: job.runCount || 0,
      ...(job.type === 'delayed' && { executeAt: new Date(job.executeAt).toISOString() }),
      ...(job.type === 'recurring' && { intervalSeconds: job.intervalMs / 1000 }),
      ...(job.type === 'cron' && { cron: job.cron })
    }))
  }

  cancel(jobId) {
    const job = this.jobs.get(jobId)
    if (!job) return { success: false, error: 'Job não encontrado' }

    if (this.timers.has(jobId)) {
      clearTimeout(this.timers.get(jobId))
      clearInterval(this.timers.get(jobId))
      this.timers.delete(jobId)
    }

    this.jobs.delete(jobId)
    this.saveJobs()
    return { success: true, message: `Job ${jobId} cancelado` }
  }

  scheduleJob(job) {
    if (this.timers.has(job.id)) {
      clearTimeout(this.timers.get(job.id))
      clearInterval(this.timers.get(job.id))
    }

    if (job.type === 'delayed') {
      const delay = job.executeAt - Date.now()
      if (delay > 0) {
        this.timers.set(job.id, setTimeout(() => this.executeJob(job), delay))
      } else {
        this.executeJob(job)
      }
    } else if (job.type === 'recurring') {
      this.timers.set(job.id, setInterval(() => this.executeJob(job), job.intervalMs))
    } else if (job.type === 'cron') {
      this.scheduleCronRun(job)
    }
  }

  scheduleCronRun(job) {
    const nextRun = this.getNextCronRun(job.cron)
    if (!nextRun) return

    const delay = nextRun.getTime() - Date.now()
    if (delay > 0) {
      this.timers.set(job.id, setTimeout(() => {
        this.executeJob(job)
        this.scheduleCronRun(job)
      }, delay))
    }
  }

  getNextCronRun(cronExpr) {
    try {
      const parts = cronExpr.trim().split(/\s+/)
      if (parts.length !== 5) return null
      const [minute, hour] = parts
      const now = new Date()
      const next = new Date(now)
      next.setSeconds(0)
      next.setMilliseconds(0)
      next.setMinutes(minute === '*' ? now.getMinutes() : parseInt(minute))
      next.setHours(hour === '*' ? now.getHours() : parseInt(hour))
      if (next <= now) next.setDate(next.getDate() + 1)
      return next
    } catch {
      return null
    }
  }

  executeJob(job) {
    console.log(`[Cron] Executando job ${job.id}: ${job.description}`)
    job.lastRun = Date.now()
    job.runCount = (job.runCount || 0) + 1
    this.saveJobs()

    this.emit('execute', {
      jobId: job.id,
      platform: job.platform,
      chatId: job.chatId,
      sessionKey: job.sessionKey,
      message: job.message,
      invokeAgent: job.invokeAgent || false
    })

    if (job.type === 'delayed') this.cancel(job.id)
  }

  stop() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
      clearInterval(timer)
    }
    this.timers.clear()
  }
}

const scheduler = new CronScheduler()
let currentContext = { platform: 'unknown', chatId: null, sessionKey: null }

export function setContext(ctx) {
  currentContext = { ...currentContext, ...ctx }
}

export function getScheduler() {
  return scheduler
}

export function createCronMcpServer() {
  return createSdkMcpServer({
    name: 'cron',
    version: '1.0.0',
    tools: [
      tool(
        'schedule_delayed',
        'Agendar uma tarefa única após um atraso. Use para lembretes como "me lembre em 30 minutos". Set invoke_agent=true para o agente processar e responder.',
        {
          message: z.string().describe('Mensagem para enviar, ou tarefa para o agente se invoke_agent for true'),
          delay_seconds: z.number().positive().describe('Atraso em segundos antes de enviar'),
          description: z.string().optional().describe('Descrição legível do lembrete'),
          invoke_agent: z.boolean().optional().describe('Se true, o agente processa esta mensagem e responde.')
        },
        async (args) => {
          const result = scheduler.scheduleDelayed({
            platform: currentContext.platform,
            chatId: currentContext.chatId,
            sessionKey: currentContext.sessionKey,
            message: args.message,
            delaySeconds: args.delay_seconds,
            description: args.description,
            invokeAgent: args.invoke_agent
          })
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }
      ),
      tool(
        'schedule_recurring',
        'Agendar uma tarefa recorrente em intervalos regulares.',
        {
          message: z.string().describe('Mensagem para enviar'),
          interval_seconds: z.number().positive().describe('Intervalo em segundos entre execuções'),
          description: z.string().optional().describe('Descrição legível'),
          invoke_agent: z.boolean().optional().describe('Se true, o agente processa cada vez.')
        },
        async (args) => {
          const result = scheduler.scheduleRecurring({
            platform: currentContext.platform,
            chatId: currentContext.chatId,
            sessionKey: currentContext.sessionKey,
            message: args.message,
            intervalSeconds: args.interval_seconds,
            description: args.description,
            invokeAgent: args.invoke_agent
          })
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }
      ),
      tool(
        'schedule_cron',
        'Agendar com expressão cron. Formato: "minuto hora dia mês díasemana". Ex: "0 9 * * *" para 9h diário.',
        {
          message: z.string().describe('Mensagem para enviar'),
          cron: z.string().describe('Expressão cron: "minuto hora dia mês díasemana"'),
          description: z.string().optional().describe('Descrição legível'),
          invoke_agent: z.boolean().optional().describe('Se true, o agente processa cada vez.')
        },
        async (args) => {
          const result = scheduler.scheduleCron({
            platform: currentContext.platform,
            chatId: currentContext.chatId,
            sessionKey: currentContext.sessionKey,
            message: args.message,
            cron: args.cron,
            description: args.description,
            invokeAgent: args.invoke_agent
          })
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }
      ),
      tool(
        'list_scheduled',
        'Listar todos os jobs agendados (lembretes, recorrentes, cron).',
        {},
        async () => {
          const jobs = scheduler.list()
          return {
            content: [{
              type: 'text',
              text: jobs.length > 0 ? `Jobs agendados:\n${JSON.stringify(jobs, null, 2)}` : 'Nenhum job agendado'
            }]
          }
        }
      ),
      tool(
        'cancel_scheduled',
        'Cancelar um job agendado pelo ID.',
        { job_id: z.string().describe('O ID do job a cancelar') },
        async (args) => {
          const result = scheduler.cancel(args.job_id)
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }
      )
    ]
  })
}

export default { createCronMcpServer, setContext, getScheduler }
