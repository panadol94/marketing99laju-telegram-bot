require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const BOT_NAME = process.env.BOT_NAME || 'Marketing Laju Bot';

const app = express();
app.use(express.json());

let botStatus = 'disabled';

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'marketing99laju-telegram-bot',
    botStatus,
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (_req, res) => {
  res.json({
    message: `${BOT_NAME} is running`,
    botStatus,
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[http] listening on :${PORT}`);
});

async function startBot() {
  if (!BOT_TOKEN) {
    botStatus = 'disabled (missing BOT_TOKEN)';
    console.warn('[bot] BOT_TOKEN not set; Telegram bot not started.');
    return;
  }

  const bot = new Telegraf(BOT_TOKEN);

  bot.start((ctx) => {
    return ctx.reply(
      `Hi ${ctx.from?.first_name || 'boss'} 👋\nSaya ${BOT_NAME}.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📌 Idea Campaign', 'IDEA_CAMPAIGN')],
        [Markup.button.callback('🧠 Content Angle', 'CONTENT_ANGLE')],
      ])
    );
  });

  bot.command('help', (ctx) => {
    return ctx.reply([
      'Available commands:',
      '/start - Start bot',
      '/idea - Generate campaign idea',
      '/angle - Content angle suggestion',
      '/health - Bot runtime status',
    ].join('\n'));
  });

  bot.command('idea', (ctx) => {
    return ctx.reply(
      'Idea cepat: "Spin & Win Challenge" - user join channel + submit screenshot then auto-reply bonus code ikut slot game yang tengah trending.'
    );
  });

  bot.command('angle', (ctx) => {
    return ctx.reply(
      'Content angle: social proof + urgency. Contoh: "Ramai dah claim, tinggal 2 jam lagi" + screenshot winner.'
    );
  });

  bot.command('health', (ctx) => {
    return ctx.reply(`✅ ${BOT_NAME} active. Uptime: ${Math.round(process.uptime())}s`);
  });

  bot.action('IDEA_CAMPAIGN', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Campaign idea: Weekly leaderboard + referral bonus + auto reminder setiap malam.');
  });

  bot.action('CONTENT_ANGLE', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Angle cadangan: Fear of missing out (FOMO) + limited quota + real testimonial.');
  });

  bot.on('text', (ctx) => {
    return ctx.reply('Noted boss. Try /idea atau /angle dulu 🚀');
  });

  await bot.launch();
  botStatus = 'active';
  console.log('[bot] started');

  const shutdown = async (signal) => {
    console.log(`[bot] ${signal} received, shutting down...`);
    await bot.stop(signal);
    server.close(() => process.exit(0));
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

startBot().catch((err) => {
  botStatus = `error: ${err.message}`;
  console.error('[bot] fatal error', err);
});
