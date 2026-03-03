require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const BOT_NAME = process.env.BOT_NAME || 'Marketing99Laju Bot';
const CTA_LINK = process.env.CTA_LINK || 'https://t.me/marketing99laju';
const COOLDOWN_SECONDS = Number(process.env.COOLDOWN_SECONDS || 8);
const ADMIN_IDS = new Set(
  (process.env.ADMIN_IDS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
);

const DATA_DIR = path.join(__dirname, '..', 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.jsonl');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const runtime = {
  knownChatIds: new Set(),
  lastReplyByUser: new Map(),
  followups: new Map(),
  leadsLogged: 0,
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    const ids = Array.isArray(parsed.knownChatIds) ? parsed.knownChatIds : [];
    ids.forEach((id) => runtime.knownChatIds.add(id));
  } catch (err) {
    console.warn('[state] failed to load state:', err.message);
  }
}

function saveState() {
  try {
    const payload = {
      knownChatIds: Array.from(runtime.knownChatIds),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.warn('[state] failed to save state:', err.message);
  }
}

function parseStartPayload(text = '') {
  const parts = String(text).trim().split(/\s+/);
  if (parts.length < 2) return '';
  return parts.slice(1).join(' ').trim();
}

async function logLead(ctx, action, extra = {}) {
  try {
    const payload = {
      time: new Date().toISOString(),
      action,
      user: {
        id: ctx.from?.id || null,
        username: ctx.from?.username || null,
        first_name: ctx.from?.first_name || null,
      },
      chat: {
        id: ctx.chat?.id || null,
        type: ctx.chat?.type || null,
        title: ctx.chat?.title || null,
      },
      extra,
    };
    fs.appendFileSync(LEADS_FILE, `${JSON.stringify(payload)}\n`);
    runtime.leadsLogged += 1;
  } catch (err) {
    console.warn('[lead] failed:', err.message);
  }
}

function rememberChatId(chatId) {
  if (!chatId) return;
  runtime.knownChatIds.add(String(chatId));
  saveState();
}

function isAdmin(id) {
  return ADMIN_IDS.has(String(id));
}

function menuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🎁 Claim Bonus', 'CLAIM_BONUS')],
    [Markup.button.callback('📈 Promo Hari Ini', 'PROMO_HARI_INI')],
    [Markup.button.callback('🤝 Join Agent', 'JOIN_AGENT')],
    [Markup.button.callback('❓ FAQ', 'FAQ')],
  ]);
}

function keywordReply(text) {
  const t = text.toLowerCase();
  if (t.includes('bonus') || t.includes('claim')) {
    return `🎁 Untuk claim bonus, tekan button "Claim Bonus" atau terus chat admin: ${CTA_LINK}`;
  }
  if (t.includes('promo') || t.includes('promosi')) {
    return '📈 Promo hari ini: Free spin + cashback ikut syarat semasa. Nak detail? Tekan "Promo Hari Ini".';
  }
  if (t.includes('agent') || t.includes('join')) {
    return `🤝 Nak jadi agent? Isi details ringkas dan team akan contact: ${CTA_LINK}`;
  }
  if (t.includes('wd') || t.includes('withdraw') || t.includes('deposit')) {
    return '💳 Deposit/WD biasa laju, tapi ikut queue & verification semasa. Untuk bantuan kes anda, terus PM admin.';
  }
  return null;
}

function canReplyByCooldown(userId) {
  const now = Date.now();
  const key = String(userId || 'unknown');
  const last = runtime.lastReplyByUser.get(key) || 0;
  const delta = now - last;
  if (delta < COOLDOWN_SECONDS * 1000) return false;
  runtime.lastReplyByUser.set(key, now);
  return true;
}

