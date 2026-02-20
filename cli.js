#!/usr/bin/env node

/**
 * OpenClawD CLI — Interface de linha de comando
 */

import 'dotenv/config'

const command = process.argv[2]

switch (command) {
  case 'start':
  case 'gateway':
    await import('./gateway.js')
    break

  case 'chat':
    console.error('Chat terminal não está disponível no deploy Vercel.')
    console.error('Para chat terminal, use: npm install && node cli.js chat (localmente com Node.js 18+)')
    process.exit(1)
    break

  case 'setup':
    console.log('\n🔧 Configuração do OpenClawD\n')
    console.log('Variáveis de ambiente necessárias:')
    console.log('  ANTHROPIC_API_KEY   — Chave da API Anthropic (https://console.anthropic.com/)')
    console.log('  COMPOSIO_API_KEY    — Chave da API Composio (https://composio.dev/)')
    console.log('  TELEGRAM_BOT_TOKEN  — Token do bot Telegram (via @BotFather)')
    console.log('  WHATSAPP_ALLOWED_DMS — Número(s) WhatsApp permitidos, ex: +5511999999999')
    console.log('\nCopie o arquivo .env.example para .env e preencha:')
    console.log('  cp .env.example .env')
    console.log('  nano .env')
    break

  case 'config':
    const config = (await import('./config.js')).default
    console.log('\n📋 Configuração atual:\n')
    console.log(JSON.stringify(config, null, 2))
    break

  case 'help':
  default:
    console.log('\n🤖 OpenClawD — Assistente de IA pessoal 24x7\n')
    console.log('Uso: node cli.js <comando>\n')
    console.log('Comandos:')
    console.log('  start    — Iniciar o gateway de mensagens')
    console.log('  setup    — Mostrar instruções de configuração')
    console.log('  config   — Mostrar configuração atual')
    console.log('  help     — Mostrar esta ajuda\n')
    console.log('Para deploy no Vercel:')
    console.log('  vercel deploy\n')
    console.log('Para deploy com Docker:')
    console.log('  docker compose up -d --build\n')
    break
}
