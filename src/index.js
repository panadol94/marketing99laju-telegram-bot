require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const BOT_NAME = process.env.BOT_NAME || 'Marketing99Laju Bot';
const BOT_USERNAME = process.env.BOT_USERNAME || '';
const REGISTER_LINK = process.env.REGISTER_LINK || 'https://99laju.com';
const CS_LINK = process.env.CS_LINK || 'https://t.me/marketing99laju';
const ADMIN_IDS = new Set(
  (process.env.ADMIN_IDS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
);

const FREE_CREDIT_TARGET = Number(process.env.FREE_CREDIT_TARGET || 20);

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LEADS_FILE = path.join(DATA_DIR, 'leads.jsonl');

const runtime = {
  users: {},
  botUsername: '',
  leadsLogged: 0,
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return;
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    runtime.users = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn('[users] load failed:', err.message);
    runtime.users = {};
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(runtime.users, null, 2));
  } catch (err) {
    console.warn('[users] save failed:', err.message);
  }
}

function isAdmin(id) {
  return ADMIN_IDS.has(String(id));
}

function nowIso() {
  return new Date().toISOString();
}

async function logLead(ctx, action, extra = {}) {
  try {
    const payload = {
      time: nowIso(),
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
    console.warn('[lead] log failed:', err.message);
  }
}

function parseStartPayload(text = '') {
  const parts = String(text).trim().split(/\s+/);
  if (parts.length < 2) return '';
  return parts.slice(1).join(' ').trim();
}

function parsePhone(text = '') {
  const cleaned = String(text).replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return cleaned;
}

function getUser(ctx, create = true) {
  const id = String(ctx.from?.id || '');
  if (!id) return null;

  if (!runtime.users[id] && create) {
    runtime.users[id] = {
      userId: id,
      username: ctx.from?.username || null,
      firstName: ctx.from?.first_name || null,
      phone: null,
      registered99laju: false,
      referrer: null,
      referrals: [],
      chatId: ctx.chat?.id ? String(ctx.chat.id) : null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  const user = runtime.users[id] || null;
  if (!user) return null;

  user.username = ctx.from?.username || user.username || null;
  user.firstName = ctx.from?.first_name || user.firstName || null;
  if (ctx.chat?.id) user.chatId = String(ctx.chat.id);
  user.updatedAt = nowIso();

  return user;
}

function isOnboardingComplete(user) {
  return Boolean(user?.registered99laju && user?.phone);
}

function addReferralIfNeeded(userId, referrerId) {
  if (!userId || !referrerId) return;
  if (userId === referrerId) return;

  const user = runtime.users[userId];
  if (!user) return;
  if (user.referrer) return; // one referrer only

  user.referrer = referrerId;

  if (!runtime.users[referrerId]) {
    runtime.users[referrerId] = {
      userId: referrerId,
      username: null,
      firstName: null,
      phone: null,
      registered99laju: false,
      referrer: null,
      referrals: [],
      chatId: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  const refUser = runtime.users[referrerId];
  if (!Array.isArray(refUser.referrals)) refUser.referrals = [];
  if (!refUser.referrals.includes(userId)) refUser.referrals.push(userId);

  user.updatedAt = nowIso();
  refUser.updatedAt = nowIso();
}

function registerPromptKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url('📝 Register 99Laju', REGISTER_LINK)],
    [Markup.button.callback('✅ Saya Dah Register', 'DONE_REGISTER')],
  ]);
}

function phoneRequestKeyboard() {
  return Markup.keyboard([[Markup.button.contactRequest('📱 Share Phone Number')]])
    .resize()
    .oneTime();
}

function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🎁 Welcome Bonus', 'WELCOME_BONUS')],
    [Markup.button.url('💬 Contact CS', CS_LINK)],
    [Markup.button.callback('🚀 Claim Free Credit', 'CLAIM_FREE_CREDIT')],
    [Markup.button.callback('📢 Share Bot', 'SHARE_BOT')],
  ]);
}

async function sendOnboardingMessage(ctx, user) {
  const name = user.firstName || 'boss';
  await ctx.reply(
    `Hi ${name} 👋\n` +
      'Untuk continue, sila complete step ni dulu:\n\n' +
      '1) Register akaun di 99Laju\n' +
      '2) Tekan "Saya Dah Register"\n' +
      '3) Share phone number untuk verify',
    registerPromptKeyboard()
  );
}

async function askPhone(ctx) {
  await ctx.reply(
    'Bagus ✅ Sekarang share phone number anda (guna button bawah).\n' +
      'Kalau tak boleh, boleh type nombor manual juga.',
    phoneRequestKeyboard()
  );
}

async function showMainMenu(ctx, user) {
  const referralCount = Array.isArray(user.referrals) ? user.referrals.length : 0;
  await ctx.reply(
    `✅ Verification complete. Welcome to ${BOT_NAME}!\n` +
      `Progress Free Credit: ${referralCount}/${FREE_CREDIT_TARGET} referral`,
    mainMenuKeyboard()
  );
}

