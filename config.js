const parseList = (env) => env ? env.split(',').map(s => s.trim()).filter(Boolean) : []

export default {
  agentId: 'openclawd',

  whatsapp: {
    enabled: true,
    allowedDMs: parseList(process.env.WHATSAPP_ALLOWED_DMS),       // números de telefone, ou '*' para todos
    allowedGroups: parseList(process.env.WHATSAPP_ALLOWED_GROUPS),  // JIDs de grupos
    respondToMentionsOnly: true
  },

  imessage: {
    enabled: false,
    allowedDMs: parseList(process.env.IMESSAGE_ALLOWED_DMS),
    allowedGroups: parseList(process.env.IMESSAGE_ALLOWED_GROUPS),
    respondToMentionsOnly: true
  },

  telegram: {
    enabled: !!(process.env.TELEGRAM_BOT_TOKEN),
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    allowedDMs: parseList(process.env.TELEGRAM_ALLOWED_DMS),
    allowedGroups: parseList(process.env.TELEGRAM_ALLOWED_GROUPS),
    respondToMentionsOnly: true
  },

  signal: {
    enabled: false,
    phoneNumber: process.env.SIGNAL_PHONE_NUMBER || '',
    signalCliPath: 'signal-cli',
    allowedDMs: parseList(process.env.SIGNAL_ALLOWED_DMS),
    allowedGroups: parseList(process.env.SIGNAL_ALLOWED_GROUPS),
    respondToMentionsOnly: true
  },

  // Configuração do agente
  agent: {
    workspace: '~/openclawd',
    maxTurns: 100,
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    provider: 'claude',
    opencode: {
      model: 'opencode/gpt-5-nano',
      hostname: '127.0.0.1',
      port: 4097
    }
  }
}
