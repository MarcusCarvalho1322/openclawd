/**
 * OpenClawD — Informações de configuração do webhook Telegram para Vercel
 */
export default async function handler(req, res) {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : `https://seu-projeto.vercel.app`

  const token = process.env.TELEGRAM_BOT_TOKEN

  if (!token) {
    return res.status(200).json({
      error: 'TELEGRAM_BOT_TOKEN não configurado',
      instrucoes: 'Adicione TELEGRAM_BOT_TOKEN nas variáveis de ambiente do Vercel'
    })
  }

  const webhookUrl = `${baseUrl}/api/telegram-webhook`
  const setWebhookUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`

  res.status(200).json({
    webhook_url: webhookUrl,
    instrucoes: [
      '1. Acesse a URL abaixo para registrar o webhook:',
      setWebhookUrl,
      '',
      '2. Ou use curl:',
      `curl "${setWebhookUrl}"`,
      '',
      '3. Para verificar se está ativo:',
      `https://api.telegram.org/bot${token}/getWebhookInfo`
    ].join('\n')
  })
}
