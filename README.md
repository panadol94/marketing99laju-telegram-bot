# marketing99laju-telegram-bot

Telegram marketing bot (lead + conversion style), ready for Coolify deployment.

## Features
- Express health endpoint: `/health`
- Runtime stats endpoint: `/stats`
- Telegram menu flow:
  - 🎁 Claim Bonus
  - 📈 Promo Hari Ini
  - 🤝 Join Agent
  - ❓ FAQ
- Keyword auto-reply (`bonus`, `promo`, `agent`, `deposit`, `wd`)
- Referral tracking via `/start <ref_code>`
- Lead logging to `data/leads.jsonl`
- Admin commands:
  - `/stats`
  - `/broadcast <mesej>`
- Anti-spam cooldown per user
- Follow-up nudges (2h + 24h)

## Environment Variables
- `BOT_TOKEN` (required)
- `BOT_NAME` (optional, default: `Marketing99Laju Bot`)
- `CTA_LINK` (optional, default: `https://t.me/marketing99laju`)
- `ADMIN_IDS` (optional, comma-separated Telegram user IDs)
- `COOLDOWN_SECONDS` (optional, default: `8`)
- `PORT` (optional, default: `3000`)

## Local Run
```bash
npm install
BOT_TOKEN=xxxxx ADMIN_IDS=5925622731 npm start
```

## Deploy (Coolify)
- Build Pack: `dockerfile`
- Exposed Port: `3000`
- Health Check Path: `/health`
- Set env vars (especially `BOT_TOKEN`) before restart
