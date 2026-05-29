/**
 * Shared utilities: logger, markdown escape, validators, rate limiter, i18n.
 */

// ─── LOGGER ──────────────────────────────────────────────────────────────────
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const ACTIVE_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? 1;

function log(level, msg, meta = {}) {
  if (LOG_LEVELS[level] < ACTIVE_LEVEL) return;
  const entry = {
    t: new Date().toISOString(),
    level,
    msg,
    ...meta,
  };
  const fn = level === 'error' || level === 'warn' ? console.error : console.log;
  fn(JSON.stringify(entry));
}

const logger = {
  debug: (m, x) => log('debug', m, x),
  info:  (m, x) => log('info',  m, x),
  warn:  (m, x) => log('warn',  m, x),
  error: (m, x) => log('error', m, x),
};

// ─── MARKDOWN ESCAPE ─────────────────────────────────────────────────────────
// Telegram MarkdownV2 reserved chars. We use Markdown (legacy) — escape these:
function escapeMd(input) {
  if (input == null) return '';
  return String(input).replace(/([_*`\[\]])/g, '\\$1');
}

// ─── VALIDATORS ──────────────────────────────────────────────────────────────
function validatePhone(raw) {
  if (!raw) return { ok: false, error: "Telefon raqam bo'sh" };
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) {
    return { ok: false, error: "Telefon raqam 9-15 raqamdan iborat bo'lishi kerak" };
  }
  // Uzbekistan phone heuristic
  let normalized = digits;
  if (normalized.startsWith('998')) normalized = '+' + normalized;
  else if (normalized.length === 9) normalized = '+998' + normalized;
  else if (normalized.startsWith('0') && normalized.length === 12) normalized = '+998' + normalized.slice(1);
  else normalized = '+' + normalized;
  return { ok: true, value: normalized };
}

function validateName(raw) {
  if (!raw) return { ok: false, error: "Ism bo'sh" };
  const trimmed = String(raw).trim();
  if (trimmed.length < 2) return { ok: false, error: "Ism kamida 2 belgi bo'lishi kerak" };
  if (trimmed.length > 80) return { ok: false, error: "Ism juda uzun (80 belgidan oshmasin)" };
  if (!/[a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲÀ-ɏ]/.test(trimmed)) {
    return { ok: false, error: "Ism harflardan iborat bo'lishi kerak" };
  }
  return { ok: true, value: trimmed };
}

function validateTime(raw) {
  if (!raw) return { ok: false, error: "Vaqt bo'sh" };
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { ok: false, error: "Format: HH:MM (masalan 14:30)" };
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) {
    return { ok: false, error: "Vaqt noto'g'ri (00:00 dan 23:59 gacha)" };
  }
  return { ok: true, value: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`, hour: h, minute: min };
}

// Parses date strings: "bugun", "ertaga", "indinga", "DD-MM", "DD.MM", "DD/MM", "DD-MM-YYYY", weekday names
const WEEKDAYS_UZ = {
  dushanba: 1, seshanba: 2, chorshanba: 3, payshanba: 4, juma: 5, shanba: 6, yakshanba: 0,
};

function validateDate(raw) {
  if (!raw) return { ok: false, error: "Sana bo'sh" };
  const text = String(raw).trim().toLowerCase();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const today = new Date(now);
  const target = new Date(now);

  if (text === 'bugun') {
    // accept today
  } else if (text === 'ertaga') {
    target.setDate(today.getDate() + 1);
  } else if (text === 'indinga') {
    target.setDate(today.getDate() + 2);
  } else if (WEEKDAYS_UZ[text] !== undefined) {
    const want = WEEKDAYS_UZ[text];
    let diff = (want - today.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    target.setDate(today.getDate() + diff);
  } else {
    // Try numeric formats
    const m = text.match(/^(\d{1,2})[.\-\/](\d{1,2})(?:[.\-\/](\d{2,4}))?$/);
    if (!m) return { ok: false, error: "Format: 20-04, 20.04.2026, ertaga, dushanba…" };
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    let year = m[3] ? parseInt(m[3], 10) : today.getFullYear();
    if (year < 100) year += 2000;
    target.setFullYear(year, month - 1, day);
    if (target.getDate() !== day || target.getMonth() !== month - 1) {
      return { ok: false, error: "Bunday sana mavjud emas" };
    }
  }

  // Must be today or future, max 90 days ahead
  if (target < today) return { ok: false, error: "O'tgan sanaga yozib bo'lmaydi" };
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 90);
  if (target > maxDate) return { ok: false, error: "90 kundan ko'proq oldindan yozib bo'lmaydi" };

  const iso = target.toISOString().slice(0, 10);
  const dayNames = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
  return {
    ok: true,
    value: iso,
    dayOfWeek: target.getDay(),
    dayKey: ['sun','mon','tue','wed','thu','fri','sat'][target.getDay()],
    pretty: `${String(target.getDate()).padStart(2,'0')}-${String(target.getMonth()+1).padStart(2,'0')}-${target.getFullYear()} (${dayNames[target.getDay()]})`,
  };
}

// Check if doctor works on the given day and the requested time is inside schedule
function checkDoctorAvailability(doctor, dayKey, hhmm) {
  const slot = doctor.schedule?.[dayKey];
  if (!slot) return { ok: false, error: `${doctor.name} bu kuni ishlamaydi` };
  const m = slot.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) return { ok: false, error: "Shifokor jadvali noto'g'ri" };
  const start = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const end = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
  const [h, mi] = hhmm.split(':').map(Number);
  const t = h * 60 + mi;
  if (t < start || t > end - 15) {
    return { ok: false, error: `Vaqt ${slot} ichida bo'lsin (oxirgi qabul: 15 daqiqa qoldirib)` };
  }
  return { ok: true };
}

// ─── i18n ────────────────────────────────────────────────────────────────────
const STRINGS = {
  uz: {
    welcome: (name) => `Salom, *${escapeMd(name)}*! 👋`,
    cancel: "❌ Bekor qilish",
    cancelled: "Bekor qilindi.",
    mainMenu: "🏠 Asosiy menyu",
    invalidChoice: (max) => `⚠️ 1 dan ${max} gacha raqam kiriting.`,
    aiUnavailable: "AI Maslahatchi hozircha mavjud emas.",
    rateLimited: (sec) => `⏳ Juda ko'p so'rov. ${sec} soniyadan keyin qayta urinib ko'ring.`,
    error: "Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
    disclaimer: "⚠️ *MUHIM:* Bu *taxminiy yo'nalish*, tibbiy tashxis EMAS. Aniq tashxis va davolash uchun shifokor ko'rigi MAJBURIY.",
  },
  ru: {
    welcome: (name) => `Здравствуйте, *${escapeMd(name)}*! 👋`,
    cancel: "❌ Отмена",
    cancelled: "Отменено.",
    mainMenu: "🏠 Главное меню",
    invalidChoice: (max) => `⚠️ Введите число от 1 до ${max}.`,
    aiUnavailable: "AI-помощник временно недоступен.",
    rateLimited: (sec) => `⏳ Слишком много запросов. Попробуйте через ${sec} сек.`,
    error: "Произошла ошибка. Попробуйте ещё раз.",
    disclaimer: "⚠️ *ВАЖНО:* Это *предварительная рекомендация*, не медицинский диагноз. Обязательно посещение врача.",
  },
};

function t(lang, key, ...args) {
  const s = STRINGS[lang]?.[key] ?? STRINGS.uz[key];
  return typeof s === 'function' ? s(...args) : s;
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────
module.exports = {
  logger,
  escapeMd,
  validatePhone,
  validateName,
  validateTime,
  validateDate,
  checkDoctorAvailability,
  t,
};
