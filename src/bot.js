/**
 * Production-ready Telegram clinic bot.
 * - Persistent SQLite state (sessions, appointments, AI logs, rate limits)
 * - Markdown escaping, input validation
 * - Anti-prompt-injection AI wrapping
 * - Inline keyboard slot picker (doctor → date → time)
 * - Webhook secret token verification
 * - i18n (UZ/RU)
 */

require('dotenv').config();
const crypto = require('crypto');
const http = require('http');
const TelegramBot = require('node-telegram-bot-api');

const { CLINIC, KNOWLEDGE_BASE } = require('./config');
const db = require('./db');
const claude = require('./claude');
const kb = require('./keyboards');
const {
  logger, escapeMd, t,
  validatePhone, validateName, validateTime, validateDate,
  checkDoctorAvailability,
} = require('./utils');

// ─── ENV ─────────────────────────────────────────────────────────────────────
const TOKEN          = process.env.BOT_TOKEN;
const ADMIN_ID       = process.env.ADMIN_CHAT_ID ? parseInt(process.env.ADMIN_CHAT_ID, 10) : null;
const WEBHOOK_URL    = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const PORT           = parseInt(process.env.PORT || '3000', 10);
const RATE_AI        = parseInt(process.env.RATE_LIMIT_AI || '5', 10);
const RATE_AI_WIN    = parseInt(process.env.RATE_LIMIT_AI_WINDOW_MIN || '1', 10);
const RATE_APPT      = parseInt(process.env.RATE_LIMIT_APPT || '3', 10);
const RATE_APPT_WIN  = parseInt(process.env.RATE_LIMIT_APPT_WINDOW_MIN || '60', 10);

if (!TOKEN) {
  console.error('BOT_TOKEN env var is required');
  process.exit(1);
}

const bot = WEBHOOK_URL
  ? new TelegramBot(TOKEN)
  : new TelegramBot(TOKEN, { polling: true });

