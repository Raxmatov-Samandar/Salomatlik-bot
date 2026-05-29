# Clinic Bot Pro (v3)

Production-ready Telegram bot for a medical clinic with AI-powered triage,
appointment booking with slot calendar, persistent SQLite storage, rate
limiting, anti-prompt-injection AI wrapping, and i18n (UZ/RU).

## Yaxshilanishlar (v2 dan v3 ga)

| # | Muammo (v2) | Yechim (v3) |
|---|-------------|-------------|
| 1 | In-memory state | SQLite + TTL sessions |
| 2 | DB yo'q | better-sqlite3, 7 jadval |
| 3 | Idempotency yo'q | UNIQUE constraint slot, double-booking yo'q |
| 4 | Validation yo'q | Phone (E.164), name, date (10+ format), time |
| 5 | Doctor matching zaif | AI JSON `doctorId` qaytaradi + keyword fallback |
| 6 | Prompt injection | `<<<USER_INPUT_START/END>>>` markerlar + system warning |
| 7 | Hardcoded 3 ta savol | Dinamik 1-4 ta (AI o'zi `mode: final` qaytaradi) |
| 8 | Markdown injection | `escapeMd()` har bir foydalanuvchi inputida |
| 9 | "Tashxis" so'zi | "Yo'naltirish", "mutaxassis tavsiyasi", mandatory disclaimer |
| 10 | Regex menu tartibsiz | Aniq `===` solishtirish |
| 11 | Rate limit yo'q | DB orqali window-based (AI 5/daq, Appt 3/soat) |
| 12 | Model nomi | env'dan `CLAUDE_MODEL`, default `claude-haiku-4-5` |
| 13 | `doctor.telegram_id: null` | `doctor_telegram` jadvalida saqlash, fallback admin |
| 14 | /help, /cancel yo'q | Qo'shildi: /start /help /cancel /lang /myappts |
| 15 | Error handling kam | Global handlers, try/catch har joyda, fallback non-MD send |
| 16 | Cyrillic typo | Lotin harflarga o'zgartirildi |
| 17 | Working hours emas | Inline calendar faqat ish kunlarini ko'rsatadi |
| 18 | Date/time freetext | Inline keyboard: date picker + time slot picker |
| 19 | Webhook secret | `secret_token` header tekshiriladi |
| 20 | Logger yo'q | Structured JSON logger (level configurable) |

## O'rnatish

```bash
git clone <repo>
cd clinic-bot-pro
npm install
cp .env.example .env
# .env ichini to'ldiring (BOT_TOKEN, CLAUDE_API_KEY, ADMIN_CHAT_ID)
npm start
```

## Komandalar

- `/start` — botni boshlash
- `/help` — yordam
- `/cancel` — joriy amalni bekor qilish
- `/lang` — tilni o'zgartirish (UZ/RU)
- `/myappts` — buyurtmalarim

## Arxitektura

```
clinic-bot-pro/
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── data/                 # SQLite DB (auto-created)
└── src/
    ├── bot.js            # Telegram handlers + server
    ├── config.js         # CLINIC data + KNOWLEDGE_BASE
    ├── db.js             # SQLite layer (sessions, appointments, AI logs, rate limits)
    ├── claude.js         # Anthropic API client + JSON contract
    ├── keyboards.js      # Reply + inline keyboard builders
    └── utils.js          # Logger, escapeMd, validators, i18n
```

### DB schema

- `users` — chat_id, lang, name
- `sessions` — TTL conversation state (default 30 daq)
- `appointments` — id, doctor_id, name, phone, date, time, status
   - UNIQUE(`doctor_id, date, time`) WHERE status != 'cancelled' — slot double-booking taqiqlanadi
- `ai_consultations` — symptoms, history (JSON), diagnosis, doctor_id
- `rate_limits` — window-based counter
- `doctor_telegram` — doctor_id → Telegram chat_id mapping (DM uchun)

## Webhook deploy (production)

1. HTTPS endpoint kerak (Cloudflare Tunnel, ngrok yoki o'z domain'ingiz)
2. `.env`:
   ```
   WEBHOOK_URL=https://your-domain.com
   WEBHOOK_SECRET=<random 32+ chars>
   ```
3. `npm start` — webhook avtomatik o'rnatiladi, secret token verifikatsiya bilan.

## Shifokorlar Telegram'ini bog'lash

Default: yangi qabul → adminga ketadi. Har shifokor uchun alohida xabar olish uchun:

```sql
INSERT INTO doctor_telegram (doctor_id, telegram_id) VALUES (1, 123456789);
```

yoki Node REPL'dan:
```js
require('./src/db').setDoctorTelegram(1, 123456789);
```

## Xavfsizlik

- ✅ Webhook secret token (Telegram → server autentifikatsiya)
- ✅ Markdown escape (XSS-style attack'lardan himoya)
- ✅ Prompt injection markers (Claude'ga foydalanuvchi inputi alohida ajratilgan)
- ✅ Rate limiting (DoS va Claude API quota'ni himoya)
- ✅ Phone/name/date validation
- ✅ Slot double-booking taqiqlanadi (DB constraint)
- ⚠️ PII (telefon, ism) DB'da plain saqlanadi — production'da column-level encryption tavsiya etiladi
- ⚠️ AI "tashxis" qo'ymaydi, faqat "yo'naltirish" — mandatory disclaimer har javobda

## TODO (kelajakda)

- [ ] Column-level encryption (better-sqlite3 SEE)
- [ ] Admin panel (qabullarni boshqarish)
- [ ] Reminder bot (qabul oldidan 1 soat avval xabar)
- [ ] Analytics dashboard
- [ ] Test suite (vitest)
