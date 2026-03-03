# marketing99laju-telegram-bot

Starter Telegram bot for marketing experiments, ready for Coolify deployment.

## Features
- Express health endpoint (`/health`)
- Telegram bot via Telegraf
- Basic commands: `/start`, `/help`, `/idea`, `/angle`, `/health`

## Environment Variables
- `BOT_TOKEN` (required for Telegram bot runtime)
- `BOT_NAME` (optional)
- `PORT` (optional, default `3000`)

## Local Run
```bash
npm install
BOT_TOKEN=xxxxx npm start
```

## Deploy (Coolify)
- Build Pack: `dockerfile`
- Exposed Port: `3000`
- Health Check Path: `/health`
- Add env var `BOT_TOKEN` in Coolify before restart
