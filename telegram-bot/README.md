# 🤖 Taiba Telegram Bot (Claude)

A small Telegram bot that bridges Telegram to the **Claude API**. Messages sent to
your bot are forwarded to Claude, and Claude's replies are sent back — with
per-chat conversation memory.

```
User on Telegram  ──▶  this bot  ──▶  Claude API (Anthropic)
                  ◀──            ◀──
```

## 🚀 Setup

**1. Create a Telegram bot**

Open [@BotFather](https://t.me/BotFather) in Telegram, send `/newbot`, follow the
prompts, and copy the **bot token** it gives you.

**2. Get a Claude API key**

Sign up at [console.anthropic.com](https://console.anthropic.com) and create an
**API key**.

**3. Configure & run**

```bash
cd telegram-bot
npm install
cp .env.example .env      # then paste your two keys into .env
npm start
```

Now open your bot in Telegram and send it a message.

## ⚙️ Configuration

All settings live in `.env` (see `.env.example`):

| Variable             | Required | Description                                  |
| -------------------- | -------- | -------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | ✅       | Token from @BotFather                        |
| `ANTHROPIC_API_KEY`  | ✅       | Key from the Anthropic console               |
| `CLAUDE_MODEL`       | —        | `claude-sonnet-5` (default) or `claude-opus-4-8` |
| `MAX_TOKENS`         | —        | Max tokens per reply (default `1024`)        |

## 💬 Commands

- `/start` — greeting + help
- `/reset` — clear the conversation history for the current chat

## 📝 Notes for production

This is a starter. Before deploying seriously, consider:

- **Webhooks instead of long polling** — `bot.launch({ webhook: { domain, port } })`
  scales better than the default polling used here.
- **Persistent history** — conversation memory is kept in memory and is lost on
  restart. Use Redis or a database for real persistence.
- **Rate limiting / auth** — restrict who can use the bot and throttle requests.
- **Streaming** — for long answers you can stream tokens with
  `claude.messages.stream(...)` and edit the Telegram message as it grows.

## 🧪 Tech

Node.js · [Telegraf](https://telegraf.js.org) · [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk)