// ─── SAFE WRAPPERS ───────────────────────────────────────────────────────────
async function send(chatId, text, extra = {}) {
  try {
    return await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...extra });
  } catch (e) {
    logger.error('sendMessage failed', { chatId, error: e.message });
    // Retry without markdown
    try {
      return await bot.sendMessage(chatId, text.replace(/[*_`\[\]]/g, ''), extra);
    } catch (e2) {
      logger.error('sendMessage retry failed', { chatId, error: e2.message });
    }
  }
}

async function answerCallback(queryId, text) {
  try { await bot.answerCallbackQuery(queryId, text ? { text } : undefined); }
  catch (e) { logger.warn('answerCallbackQuery failed', { error: e.message }); }
}

async function editMessageText(text, opts) {
  try { return await bot.editMessageText(text, { parse_mode: 'Markdown', ...opts }); }
  catch (e) { logger.warn('editMessageText failed', { error: e.message }); }
}

function notifyAdmin(text) {
  if (ADMIN_ID) send(ADMIN_ID, text);
}

function notifyDoctor(doctorId, text) {
  const tgId = db.getDoctorTelegram(doctorId);
  if (tgId) send(tgId, text);
  else notifyAdmin(text); // fallback
}

function doctorById(id) {
  return CLINIC.doctors.find(d => d.id === id);
}

// ─── /start ──────────────────────────────────────────────────────────────────
bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;
  db.upsertUser({
    chatId,
    username: msg.from.username,
    firstName: msg.from.first_name,
  });
  db.clearSession(chatId);

  const name = msg.from.first_name || 'mehmon';
  await send(chatId,
    `${t('uz', 'welcome', name)}\n\n` +
    `🏥 *${escapeMd(CLINIC.name)}* — ${CLINIC.established}-yildan beri xizmatda.\n\n` +
    `Quyidagilardan foydalanishingiz mumkin:\n` +
    `📋 Xizmatlar va narxlar\n` +
    `👨‍⚕️ Shifokorlar\n` +
    `📅 Qabulga yozilish\n` +
    `🤖 *AI Maslahatchi* — belgilaringizni aytib, mutaxassis tavsiyasini oling\n\n` +
    `_Tibbiy maslahatchi tashxis qo'ymaydi — faqat sizga qaysi shifokorga borishni tavsiya etadi._`,
    kb.mainMenu(),
  );
});

bot.onText(/^\/help$/, (msg) => {
  send(msg.chat.id,
    `*Yordam*\n\n` +
    `/start — botni qayta boshlash\n` +
    `/cancel — joriy amalni bekor qilish\n` +
    `/lang — tilni o'zgartirish\n` +
    `/myappts — buyurtmalarim\n\n` +
    `*Operator:* ${escapeMd(CLINIC.phone)}`,
    kb.mainMenu(),
  );
});

bot.onText(/^\/cancel$/, (msg) => {
  db.clearSession(msg.chat.id);
  send(msg.chat.id, t('uz', 'cancelled'), kb.mainMenu());
});

bot.onText(/^\/lang$/, (msg) => {
  send(msg.chat.id, 'Tilni tanlang / Выберите язык:', kb.languagePicker());
});

bot.onText(/^\/myappts$/, async (msg) => {
  await handleMyAppointments(msg.chat.id);
});

// ─── MENU HANDLERS (exact match, not regex) ──────────────────────────────────
bot.on('message', async (msg) => {
  // Defensive: skip non-text, commands handled above
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // Ensure user exists
  db.upsertUser({
    chatId,
    username: msg.from.username,
    firstName: msg.from.first_name,
  });

  try {
    // ── Top-level menu (exact match) ──
    if (text === kb.MENU_BTNS.services)    return handleServices(chatId);
    if (text === kb.MENU_BTNS.hours)       return handleHours(chatId);
    if (text === kb.MENU_BTNS.doctors)     return handleDoctors(chatId);
    if (text === kb.MENU_BTNS.address)     return handleAddress(chatId);
    if (text === kb.MENU_BTNS.operator)    return handleOperator(chatId);
    if (text === kb.MENU_BTNS.appointment) return handleStartAppt(chatId);
    if (text === kb.MENU_BTNS.ai)          return handleStartAi(chatId);
    if (text === kb.MENU_BTNS.myAppts)     return handleMyAppointments(chatId);
    if (text === kb.MENU_BTNS.language) {
      return send(chatId, 'Tilni tanlang / Выберите язык:', kb.languagePicker());
    }

    // ── Cancel from any flow ──
    if (text === '❌ Bekor qilish' || text === '❌ Отмена') {
      db.clearSession(chatId);
      return send(chatId, t('uz', 'cancelled'), kb.mainMenu());
    }
    if (text === '🏠 Asosiy menyu' || text === '🏠 Главное меню') {
      db.clearSession(chatId);
      return send(chatId, 'Asosiy menyu:', kb.mainMenu());
    }

    // ── Session-driven flow ──
    const session = db.getSession(chatId);
    if (!session) return; // No active flow, ignore stray text

    if (session.step.startsWith('ai_')) {
      return handleAiStep(chatId, msg, session, text);
    }
    if (session.step.startsWith('appt_')) {
      return handleApptStep(chatId, msg, session, text);
    }
  } catch (e) {
    logger.error('Message handler error', { chatId, error: e.message, stack: e.stack });
    send(chatId, t('uz', 'error'), kb.mainMenu());
    db.clearSession(chatId);
  }
});

// ─── CALLBACK QUERIES (inline keyboards) ─────────────────────────────────────
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;
  try {
    if (data === 'cancel') {
      db.clearSession(chatId);
      await answerCallback(q.id, 'Bekor qilindi');
      await editMessageText('Bekor qilindi.', { chat_id: chatId, message_id: q.message.message_id });
      await send(chatId, 'Asosiy menyu:', kb.mainMenu());
      return;
    }
    if (data === 'noop') {
      await answerCallback(q.id, 'Bu vaqt band');
      return;
    }
    if (data.startsWith('lang:')) {
      const lang = data.slice(5);
      if (['uz','ru'].includes(lang)) {
        db.setLang(chatId, lang);
        await answerCallback(q.id, '✅');
        await editMessageText(
          lang === 'uz' ? "Til: O'zbek ✅" : 'Язык: Русский ✅',
          { chat_id: chatId, message_id: q.message.message_id },
        );
      }
      return;
    }

    const session = db.getSession(chatId);

    if (data.startsWith('doc:')) {
      const doctorId = parseInt(data.slice(4), 10);
      const doctor = doctorById(doctorId);
      if (!doctor) return answerCallback(q.id, 'Shifokor topilmadi');

      db.setSession(chatId, 'appt_date', { doctorId });
      await answerCallback(q.id);
      await editMessageText(
        `✅ *${escapeMd(doctor.name)}* (${escapeMd(doctor.spec)}) — ${doctor.price.toLocaleString('uz-UZ')} so'm\n\n` +
        `📅 *Qaysi kun?*\n_Bo'sh kunlari ko'rsatilgan:_`,
        { chat_id: chatId, message_id: q.message.message_id, ...kb.datePicker(doctor).reply_markup ? { reply_markup: kb.datePicker(doctor).reply_markup } : {} },
      );
      return;
    }

    if (data.startsWith('date:')) {
      const iso = data.slice(5);
      if (!session || session.step !== 'appt_date') {
        return answerCallback(q.id, 'Sessiya muddati tugagan');
      }
      const doctor = doctorById(session.payload.doctorId);
      if (!doctor) return answerCallback(q.id, 'Shifokor topilmadi');

      // Determine taken slots for the day
      const stmt = db.db.prepare(
        `SELECT appt_time FROM appointments WHERE doctor_id = ? AND appt_date = ? AND status != 'cancelled'`,
      );
      const taken = stmt.all(doctor.id, iso).map(r => r.appt_time);

      const dayIdx = new Date(iso + 'T00:00:00').getDay();
      const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][dayIdx];
      const picker = kb.timePicker(doctor, dayKey, taken);
      if (!picker) return answerCallback(q.id, 'Bu kuni mavjud emas');

      db.setSession(chatId, 'appt_time', { ...session.payload, date: iso });
      await answerCallback(q.id);
      await editMessageText(
        `📅 Sana: ${iso}\n\n⏰ *Qaysi vaqt?*\n_❌ — band slotlar_`,
        { chat_id: chatId, message_id: q.message.message_id, reply_markup: picker.reply_markup },
      );
      return;
    }

    if (data.startsWith('time:')) {
      const hhmm = data.slice(5);
      if (!session || session.step !== 'appt_time') {
        return answerCallback(q.id, 'Sessiya muddati tugagan');
      }
      db.setSession(chatId, 'appt_name', { ...session.payload, time: hhmm });
      await answerCallback(q.id);
      const doctor = doctorById(session.payload.doctorId);
      await editMessageText(
        `✅ *${escapeMd(doctor.name)}*\n📅 ${session.payload.date} — ⏰ ${hhmm}`,
        { chat_id: chatId, message_id: q.message.message_id },
      );
      await send(chatId, "📝 *Ismingizni kiriting:* (kamida 2 belgi)", kb.cancelMenu());
      return;
    }

    if (data === 'appt:confirm') {
      await answerCallback(q.id);
      await confirmAppointment(chatId, q.message.message_id);
      return;
    }

    answerCallback(q.id);
  } catch (e) {
    logger.error('Callback handler error', { chatId, data, error: e.message });
    answerCallback(q.id, 'Xatolik');
  }
});

