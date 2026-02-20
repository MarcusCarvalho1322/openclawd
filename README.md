# OpenClawD — Assistente de IA Pessoal 24x7

Assistente de IA pessoal que funciona no WhatsApp, Telegram e outras plataformas de mensagens. Powered by Claude (Anthropic) com acesso a 500+ integrações de apps via Composio.

**Funcionalidades:**
- 🤖 **Claude AI** com memória persistente entre conversas
- 📱 **WhatsApp** e **Telegram** (e Signal, iMessage)
- 🔧 **500+ integrações** (Gmail, Slack, GitHub, Google Sheets, Notion, etc.)
- ⏰ **Lembretes e agendamentos** (cron)
- 🧠 **Memória de longo prazo** (MEMORY.md)
- 🖼️ **Análise de imagens** (envie uma foto e pergunte)
- ⚡ **Deploy no Vercel** (Telegram) ou **Docker** (WhatsApp + tudo)

---

## Índice

- [Pré-requisitos](#pré-requisitos)
- [Deploy no Vercel (Telegram)](#deploy-no-vercel-telegram)
- [Deploy com Docker (WhatsApp + Telegram)](#deploy-com-docker-whatsapp--telegram)
- [Configuração das Chaves de API](#configuração-das-chaves-de-api)
- [Comandos no Chat](#comandos-no-chat)
- [Integrações de Apps](#integrações-de-apps)
- [Solução de Problemas](#solução-de-problemas)

---

## Pré-requisitos

Você precisará de:

1. **Chave da API Anthropic** (para o Claude) — gratuito para começar
2. **Chave da API Composio** — gratuita, para 500+ integrações
3. **Token do bot Telegram** — gratuito, via @BotFather
4. **Conta Vercel** ou **servidor com Docker** para deploy

---

## Configuração das Chaves de API

### 1. Chave Anthropic (Claude)

1. Acesse [console.anthropic.com](https://console.anthropic.com/)
2. Crie uma conta ou faça login
3. Vá em **API Keys** → **Create Key**
4. Copie a chave (começa com `sk-ant-...`)

### 2. Chave Composio (500+ integrações)

1. Acesse [composio.dev](https://composio.dev/)
2. Crie uma conta gratuita
3. No painel, copie sua **API Key** (começa com `ak_...`)

### 3. Token do Bot Telegram

1. Abra o Telegram e procure por **@BotFather**
2. Envie `/newbot`
3. Escolha um nome para o bot (ex: "Meu Assistente IA")
4. Escolha um username (ex: `meu_assistente_bot`)
5. Copie o **token** que aparecer (formato: `123456789:ABCdef...`)

---

## Deploy no Vercel (Telegram)

> **Melhor para:** usar com Telegram. Grátis, sem servidor. Deploy em 2 minutos.
>
> **Limitação:** WhatsApp **não funciona** no Vercel (requer conexão persistente). Para WhatsApp, use o Docker.

### Passo a Passo

**1. Fork ou clone este repositório no GitHub**

Se você ainda não tem o repositório no seu GitHub:
- Acesse `https://github.com/MarcusCarvalho1322/openclawd`
- Clique em **Fork** (canto superior direito)

**2. Acesse o Vercel**

1. Vá para [vercel.com](https://vercel.com/)
2. Faça login com sua conta GitHub
3. Clique em **Add New... → Project**
4. Selecione o repositório `openclawd`
5. Clique em **Import**

**3. Configure as variáveis de ambiente**

Na tela de configuração do projeto, clique em **Environment Variables** e adicione:

| Nome | Valor | Descrição |
|------|-------|-----------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Sua chave Anthropic |
| `COMPOSIO_API_KEY` | `ak_...` | Sua chave Composio |
| `TELEGRAM_BOT_TOKEN` | `123456:ABC...` | Token do seu bot |
| `TELEGRAM_ALLOWED_DMS` | `*` | `*` para todos, ou seu ID do Telegram |

Para descobrir seu ID do Telegram: envie uma mensagem para [@userinfobot](https://t.me/userinfobot) no Telegram.

**4. Deploy**

Clique em **Deploy** e aguarde (leva ~2 minutos).

**5. Registre o Webhook do Telegram**

Após o deploy, você terá uma URL como `https://seu-projeto.vercel.app`.

**Opção fácil:** Acesse `https://seu-projeto.vercel.app/api/setup-webhook` no navegador — ele vai gerar a URL de registro automaticamente para você copiar e colar.

**Ou manualmente:** Acesse no navegador:
```
https://api.telegram.org/bot<SEU_TOKEN>/setWebhook?url=https://seu-projeto.vercel.app/api/telegram-webhook
```

Substitua `<SEU_TOKEN>` pelo token do seu bot e `seu-projeto` pela URL do seu projeto Vercel.

Você deverá ver: `{"ok":true,"result":true,"description":"Webhook was set"}`

**6. Teste**

Abra o Telegram, procure seu bot pelo username e envie uma mensagem. 🎉

---

## Deploy com Docker (WhatsApp + Telegram)

> **Melhor para:** uso completo com WhatsApp. Requer um servidor Linux ou computador sempre ligado.
>
> **Opções baratas de servidor:** DigitalOcean ($6/mês), Hetzner (€3/mês), Vultr ($6/mês)

### Passo a Passo (DigitalOcean como exemplo)

**1. Crie um servidor**

1. Acesse [digitalocean.com](https://www.digitalocean.com/) e crie uma conta
2. Clique em **Create → Droplets**
3. Selecione **Ubuntu 24.04**
4. Escolha o plano de **$6/mês** (1 GB RAM)
5. Defina uma senha root
6. Clique em **Create Droplet**
7. Copie o **IP público** do painel

**2. Conecte-se ao servidor**

No terminal do seu computador (ou use [PuTTY](https://www.putty.org/) no Windows):

```bash
ssh root@SEU_IP_AQUI
```

**3. Configure o servidor**

```bash
# Adicionar memória swap (necessário para o build)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Instalar Docker
curl -fsSL https://get.docker.com | sh

# Clonar este repositório
git clone https://github.com/MarcusCarvalho1322/openclawd.git
cd openclawd
```

**4. Configure as variáveis**

```bash
cp .env.example .env
nano .env
```

Preencha os valores:
```
ANTHROPIC_API_KEY=sk-ant-SUA_CHAVE
COMPOSIO_API_KEY=ak_SUA_CHAVE
TELEGRAM_BOT_TOKEN=SEU_TOKEN
TELEGRAM_ALLOWED_DMS=*
WHATSAPP_ALLOWED_DMS=+5511999999999
WHATSAPP_ALLOWED_GROUPS=*
```

Salve com **Ctrl+O**, saia com **Ctrl+X**.

**5. Inicie o serviço**

```bash
docker compose up -d --build
ufw allow 4096
```

O build pode demorar 5-10 minutos na primeira vez.

**6. Conecte o WhatsApp**

Abra no navegador: `http://SEU_IP:4096/qr`

Escaneie o QR code com o WhatsApp:
- No celular: WhatsApp → ⋮ → Aparelhos conectados → Conectar aparelho

**7. Verifique se está funcionando**

```bash
docker compose logs -f
```

Você deverá ver `[Gateway] Pronto e aguardando mensagens`.

### Comandos úteis

```bash
docker compose logs -f                    # Ver logs em tempo real
docker compose down && docker compose up -d  # Reiniciar
docker compose up -d --build              # Atualizar após mudanças
```

---

## Comandos no Chat

Você pode enviar esses comandos diretamente no WhatsApp ou Telegram:

| Comando | Descrição |
|---------|-----------|
| `/new` ou `/reset` | Iniciar nova conversa |
| `/status` | Ver informações da sessão |
| `/memory` | Ver resumo da memória |
| `/memory list` | Listar arquivos de memória |
| `/memory search <termo>` | Buscar na memória |
| `/model` | Trocar modelo de IA |
| `/queue` | Ver fila de mensagens |
| `/stop` | Parar operação atual |
| `/help` | Mostrar todos os comandos |

---

## Integrações de Apps

O OpenClawD se conecta a mais de 500 apps via Composio. Basta pedir:

- **"Envie um email para joao@exemplo.com"** — usa o Gmail
- **"Crie uma issue no GitHub para o bug de login"** — usa o GitHub
- **"Adicione um evento no meu calendário amanhã às 15h"** — usa o Google Calendar
- **"Mostre minhas mensagens não lidas no Slack"** — usa o Slack
- **"Crie uma nota no Notion"** — usa o Notion

Na primeira vez que usar um app, o assistente vai enviar um link para você autorizar. Após autorizar, o assistente pode usar aquele app automaticamente.

---

## Lembretes e Agendamentos

O assistente pode criar lembretes automaticamente:

- **"Me lembre em 30 minutos de ligar para o médico"**
- **"Todos os dias às 9h, me mande um lembrete de beber água"**
- **"Toda segunda-feira às 8h, me mande um resumo das tarefas"**

---

## Memória Persistente

O assistente lembra de informações entre conversas:

- **"Lembre que meu carro é vermelho"** — salva na memória
- **"Qual é a cor do meu carro?"** — lembra automaticamente
- **"Minha senha do WiFi é 12345"** — salva para quando precisar

---

## Solução de Problemas

**"ANTHROPIC_API_KEY não configurada"**
→ Verifique se a chave está nas variáveis de ambiente (Vercel) ou no arquivo `.env` (Docker)

**"Bot do Telegram não responde"**
→ Verifique se o webhook foi registrado corretamente. Acesse: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

**"WhatsApp QR não aparece"**
→ Delete a pasta `auth_whatsapp/` e reinicie: `docker compose restart`

**"Composio não funciona"**
→ Certifique-se que `COMPOSIO_API_KEY` está configurada. Acesse [composio.dev](https://composio.dev/) para obter/confirmar sua chave.

**"Build Docker demorou muito ou falhou"**
→ Adicione memória swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`

**"Não consigo acessar http://IP:4096"**
→ Execute: `ufw allow 4096`

---

## Estrutura do Projeto

```
openclawd/
  config.js              configuração principal
  gateway.js             gateway de mensagens
  cli.js                 interface de linha de comando
  Dockerfile             build para Docker
  docker-compose.yml     orquestração Docker
  vercel.json            configuração Vercel
  adapters/
    base.js              classe base dos adapters
    whatsapp.js          WhatsApp via Baileys
    telegram.js          Telegram via bot API
    signal.js            Signal via signal-cli
    imessage.js          iMessage via imsg (macOS)
  agent/
    claude-agent.js      agente com memória, cron, system prompt
    runner.js            coordenador de fila e execução
  providers/
    claude-provider.js   provider Claude Agent SDK
    opencode-provider.js provider Opencode
    index.js             registro de providers
  memory/
    manager.js           gerenciamento de arquivos de memória
  tools/
    cron.js              ferramentas de agendamento
    gateway.js           ferramentas MCP do gateway
    applescript.js       automação macOS (opcional)
  commands/
    handler.js           handlers de comandos de barra
  sessions/
    manager.js           rastreamento de sessões
  api/                   funções serverless para Vercel
    telegram-webhook.js  recebe mensagens do Telegram
    status.js            verificação de saúde
    setup-webhook.js     helper para configurar webhook
```

---

## Licença

MIT
