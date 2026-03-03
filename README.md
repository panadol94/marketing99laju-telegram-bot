# marketing99laju-telegram-bot

Telegram marketing bot for 99Laju flow, ready for Coolify deployment.

## Implemented Flow
1. Record member username + phone number
2. Ask member register at 99Laju first
3. Show menu only after registration + phone verification
4. Share bot referral link to claim Free Credit (target 20 referrals → RM20)
5. Menu has **Contact CS** button
6. Menu has **Welcome Bonus** button
7. Admin broadcast function

## Features
- `/start` onboarding gate
- Contact-share button (Telegram contact request)
- Manual phone input fallback
- Lead logging (`data/leads.jsonl`)
- User/referral persistence (`data/users.json`)
- Deep-link referral tracking (`/start ref_<userId>`)
- Admin commands:
  - `/stats`
  - `/broadcast <mesej>`
- Health endpoint (`/health`) and stats endpoint (`/stats` HTTP)

## Environment Variables
- `BOT_TOKEN` (required)
- `BOT_NAME` (default: `Marketing99Laju Bot`)
- `REGISTER_LINK` (default: `https://99laju.com`)
- `CS_LINK` (default: `https://t.me/marketing99laju`)
- `ADMIN_IDS` (comma-separated Telegram user IDs)
- `FREE_CREDIT_TARGET` (default: `20`)
- `PORT` (default: `3000`)

## Local Run
```bash
npm install
BOT_TOKEN=xxxxx ADMIN_IDS=5925622731 npm start
```

## Deploy (Coolify)
- Build Pack: `dockerfile`
- Exposed Port: `3000`
- Health check path: `/health`
- Set env vars before restart (`BOT_TOKEN` wajib)