// ─── CONTACT (phone share) ───────────────────────────────────────────────────
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const session = db.getSession(chatId);
  if (session?.step === 'appt_phone') {
    const phoneResult = validatePhone(msg.contact.phone_number);
    if (!phoneResult.ok) {
      return send(chatId, `⚠️ ${phoneResult.error}`);
    }
    db.setSession(chatId, 'appt_review', { ...session.payload, phone: phoneResult.value });
    await reviewAppointment(chatId);
  }
});

// ─── HANDLERS ────────────────────────────────────────────────────────────────
function handleServices(chatId) {
  let text = `📋 *${escapeMd(CLINIC.name)} — Xizmatlar va narxlar*\n\n`;
  for (const s of CLINIC.services) {
    text += `• ${escapeMd(s.name)} — 💰 ${s.price.toLocaleString('uz-UZ')} so'm\n`;
  }
  text += `\n🎁 *Chegirmalar:*\n`;
  for (const d of CLINIC.discounts) text += `• ${escapeMd(d)}\n`;
  text += `\n📞 ${escapeMd(CLINIC.phone)}`;
  send(chatId, text, kb.mainMenu());
}

function handleHours(chatId) {
  let text = `🕐 *Ish vaqti*\n\n`;
  for (const [day, time] of Object.entries(CLINIC.workingHours)) {
    text += `📅 *${escapeMd(day)}:* ${escapeMd(time)}\n`;
  }
  send(chatId, text, kb.mainMenu());
}

