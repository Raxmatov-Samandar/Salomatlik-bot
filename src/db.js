/**
 * SQLite layer: schema, sessions (TTL), appointments, AI consultations, rate limits.
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { logger } = require('./utils');

const DB_PATH = process.env.DB_PATH || './data/clinic.db';
const SESSION_TTL_MIN = parseInt(process.env.SESSION_TTL_MIN || '30', 10);

// Ensure data dir
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ─── SCHEMA ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    chat_id     INTEGER PRIMARY KEY,
    username    TEXT,
    first_name  TEXT,
    lang        TEXT NOT NULL DEFAULT 'uz',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    chat_id     INTEGER PRIMARY KEY,
    step        TEXT NOT NULL,
    payload     TEXT NOT NULL DEFAULT '{}',
    expires_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES users(chat_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id      INTEGER NOT NULL,
    doctor_id    INTEGER NOT NULL,
    patient_name TEXT NOT NULL,
    phone        TEXT NOT NULL,
    appt_date    TEXT NOT NULL,   -- ISO YYYY-MM-DD
    appt_time    TEXT NOT NULL,   -- HH:MM
    status       TEXT NOT NULL DEFAULT 'pending', -- pending|confirmed|cancelled|completed
    notes        TEXT,
    created_at   INTEGER NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES users(chat_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_appt_chat ON appointments(chat_id);
  CREATE INDEX IF NOT EXISTS idx_appt_doctor_date ON appointments(doctor_id, appt_date);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_appt_slot ON appointments(doctor_id, appt_date, appt_time) WHERE status != 'cancelled';

  CREATE TABLE IF NOT EXISTS ai_consultations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id      INTEGER NOT NULL,
    symptoms     TEXT NOT NULL,
    history      TEXT NOT NULL,   -- JSON
    diagnosis    TEXT,
    doctor_id    INTEGER,
    created_at   INTEGER NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES users(chat_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rate_limits (
    chat_id      INTEGER NOT NULL,
    action       TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (chat_id, action)
  );

  CREATE TABLE IF NOT EXISTS doctor_telegram (
    doctor_id    INTEGER PRIMARY KEY,
    telegram_id  INTEGER NOT NULL
  );
`);

// ─── PREPARED STATEMENTS ─────────────────────────────────────────────────────
const stmts = {
  upsertUser: db.prepare(`
    INSERT INTO users (chat_id, username, first_name, lang, created_at, updated_at)
    VALUES (?, ?, ?, COALESCE(?, 'uz'), ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      updated_at = excluded.updated_at
  `),
  getUser: db.prepare(`SELECT * FROM users WHERE chat_id = ?`),
  setLang: db.prepare(`UPDATE users SET lang = ?, updated_at = ? WHERE chat_id = ?`),

  setSession: db.prepare(`
    INSERT INTO sessions (chat_id, step, payload, expires_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(chat_id) DO UPDATE SET
      step = excluded.step,
      payload = excluded.payload,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `),
  getSession: db.prepare(`SELECT * FROM sessions WHERE chat_id = ? AND expires_at > ?`),
  delSession: db.prepare(`DELETE FROM sessions WHERE chat_id = ?`),
  purgeSessions: db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`),

  insertAppt: db.prepare(`
    INSERT INTO appointments (chat_id, doctor_id, patient_name, phone, appt_date, appt_time, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  checkSlotTaken: db.prepare(`
    SELECT 1 FROM appointments
    WHERE doctor_id = ? AND appt_date = ? AND appt_time = ? AND status != 'cancelled'
    LIMIT 1
  `),
  appointmentsByChat: db.prepare(`
    SELECT * FROM appointments
    WHERE chat_id = ?
    ORDER BY appt_date DESC, appt_time DESC
    LIMIT 10
  `),

  insertAi: db.prepare(`
    INSERT INTO ai_consultations (chat_id, symptoms, history, diagnosis, doctor_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  getRate: db.prepare(`SELECT * FROM rate_limits WHERE chat_id = ? AND action = ?`),
  upsertRate: db.prepare(`
    INSERT INTO rate_limits (chat_id, action, window_start, count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(chat_id, action) DO UPDATE SET
      window_start = excluded.window_start,
      count = excluded.count
  `),
  incrRate: db.prepare(`UPDATE rate_limits SET count = count + 1 WHERE chat_id = ? AND action = ?`),

  getDoctorTg: db.prepare(`SELECT telegram_id FROM doctor_telegram WHERE doctor_id = ?`),
  setDoctorTg: db.prepare(`
    INSERT INTO doctor_telegram (doctor_id, telegram_id) VALUES (?, ?)
    ON CONFLICT(doctor_id) DO UPDATE SET telegram_id = excluded.telegram_id
  `),
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function now() { return Date.now(); }

function upsertUser({ chatId, username, firstName, lang }) {
  const t = now();
  stmts.upsertUser.run(chatId, username || null, firstName || null, lang || null, t, t);
  return stmts.getUser.get(chatId);
}

function getUserLang(chatId) {
  return stmts.getUser.get(chatId)?.lang || 'uz';
}

function setLang(chatId, lang) {
  stmts.setLang.run(lang, now(), chatId);
}

function setSession(chatId, step, payload = {}) {
  const t = now();
  const ttl = SESSION_TTL_MIN * 60 * 1000;
  stmts.setSession.run(chatId, step, JSON.stringify(payload), t + ttl, t);
}

function getSession(chatId) {
  const row = stmts.getSession.get(chatId, now());
  if (!row) return null;
  return {
    step: row.step,
    payload: JSON.parse(row.payload),
  };
}

function clearSession(chatId) {
  stmts.delSession.run(chatId);
}

function purgeExpiredSessions() {
  const result = stmts.purgeSessions.run(now());
  if (result.changes > 0) logger.debug('Purged sessions', { count: result.changes });
}

function isSlotAvailable(doctorId, date, time) {
  return !stmts.checkSlotTaken.get(doctorId, date, time);
}

function createAppointment({ chatId, doctorId, patientName, phone, date, time, notes }) {
  if (!isSlotAvailable(doctorId, date, time)) {
    return { ok: false, error: 'slot_taken' };
  }
  const info = stmts.insertAppt.run(chatId, doctorId, patientName, phone, date, time, notes || null, now());
  return { ok: true, id: info.lastInsertRowid };
}

function recentAppointments(chatId) {
  return stmts.appointmentsByChat.all(chatId);
}

function saveAiConsultation({ chatId, symptoms, history, diagnosis, doctorId }) {
  const info = stmts.insertAi.run(
    chatId, symptoms, JSON.stringify(history),
    diagnosis || null, doctorId || null, now(),
  );
  return info.lastInsertRowid;
}

/**
 * Token-bucket-ish: window-based counter.
 * Returns { allowed, retryAfterSec }
 */
