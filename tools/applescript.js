import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

async function runOsascript(script) {
  try {
    const { stdout, stderr } = await execFileAsync('osascript', ['-e', script], { timeout: 30000 })
    return { success: true, output: stdout.trim(), stderr: stderr.trim() || undefined }
  } catch (err) {
    return { success: false, error: err.message, stderr: err.stderr?.trim() }
  }
}

/**
 * AppleScript MCP Server — ferramentas de automação macOS (somente macOS)
 */
export function createAppleScriptMcpServer() {
  if (process.platform !== 'darwin') {
    return null
  }

  console.log('[AppleScript] Ferramentas disponíveis')

  return createSdkMcpServer({
    name: 'applescript',
    version: '1.0.0',
    tools: [
      tool(
        'run_script',
        'Executar código AppleScript arbitrário via osascript. Para automação macOS.',
        { script: z.string().describe('O código AppleScript a executar') },
        async (args) => {
          const result = await runOsascript(args.script)
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }
      ),
      tool(
        'list_apps',
        'Listar aplicativos em execução no macOS.',
        {},
        async () => {
          const result = await runOsascript(
            'tell application "System Events" to get name of every process whose background only is false'
          )
          return {
            content: [{
              type: 'text',
              text: result.success ? `Apps em execução: ${result.output}` : `Erro: ${result.error}`
            }]
          }
        }
      ),
      tool(
        'activate_app',
        'Trazer um aplicativo macOS para o primeiro plano.',
        { app_name: z.string().describe('Nome do aplicativo (ex: "Safari", "Finder")') },
        async (args) => {
          const result = await runOsascript(`tell application "${args.app_name}" to activate`)
          return {
            content: [{
              type: 'text',
              text: result.success ? `${args.app_name} ativado` : `Erro: ${result.error}`
            }]
          }
        }
      ),
      tool(
        'display_notification',
        'Exibir uma notificação macOS.',
        {
          message: z.string().describe('Texto da notificação'),
          title: z.string().optional().describe('Título da notificação')
        },
        async (args) => {
          const titlePart = args.title ? ` with title "${args.title}"` : ''
          const result = await runOsascript(`display notification "${args.message}"${titlePart}`)
          return {
            content: [{
              type: 'text',
              text: result.success ? 'Notificação exibida' : `Erro: ${result.error}`
            }]
          }
        }
      )
    ]
  })
}

export default { createAppleScriptMcpServer }