function handleDoctors(chatId) {
  let text = `👨‍⚕️ *Shifokorlar*\n\n`;
  for (const d of CLINIC.doctors) {
    text += `🩺 *${escapeMd(d.name)}*\n`;
    text += `   ${escapeMd(d.spec)} · ${escapeMd(d.exp)} · ${d.price.toLocaleString('uz-UZ')} so'm\n`;
    text += `   _${escapeMd(d.bio)}_\n\n`;
  }
  send(chatId, text, kb.mainMenu());
}

function handleAddress(chatId) {
  send(chatId,
    `📍 *Manzil:*\n${escapeMd(CLINIC.address)}\n\n🚌 Yunusobod 5-mavze`,
    kb.mainMenu(),
  );
  bot.sendLocation(chatId, CLINIC.mapLat, CLINIC.mapLng).catch(() => {});
}

function handleOperator(chatId) {
  send(chatId,
    `📞 *Operator*\n\n` +
    `🏥 ${escapeMd(CLINIC.name)}\n` +
    `📍 ${escapeMd(CLINIC.address)}\n` +
    `📞 ${escapeMd(CLINIC.phone)}\n` +
    `💬 WhatsApp: ${escapeMd(CLINIC.whatsapp)}`,
    kb.mainMenu(),
  );
}

function handleStartAppt(chatId) {
  const rate = db.checkRateLimit(chatId, 'appt_create', RATE_APPT, RATE_APPT_WIN);
  if (!rate.allowed) {
    return send(chatId, t('uz', 'rateLimited', rate.retryAfterSec), kb.mainMenu());
  }
  db.setSession(chatId, 'appt_doctor', {});
  send(chatId, `📅 *Qabulga yozilish*\n\nShifokorni tanlang:`, kb.doctorPicker());
}

async function handleStartAi(chatId) {
  if (!process.env.CLAUDE_API_KEY) {
    return send(chatId, `${t('uz','aiUnavailable')}\n\n📞 ${escapeMd(CLINIC.phone)}`, kb.mainMenu());
  }
  const rate = db.checkRateLimit(chatId, 'ai_chat', RATE_AI, RATE_AI_WIN);
  if (!rate.allowed) {
    return send(chatId, t('uz', 'rateLimited', rate.retryAfterSec), kb.mainMenu());
  }
  db.setSession(chatId, 'ai_start', { history: [], symptoms: null, questionCount: 0 });
  send(chatId,
    `🤖 *AI Maslahatchi*\n\n` +
    `Belgilaringizni *batafsil* yozing.\n\n` +
    `_Misol:_\n` +
    `• _"3 kundan beri yo'tal va isitma, tomog'im og'riyapti"_\n` +
    `• _"Boshim qattiq og'riydi, ayniqsa chap tomonda, ko'nglim ayniydi"_\n` +
    `• _"Bolam 5 yoshda, 2 kundan beri terisida toshmalar chiqdi"_\n\n` +
    `${t('uz','disclaimer')}`,
    kb.cancelMenu(),
  );
}

