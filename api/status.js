/**
 * OpenClawD — Endpoint de status para Vercel
 */
export default async function handler(req, res) {
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY
  const hasComposioKey = !!process.env.COMPOSIO_API_KEY
  const hasTelegramToken = !!process.env.TELEGRAM_BOT_TOKEN

  const status = {
    status: 'ok',
    service: 'OpenClawD',
    version: '1.0.0',
    platform: 'vercel',
    timestamp: new Date().toISOString(),
    config: {
      anthropic: hasAnthropicKey ? '✅ configurado' : '❌ ANTHROPIC_API_KEY faltando',
      composio: hasComposioKey ? '✅ configurado' : '⚠️ COMPOSIO_API_KEY faltando (integrações de apps desativadas)',
      telegram: hasTelegramToken ? '✅ configurado' : '❌ TELEGRAM_BOT_TOKEN faltando'
    },
    features: {
      telegram_webhook: hasTelegramToken && hasAnthropicKey ? 'ativo' : 'inativo',
      whatsapp: 'requer Docker (conexão WebSocket persistente)',
      memory: 'ativo (em memória — use Docker para persistência)',
      composio_integrations: hasComposioKey ? 'ativo (500+ apps)' : 'inativo',
      scheduling: 'ativo (em memória)',
    },
    docs: 'https://github.com/MarcusCarvalho1322/openclawd'
  }

  res.status(200).json(status)
}