function checkRateLimit(chatId, action, maxCount, windowMin) {
  const t = now();
  const windowMs = windowMin * 60 * 1000;
  const current = stmts.getRate.get(chatId, action);

  if (!current || t - current.window_start >= windowMs) {
    // Start new window
    stmts.upsertRate.run(chatId, action, t);
    return { allowed: true };
  }
  if (current.count >= maxCount) {
    const retryAfterSec = Math.ceil((current.window_start + windowMs - t) / 1000);
    return { allowed: false, retryAfterSec };
  }
  stmts.incrRate.run(chatId, action);
  return { allowed: true };
}

function getDoctorTelegram(doctorId) {
  return stmts.getDoctorTg.get(doctorId)?.telegram_id || null;
}

function setDoctorTelegram(doctorId, telegramId) {
  stmts.setDoctorTg.run(doctorId, telegramId);
}

function reset() {
  db.exec(`
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS rate_limits;
  `);
  logger.info('DB reset: sessions and rate_limits dropped');
}

// Background: clean expired sessions every 5 min
setInterval(purgeExpiredSessions, 5 * 60 * 1000);

module.exports = {
  db,
  upsertUser,
  getUserLang,
  setLang,
  setSession,
  getSession,
  clearSession,
  isSlotAvailable,
  createAppointment,
  recentAppointments,
  saveAiConsultation,
  checkRateLimit,
  getDoctorTelegram,
  setDoctorTelegram,
  reset,
};