async function handleMyAppointments(chatId) {
  const appts = db.recentAppointments(chatId);
  if (!appts.length) {
    return send(chatId, '📂 Sizda hali qabullar yo\'q.', kb.mainMenu());
  }
  let text = `📂 *Mening qabullarim*\n\n`;
  for (const a of appts) {
    const doc = doctorById(a.doctor_id);
    const statusEmoji = a.status === 'confirmed' ? '✅' : a.status === 'cancelled' ? '❌' : a.status === 'completed' ? '✔️' : '⏳';
    text += `${statusEmoji} *${escapeMd(doc?.name || 'Shifokor')}*\n`;
    text += `   📅 ${a.appt_date} — ⏰ ${a.appt_time}\n`;
    text += `   _Holat: ${escapeMd(a.status)}_\n\n`;
  }
  send(chatId, text, kb.mainMenu());
}

// ─── AI FLOW ─────────────────────────────────────────────────────────────────
async function handleAiStep(chatId, msg, session, text) {
  if (text.length > 1000) {
    return send(chatId, "⚠️ Iltimos, qisqaroq yozing (max 1000 belgi).");
  }
  if (session.payload.questionCount >= 5) {
    db.clearSession(chatId);
    return send(chatId, "Suhbat juda uzun. Iltimos, qayta boshlang yoki operator bilan bog'laning.", kb.mainMenu());
  }

  const history = [...session.payload.history, { role: 'user', content: text }];
  const symptoms = session.payload.symptoms || text;
  const newCount = session.payload.questionCount + 1;

  const wait = await send(chatId, '🤖 Tahlil qilinmoqda...');

  const result = await claude.chat({
    clinicName: CLINIC.name,
    knowledgeBase: KNOWLEDGE_BASE,
    doctors: CLINIC.doctors,
    history,
    latestUserMessage: text,
  });

  if (wait) bot.deleteMessage(chatId, wait.message_id).catch(() => {});

  if (!result.ok) {
    logger.warn('AI chat failed', { chatId, error: result.error });
    db.clearSession(chatId);
    return send(chatId, `Kechirasiz, AI hozir javob bera olmadi.\n📞 ${escapeMd(CLINIC.phone)}`, kb.mainMenu());
  }

  const data = result.data;

  // Force final if too many turns
  const shouldFinalize = data.mode === 'final' || newCount >= 4;

  if (!shouldFinalize && data.mode === 'question' && data.question) {
    history.push({ role: 'assistant', content: JSON.stringify({ mode: 'question', question: data.question }) });
    db.setSession(chatId, 'ai_questioning', {
      history,
      symptoms,
      questionCount: newCount,
    });
    return send(chatId, `🤖 ${escapeMd(data.question)}\n\n${t('uz','disclaimer')}`, kb.cancelMenu());
  }

  // Finalize
  const doctorId = parseInt(data.doctorId, 10);
  const doctor = doctorById(doctorId);
  const concern = String(data.concern || symptoms).slice(0, 500);
  const recommendation = String(data.recommendation || '').slice(0, 800);

  const reportText =
    `🤖 *AI Yo'naltirish*\n\n` +
    `*Sizning muammo:*\n_${escapeMd(concern)}_\n\n` +
    (doctor
      ? `*Tavsiya etilgan mutaxassis:*\n🩺 ${escapeMd(doctor.name)} — ${escapeMd(doctor.spec)}\n💰 ${doctor.price.toLocaleString('uz-UZ')} so'm\n📅 ${escapeMd(formatSchedule(doctor.schedule))}\n\n`
      : '*Mutaxassis:* aniqlashda muammo, operatorga murojaat qiling.\n\n') +
    `*Maslahat:*\n${escapeMd(recommendation)}\n\n` +
    `━━━━━━━━━━━━━━━━━━\n${t('uz','disclaimer')}`;

  db.saveAiConsultation({
    chatId,
    symptoms,
    history,
    diagnosis: concern,
    doctorId: doctor?.id || null,
  });

  db.clearSession(chatId);

  await send(chatId, reportText, {
    reply_markup: {
      keyboard: [
        [kb.MENU_BTNS.appointment],
        [kb.MENU_BTNS.operator, '🏠 Asosiy menyu'],
      ],
      resize_keyboard: true,
    },
  });

  // Notify clinic
  const adminText =
    `📋 *AI YO'NALTIRISH*\n` +
    `👤 @${escapeMd(msg.from.username || msg.from.first_name || chatId)}\n` +
    `📅 ${new Date().toLocaleString('uz-UZ')}\n\n` +
    `*Belgilar:* ${escapeMd(symptoms)}\n\n` +
    `*Muammo:* ${escapeMd(concern)}\n` +
    `*Tavsiya:* ${escapeMd(doctor?.name || '—')}`;

  if (doctor) notifyDoctor(doctor.id, adminText);
  else notifyAdmin(adminText);
}