function scheduleFollowUps(bot, chatId) {
  const key = String(chatId);
  if (runtime.followups.has(key)) return;

  const t1 = setTimeout(async () => {
    try {
      await bot.telegram.sendMessage(
        chatId,
        `⏰ Friendly reminder: Kalau belum claim promo, boleh start sini 👉 ${CTA_LINK}`
      );
    } catch (_e) {
      // ignore send failures
    }
  }, 2 * 60 * 60 * 1000); // 2h

  const t2 = setTimeout(async () => {
    try {
      await bot.telegram.sendMessage(
        chatId,
        `🚀 Last call hari ni: slot promo masih available. Check sekarang 👉 ${CTA_LINK}`
      );
    } catch (_e) {
      // ignore send failures
    }
    runtime.followups.delete(key);
  }, 24 * 60 * 60 * 1000); // 24h

  runtime.followups.set(key, [t1, t2]);
}

function clearFollowUps(chatId) {
  const key = String(chatId);
  const timers = runtime.followups.get(key);
  if (!timers) return;
  timers.forEach((timer) => clearTimeout(timer));
  runtime.followups.delete(key);
}

const app = express();
app.use(express.json());

let botStatus = 'disabled';

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'marketing99laju-telegram-bot',
    botStatus,
    knownChats: runtime.knownChatIds.size,
    leadsLogged: runtime.leadsLogged,
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (_req, res) => {
  res.json({
    message: `${BOT_NAME} is running`,
    botStatus,
  });
});

