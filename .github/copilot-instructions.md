# Copilot Instructions for OpenClawD

## Project Overview

OpenClawD is a personal AI assistant that runs on WhatsApp, Telegram, Signal, and iMessage. It is powered by Claude (Anthropic) with persistent memory and 500+ app integrations via Composio.

## Tech Stack

- **Runtime**: Node.js ≥ 18 with ES Modules (`"type": "module"` in `package.json`)
- **AI**: `@anthropic-ai/claude-agent-sdk` (primary), `@opencode-ai/sdk` (alternative)
- **Messaging**: `@whiskeysockets/baileys` (WhatsApp), `node-telegram-bot-api` (Telegram)
- **Integrations**: `@composio/core` for 500+ third-party app connections
- **Deploy targets**: Vercel (serverless, Telegram-only) or Docker (full stack)

## Architecture

```
config.js           — central configuration (env vars, per-adapter toggles)
gateway.js          — entry point; instantiates and starts all enabled adapters
cli.js              — CLI interface (chat / setup commands)
adapters/           — one file per messaging platform (base.js + whatsapp, telegram, signal, imessage)
agent/
  claude-agent.js   — Claude agent with persistent memory, cron scheduling, system prompt
  runner.js         — message queue coordinator and execution controller
providers/          — AI provider abstraction (claude-provider.js, opencode-provider.js, index.js)
memory/manager.js   — reads/writes MEMORY.md files for long-term memory
tools/              — MCP-style tools: cron.js, gateway.js, applescript.js
commands/handler.js — slash-command handlers (/new, /status, /memory, /model, /queue, /stop, /help)
sessions/manager.js — per-user session tracking
api/                — Vercel serverless functions (telegram-webhook, status, setup-webhook)
```

## Coding Conventions

- **ES Modules**: use `import`/`export`; never `require()`.
- **Async/Await**: prefer `async/await` over raw Promises.
- **Error handling**: wrap async entry points in try/catch and log errors with context.
- **Environment variables**: read all secrets from `process.env`; document every new variable in `.env.example`.
- **No test framework is currently configured**: manual testing is done by running the CLI (`node cli.js chat`) or the gateway (`node gateway.js`).
- **Logging**: use `console.log` / `console.error` with a `[ComponentName]` prefix (e.g. `[WhatsApp]`, `[Agent]`).
- **Config changes**: always update `config.js` and `.env.example` together when adding a new feature that requires configuration.

## Key Environment Variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key (`sk-ant-…`) |
| `COMPOSIO_API_KEY` | Composio integrations key (`ak_…`) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_ALLOWED_DMS` | Comma-separated Telegram user IDs, or `*` for all |
| `WHATSAPP_ALLOWED_DMS` | Comma-separated phone numbers, or `*` for all |
| `WHATSAPP_ALLOWED_GROUPS` | Comma-separated group JIDs, or `*` for all |

## Adding a New Messaging Adapter

1. Create `adapters/<platform>.js` extending `adapters/base.js`.
2. Add the new adapter's config block in `config.js` (mirroring existing adapters).
3. Register the adapter in `gateway.js`.
4. Add the required env variables to `.env.example`.

## Adding a New Tool

1. Create `tools/<tool-name>.js` exporting a tool definition compatible with Claude Agent SDK.
2. Register the tool in `agent/claude-agent.js`.

## Deploy Notes

- **Vercel**: Telegram webhook only. Serverless functions live in `api/`. Entry-point config is in `vercel.json`.
- **Docker**: Full stack (WhatsApp + Telegram). Uses `Dockerfile` and `docker-compose.yml`. WhatsApp QR is exposed at `http://HOST:4096/qr`.