function formatSchedule(schedule) {
  const days = { mon:'Du', tue:'Se', wed:'Cho', thu:'Pa', fri:'Ju', sat:'Sha', sun:'Yak' };
  const parts = [];
  for (const [k, v] of Object.entries(schedule)) {
    if (v) parts.push(`${days[k]}: ${v}`);
  }
  return parts.join(', ');
}

// ─── APPT FLOW ───────────────────────────────────────────────────────────────
async function handleApptStep(chatId, msg, session, text) {
  if (session.step === 'appt_name') {
    const r = validateName(text);
    if (!r.ok) return send(chatId, `⚠️ ${r.error}`);

    db.setSession(chatId, 'appt_phone', { ...session.payload, patientName: r.value });
    return send(chatId,
      `📞 Telefon raqamingizni kiriting yoki tugmani bosing:\n_(masalan: +998 90 123 45 67)_`,
      kb.contactRequest(),
    );
  }

  if (session.step === 'appt_phone') {
    const r = validatePhone(text);
    if (!r.ok) return send(chatId, `⚠️ ${r.error}`);
    db.setSession(chatId, 'appt_review', { ...session.payload, phone: r.value });
    return reviewAppointment(chatId);
  }

  if (session.step === 'appt_review') {
    // No free text expected; user should press confirm
    return send(chatId, "Tasdiqlash tugmasini bosing yoki bekor qiling.");
  }
}

async function reviewAppointment(chatId) {
  const session = db.getSession(chatId);
  if (!session) return;
  const { doctorId, date, time, patientName, phone } = session.payload;
  const doctor = doctorById(doctorId);

  // Double-check availability
  if (!db.isSlotAvailable(doctorId, date, time)) {
    db.clearSession(chatId);
    return send(chatId, "⚠️ Afsuski, bu vaqt endi band. Iltimos, boshqa vaqt tanlang.", kb.mainMenu());
  }

  // Final schedule check
  const dayIdx = new Date(date + 'T00:00:00').getDay();
  const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][dayIdx];
  const avail = checkDoctorAvailability(doctor, dayKey, time);
  if (!avail.ok) {
    db.clearSession(chatId);
    return send(chatId, `⚠️ ${avail.error}`, kb.mainMenu());
  }

  await send(chatId,
    `*Tasdiqlang:*\n\n` +
    `🩺 ${escapeMd(doctor.name)} (${escapeMd(doctor.spec)})\n` +
    `💰 ${doctor.price.toLocaleString('uz-UZ')} so'm\n` +
    `📅 ${date} — ⏰ ${time}\n` +
    `👤 ${escapeMd(patientName)}\n` +
    `📞 ${escapeMd(phone)}`,
    kb.confirmAppointment(),
  );
}