app.get('/stats', (_req, res) => {
  res.json({
    botStatus,
    knownChats: runtime.knownChatIds.size,
    activeFollowups: runtime.followups.size,
    leadsLoggedRuntime: runtime.leadsLogged,
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[http] listening on :${PORT}`);
});

async function startBot() {
  ensureDataDir();
  loadState();

  if (!BOT_TOKEN) {
    botStatus = 'disabled (missing BOT_TOKEN)';
    console.warn('[bot] BOT_TOKEN not set; Telegram bot not started.');
    return;
  }

  const bot = new Telegraf(BOT_TOKEN);

  bot.start(async (ctx) => {
    const payload = parseStartPayload(ctx.message?.text);
    const chatId = ctx.chat?.id;

    rememberChatId(chatId);
    clearFollowUps(chatId);
    scheduleFollowUps(bot, chatId);

    await logLead(ctx, 'start', {
      referral: payload || null,
    });

    const refText = payload ? `\nRef: ${payload}` : '';
    return ctx.reply(
      `Hi ${ctx.from?.first_name || 'boss'} 👋\nSelamat datang ke ${BOT_NAME}.${refText}\nPilih menu bawah ni:`,
      menuKeyboard()
    );
  });

  bot.command('help', (ctx) => {
    return ctx.reply([
      '📌 Command list:',
      '/start - Mula bot & tunjuk menu',
      '/promo - Promo hari ini',
      '/claim - Cara claim bonus',
      '/join - Join agent',
      '/faq - Soalan biasa',
      '/health - Status bot',
      '/stats - Stats ringkas (admin)',
      '/broadcast <mesej> - Broadcast (admin)',
    ].join('\n'));
  });

  bot.command('promo', async (ctx) => {
    rememberChatId(ctx.chat?.id);
    await logLead(ctx, 'promo_command');
    return ctx.reply(`📈 Promo hari ini aktif. Untuk full detail & claim laju: ${CTA_LINK}`);
  });

  bot.command('claim', async (ctx) => {
    rememberChatId(ctx.chat?.id);
    await logLead(ctx, 'claim_command');
    return ctx.reply(`🎁 Step claim bonus:\n1) Register/login\n2) Contact admin\n3) Bagi screenshot\nLink: ${CTA_LINK}`);
  });

  bot.command('join', async (ctx) => {
    rememberChatId(ctx.chat?.id);
    await logLead(ctx, 'join_command');
    return ctx.reply(`🤝 Nak join agent, hantar details anda pada link ni: ${CTA_LINK}`);
  });

  bot.command('faq', async (ctx) => {
    rememberChatId(ctx.chat?.id);
    await logLead(ctx, 'faq_command');
    return ctx.reply(
      [
        '❓ FAQ ringkas:',
        '- Deposit minimum ikut promo semasa.',
        '- Withdraw tertakluk verification.',
        '- Bonus claim 1 akaun 1 user (tertakluk syarat).',
        `- Support: ${CTA_LINK}`,
      ].join('\n')
    );
  });

  bot.command('health', (ctx) => {
    return ctx.reply(`✅ ${BOT_NAME} active. Uptime: ${Math.round(process.uptime())}s`);
  });

  bot.command('stats', (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      return ctx.reply('⛔ Command ni untuk admin sahaja.');
    }
    return ctx.reply(
      [
        `📊 ${BOT_NAME} stats`,
        `Known chats: ${runtime.knownChatIds.size}`,
        `Active followups: ${runtime.followups.size}`,
        `Leads logged (runtime): ${runtime.leadsLogged}`,
      ].join('\n')
    );
  });

  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      return ctx.reply('⛔ Command ni untuk admin sahaja.');
    }
    const text = (ctx.message?.text || '').replace(/^\/broadcast\s*/i, '').trim();
    if (!text) {
      return ctx.reply('Guna: /broadcast <mesej>');
    }

    let success = 0;
    let failed = 0;

    const ids = Array.from(runtime.knownChatIds);
    for (const chatId of ids) {
      try {
        await bot.telegram.sendMessage(chatId, `📢 ${text}`);
        success += 1;
      } catch (_e) {
        failed += 1;
      }
    }

    return ctx.reply(`Broadcast done. Success: ${success}, Failed: ${failed}`);
  });

  bot.action('CLAIM_BONUS', async (ctx) => {
    await ctx.answerCbQuery();
    await logLead(ctx, 'click_claim_bonus');
    return ctx.reply(`🎁 Claim bonus terus di sini: ${CTA_LINK}`);
  });

  bot.action('PROMO_HARI_INI', async (ctx) => {
    await ctx.answerCbQuery();
    await logLead(ctx, 'click_promo_hari_ini');
    return ctx.reply(`📈 Promo hari ini dah live. Details penuh: ${CTA_LINK}`);
  });

  bot.action('JOIN_AGENT', async (ctx) => {
    await ctx.answerCbQuery();
    await logLead(ctx, 'click_join_agent');
    return ctx.reply(`🤝 Jom join agent. Register interest di sini: ${CTA_LINK}`);
  });

  bot.action('FAQ', async (ctx) => {
    await ctx.answerCbQuery();
    await logLead(ctx, 'click_faq');
    return ctx.reply(
      [
        '❓ FAQ:',
        '- Bonus ikut terma semasa.',
        '- Proses deposit/WD ikut verification.',
        `- Team support: ${CTA_LINK}`,
      ].join('\n')
    );
  });

  bot.on('text', async (ctx) => {
    const text = (ctx.message?.text || '').trim();
    const chatId = ctx.chat?.id;

    rememberChatId(chatId);

    if (text.startsWith('/')) return;

    const auto = keywordReply(text);
    if (!auto) return;

    if (!canReplyByCooldown(ctx.from?.id)) return;

    await logLead(ctx, 'keyword_trigger', { text });
    return ctx.reply(auto);
  });

  await bot.launch();
  botStatus = 'active';
  console.log('[bot] started');

  const shutdown = async (signal) => {
    console.log(`[bot] ${signal} received, shutting down...`);
    try {
      await bot.stop(signal);
    } catch (_e) {
      // noop
    }
    for (const timers of runtime.followups.values()) {
      timers.forEach((timer) => clearTimeout(timer));
    }
    runtime.followups.clear();
    server.close(() => process.exit(0));
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

startBot().catch((err) => {
  botStatus = `error: ${err.message}`;
  console.error('[bot] fatal error', err);
});
