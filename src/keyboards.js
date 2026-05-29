/**
 * Reply keyboards and inline keyboards.
 */

const { CLINIC } = require('./config');

const MENU_BTNS = {
  services:    "📋 Xizmatlar va narxlar",
  hours:       "🕐 Ish vaqti",
  doctors:     "👨‍⚕️ Shifokorlar",
  appointment: "📅 Qabulga yozilish",
  address:     "📍 Manzil",
  operator:    "📞 Operator",
  ai:          "🤖 AI Maslahatchi",
  myAppts:     "📂 Mening qabullarim",
  language:    "🌐 Til / Язык",
};

function mainMenu() {
  return {
    reply_markup: {
      keyboard: [
        [MENU_BTNS.services, MENU_BTNS.hours],
        [MENU_BTNS.doctors, MENU_BTNS.appointment],
        [MENU_BTNS.address, MENU_BTNS.operator],
        [MENU_BTNS.ai, MENU_BTNS.myAppts],
        [MENU_BTNS.language],
      ],
      resize_keyboard: true,
    },
  };
}

function cancelMenu(label = '❌ Bekor qilish') {
  return {
    reply_markup: {
      keyboard: [[label]],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  };
}

function contactRequest(label = '📱 Raqamni yuborish') {
  return {
    reply_markup: {
      keyboard: [
        [{ text: label, request_contact: true }],
        ['❌ Bekor qilish'],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}

function languagePicker() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🇺🇿 O'zbek", callback_data: 'lang:uz' },
          { text: '🇷🇺 Русский', callback_data: 'lang:ru' },
        ],
      ],
    },
  };
}

function doctorPicker() {
  const rows = [];
  for (let i = 0; i < CLINIC.doctors.length; i += 2) {
    const row = [];
    row.push({
      text: `${i + 1}. ${CLINIC.doctors[i].spec}`,
      callback_data: `doc:${CLINIC.doctors[i].id}`,
    });
    if (CLINIC.doctors[i + 1]) {
      row.push({
        text: `${i + 2}. ${CLINIC.doctors[i + 1].spec}`,
        callback_data: `doc:${CLINIC.doctors[i + 1].id}`,
      });
    }
    rows.push(row);
  }
  rows.push([{ text: '❌ Bekor qilish', callback_data: 'cancel' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

/**
 * Generate next 14 days as date inline buttons.
 */
function datePicker(doctor) {
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayNamesUz = ['Yak', 'Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = [];
  let row = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayKey = dayKeys[d.getDay()];
    if (!doctor.schedule[dayKey]) continue;
    const iso = d.toISOString().slice(0, 10);
    const label = i === 0
      ? `Bugun ${d.getDate()}`
      : i === 1
      ? `Ertaga ${d.getDate()}`
      : `${dayNamesUz[d.getDay()]} ${d.getDate()}`;
    row.push({ text: label, callback_data: `date:${iso}` });
    if (row.length === 3) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  rows.push([{ text: '❌ Bekor qilish', callback_data: 'cancel' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

/**
 * Generate time slots for a doctor on a given day.
 * Slot every 30 min from schedule start to (end - 15).
 */
function timePicker(doctor, dayKey, takenSlots = []) {
  const slot = doctor.schedule[dayKey];
  if (!slot) return null;
  const m = slot.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) return null;
  const start = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const end = parseInt(m[3], 10) * 60 + parseInt(m[4], 10) - 15;
  const taken = new Set(takenSlots);
  const rows = [];
  let row = [];
  for (let t = start; t <= end; t += 30) {
    const h = Math.floor(t / 60);
    const mm = t % 60;
    const hhmm = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const label = taken.has(hhmm) ? `❌ ${hhmm}` : hhmm;
    row.push({
      text: label,
      callback_data: taken.has(hhmm) ? 'noop' : `time:${hhmm}`,
    });
    if (row.length === 3) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  rows.push([{ text: '❌ Bekor qilish', callback_data: 'cancel' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function confirmAppointment() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Tasdiqlash", callback_data: 'appt:confirm' },
          { text: '❌ Bekor', callback_data: 'cancel' },
        ],
      ],
    },
  };
}

module.exports = {
  MENU_BTNS,
  mainMenu,
  cancelMenu,
  contactRequest,
  languagePicker,
  doctorPicker,
  datePicker,
  timePicker,
  confirmAppointment,
};