function keywordReply(text) {
  const t = String(text || '').toLowerCase();
  if (t.includes('bonus') || t.includes('claim')) {
    return '🎁 Tekan menu "Welcome Bonus" untuk tengok offer semasa.';
  }
  if (t.includes('cs') || t.includes('support') || t.includes('admin')) {
    return `💬 Contact CS: ${CS_LINK}`;
  }
  if (t.includes('promo') || t.includes('promosi')) {
    return '📈 Promo terkini ada dalam menu. Tekan "Welcome Bonus".';
  }
  return null;
}

const app = express();
app.use(express.json());

let botStatus = 'disabled';

app.get('/health', (_req, res) => {
  const users = Object.values(runtime.users || {});
  const completed = users.filter((u) => isOnboardingComplete(u)).length;
  res.json({
    ok: true,
    service: 'marketing99laju-telegram-bot',
    botStatus,
    usersTotal: users.length,
    usersVerified: completed,
    leadsLogged: runtime.leadsLogged,
    timestamp: nowIso(),
  });
});

app.get('/', (_req, res) => {
  res.json({
    message: `${BOT_NAME} is running`,
    botStatus,
  });
});

app.get('/stats', (_req, res) => {
  const users = Object.values(runtime.users || {});
  const completed = users.filter((u) => isOnboardingComplete(u)).length;
  res.json({
    botStatus,
    usersTotal: users.length,
    usersVerified: completed,
    leadsLoggedRuntime: runtime.leadsLogged,
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[http] listening on :${PORT}`);
});

async function startBot() {
  ensureDataDir();
  loadUsers();

  if (!BOT_TOKEN) {
    botStatus = 'disabled (missing BOT_TOKEN)';
    console.warn('[bot] BOT_TOKEN not set; Telegram bot not started.');
    return;
  }

  const bot = new Telegraf(BOT_TOKEN);

  runtime.botUsername = BOT_USERNAME;
  try {
    const me = await Promise.race([
      bot.telegram.getMe(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getMe timeout')), 10000)
      ),
    ]);
    runtime.botUsername = me?.username || runtime.botUsername;
  } catch (err) {
    console.warn('[bot] getMe failed, using BOT_USERNAME fallback:', err.message);
  }

  bot.start(async (ctx) => {
    const user = getUser(ctx, true);
    if (!user) return;

    const payload = parseStartPayload(ctx.message?.text);
    const match = payload.match(/^ref_(\d+)$/i);
    if (match) addReferralIfNeeded(user.userId, match[1]);

    saveUsers();
    await logLead(ctx, 'start', { payload: payload || null });

    if (isOnboardingComplete(user)) {
      return showMainMenu(ctx, user);
    }

    return sendOnboardingMessage(ctx, user);
  });

  bot.action('DONE_REGISTER', async (ctx) => {
    await ctx.answerCbQuery();
    const user = getUser(ctx, true);
    if (!user) return;

    user.registered99laju = true;
    user.updatedAt = nowIso();
    saveUsers();

    await logLead(ctx, 'done_register_click');

    if (user.phone) {
      return showMainMenu(ctx, user);
    }
    return askPhone(ctx);
  });

  bot.on('contact', async (ctx) => {
    const user = getUser(ctx, true);
    if (!user) return;

    const phone = ctx.message?.contact?.phone_number || null;
    if (!phone) return;

    user.phone = phone;
    user.updatedAt = nowIso();
    saveUsers();

    await logLead(ctx, 'phone_shared', { phone });

    await ctx.reply('✅ Phone number saved.', Markup.removeKeyboard());

    if (!user.registered99laju) {
      return sendOnboardingMessage(ctx, user);
    }
    return showMainMenu(ctx, user);
  });

  bot.command('help', (ctx) => {
    return ctx.reply(
      [
        '📌 Commands:',
        '/start - Start & onboarding',
        '/menu - Open main menu',
        '/stats - Bot stats (admin)',
        '/broadcast <mesej> - Broadcast (admin)',
      ].join('\n')
    );
  });

  bot.command('menu', async (ctx) => {
    const user = getUser(ctx, true);
    if (!user) return;

    saveUsers();

    if (!isOnboardingComplete(user)) {
      return sendOnboardingMessage(ctx, user);
    }
    return showMainMenu(ctx, user);
  });

  bot.command('stats', (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      return ctx.reply('⛔ Command ni admin only.');
    }

    const users = Object.values(runtime.users || {});
    const verified = users.filter((u) => isOnboardingComplete(u));

    return ctx.reply(
      [
        `📊 ${BOT_NAME} Stats`,
        `Total users: ${users.length}`,
        `Verified users: ${verified.length}`,
        `Leads logged(runtime): ${runtime.leadsLogged}`,
      ].join('\n')
    );
  });

  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      return ctx.reply('⛔ Command ni admin only.');
    }

    const text = String(ctx.message?.text || '').replace(/^\/broadcast\s*/i, '').trim();
    if (!text) return ctx.reply('Guna: /broadcast <mesej>');

    const userList = Object.values(runtime.users || {});
    const targets = [...new Set(userList.map((u) => u.chatId).filter(Boolean))];

    if (targets.length === 0) {
      return ctx.reply('Tiada user target lagi untuk broadcast.');
    }

    let success = 0;
    let failed = 0;

    for (const chatId of targets) {
      try {
        await bot.telegram.sendMessage(chatId, `📢 ${text}`);
        success += 1;
      } catch (_e) {
        failed += 1;
      }
    }

    return ctx.reply(`Broadcast done. Success: ${success}, Failed: ${failed}`);
  });

  bot.action('WELCOME_BONUS', async (ctx) => {
    await ctx.answerCbQuery();
    const user = getUser(ctx, true);
    if (!user) return;

    if (!isOnboardingComplete(user)) {
      return sendOnboardingMessage(ctx, user);
    }

    await logLead(ctx, 'click_welcome_bonus');

    return ctx.reply(
      `🎁 Welcome Bonus tersedia untuk member baru.\n` +
        `Register: ${REGISTER_LINK}\n` +
        `Lepas tu contact CS untuk claim: ${CS_LINK}`
    );
  });

  bot.action('CLAIM_FREE_CREDIT', async (ctx) => {
    await ctx.answerCbQuery();
    const user = getUser(ctx, true);
    if (!user) return;

    if (!isOnboardingComplete(user)) {
      return sendOnboardingMessage(ctx, user);
    }

    const referrals = Array.isArray(user.referrals) ? user.referrals.length : 0;
    const left = Math.max(0, FREE_CREDIT_TARGET - referrals);

    await logLead(ctx, 'click_claim_free_credit', { referrals });

    if (referrals >= FREE_CREDIT_TARGET) {
      return ctx.reply(
        `🎉 Tahniah! Anda capai ${referrals}/${FREE_CREDIT_TARGET} referral.\n` +
          `Sila contact CS untuk claim RM20: ${CS_LINK}`
      );
    }

    return ctx.reply(
      `🚀 Progress anda: ${referrals}/${FREE_CREDIT_TARGET}.\n` +
        `Share bot lagi ${left} orang untuk layak claim RM20.\n` +
        `Tekan "Share Bot" untuk dapat referral link.`
    );
  });

  bot.action('SHARE_BOT', async (ctx) => {
    await ctx.answerCbQuery();
    const user = getUser(ctx, true);
    if (!user) return;

    if (!isOnboardingComplete(user)) {
      return sendOnboardingMessage(ctx, user);
    }

    const username = runtime.botUsername;
    if (!username) {
      return ctx.reply('Bot username belum available. Cuba lagi sebentar.');
    }

    const link = `https://t.me/${username}?start=ref_${user.userId}`;
    const referrals = Array.isArray(user.referrals) ? user.referrals.length : 0;

    await logLead(ctx, 'click_share_bot', { referrals, link });

    return ctx.reply(
      `📢 Share link anda:\n${link}\n\n` +
        `Progress claim RM20: ${referrals}/${FREE_CREDIT_TARGET}`
    );
  });

  bot.on('text', async (ctx) => {
    const user = getUser(ctx, true);
    if (!user) return;

    saveUsers();

    const text = String(ctx.message?.text || '').trim();
    if (!text || text.startsWith('/')) return;

    if (!user.phone) {
      const parsed = parsePhone(text);
      if (parsed) {
        user.phone = parsed;
        user.updatedAt = nowIso();
        saveUsers();
        await logLead(ctx, 'phone_manual_input', { phone: parsed });

        if (!user.registered99laju) {
          await ctx.reply('✅ Phone number saved. Sila register 99Laju dulu ya.');
          return sendOnboardingMessage(ctx, user);
        }

        return showMainMenu(ctx, user);
      }
    }

    if (!isOnboardingComplete(user)) {
      return sendOnboardingMessage(ctx, user);
    }

    const auto = keywordReply(text);
    if (auto) {
      await logLead(ctx, 'keyword_trigger', { text });
      return ctx.reply(auto);
    }
  });

  botStatus = 'starting';
  bot.launch().then(() => {
    botStatus = 'active';
    console.log('[bot] started');
  }).catch((err) => {
    botStatus = `error: ${err.message}`;
    console.error('[bot] launch failed', err);
  });

  const shutdown = async (signal) => {
    console.log(`[bot] ${signal} received, shutting down...`);
    try {
      await bot.stop(signal);
    } catch (_e) {
      // noop
    }
    server.close(() => process.exit(0));
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

startBot().catch((err) => {
  botStatus = `error: ${err.message}`;
  console.error('[bot] fatal error', err);
});