async function confirmAppointment(chatId, messageId) {
  const session = db.getSession(chatId);
  if (!session || session.step !== 'appt_review') {
    return send(chatId, "Sessiya muddati tugagan. Qayta urinib ko'ring.", kb.mainMenu());
  }
  const { doctorId, date, time, patientName, phone } = session.payload;
  const doctor = doctorById(doctorId);

  const result = db.createAppointment({
    chatId,
    doctorId,
    patientName,
    phone,
    date,
    time,
  });

  if (!result.ok) {
    if (result.error === 'slot_taken') {
      return send(chatId, "⚠️ Bu vaqt allaqachon band. Boshqa vaqt tanlang.", kb.mainMenu());
    }
    return send(chatId, "Xatolik. Operatorga murojaat qiling.", kb.mainMenu());
  }

  db.clearSession(chatId);

  const userText =
    `✅ *Qabul tasdiqlandi!*\n\n` +
    `Buyurtma raqami: *#${result.id}*\n\n` +
    `🩺 ${escapeMd(doctor.name)} (${escapeMd(doctor.spec)})\n` +
    `📅 ${date} — ⏰ ${time}\n` +
    `👤 ${escapeMd(patientName)}\n\n` +
    `Operatorimiz tez orada qo'ng'iroq qilib tasdiqlaydi.\n📞 ${escapeMd(CLINIC.phone)}`;

  if (messageId) {
    await editMessageText(userText, { chat_id: chatId, message_id: messageId });
  } else {
    await send(chatId, userText);
  }
  await send(chatId, "Asosiy menyu:", kb.mainMenu());

  // Notify doctor
  notifyDoctor(doctorId,
    `🔔 *YANGI QABUL #${result.id}*\n\n` +
    `🩺 ${escapeMd(doctor.name)}\n` +
    `👤 ${escapeMd(patientName)}\n` +
    `📞 ${escapeMd(phone)}\n` +
    `📅 ${date} — ⏰ ${time}`,
  );
}

// ─── ERROR HANDLING ──────────────────────────────────────────────────────────
bot.on('polling_error', (err) => logger.error('polling_error', { msg: err.message }));
bot.on('webhook_error', (err) => logger.error('webhook_error', { msg: err.message }));
process.on('uncaughtException', (e) => logger.error('uncaughtException', { msg: e.message, stack: e.stack }));
process.on('unhandledRejection', (e) => logger.error('unhandledRejection', { msg: String(e) }));

// ─── SERVER ──────────────────────────────────────────────────────────────────
if (WEBHOOK_URL) {
  const path = `/webhook/${crypto.createHash('sha256').update(TOKEN).digest('hex').slice(0, 32)}`;
  const secret = WEBHOOK_SECRET || crypto.randomBytes(24).toString('hex');

  bot.setWebHook(`${WEBHOOK_URL}${path}`, { secret_token: secret })
    .then(() => logger.info('Webhook set', { url: WEBHOOK_URL + path }))
    .catch(e => logger.error('setWebhook failed', { error: e.message }));

  http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === path) {
      // Verify secret
      const incoming = req.headers['x-telegram-bot-api-secret-token'];
      if (incoming !== secret) {
        logger.warn('Webhook secret mismatch');
        res.writeHead(403); res.end();
        return;
      }
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        try { bot.processUpdate(JSON.parse(body)); }
        catch (e) { logger.error('processUpdate failed', { error: e.message }); }
        res.end('OK');
      });
    } else if (req.url === '/health') {
      res.writeHead(200); res.end('OK');
    } else {
      res.writeHead(200); res.end(`${CLINIC.name} bot ✅`);
    }
  }).listen(PORT, () => {
    logger.info('Webhook server started', {
      port: PORT,
      claude: !!process.env.CLAUDE_API_KEY,
    });
  });
} else {
  http.createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200); res.end('OK'); }
    else { res.writeHead(200); res.end(`${CLINIC.name} bot ✅`); }
  }).listen(PORT);
  logger.info('Polling mode started', {
    port: PORT,
    claude: !!process.env.CLAUDE_API_KEY,
  });
}
