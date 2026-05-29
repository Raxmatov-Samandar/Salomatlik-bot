# 24/7 Deploy — Railway

Botni Railway'ga deploy qilish — 10-15 daqiqa, kod o'zgartirish shart emas.

## 1. Railway akkount yarating

1. [railway.com](https://railway.com) ga o'ting
2. **Login with GitHub** bosing (Raxmatov-Samandar akkountingiz bilan)
3. Email tasdiqlang (agar so'rasa)

Railway sizga **$5/oy bepul kredit** beradi. Kichik bot uchun **bir oy yetadi** (taxminan $1-3 sarflanadi).

## 2. Yangi loyiha yarating

1. Dashboard'da **+ New Project** bosing
2. **Deploy from GitHub repo** tanlang
3. Birinchi marta bo'lsa, GitHub'ga ruxsat bering (Authorize Railway)
4. `Raxmatov-Samandar/Salomatlik-bot` repo'sini tanlang
5. Railway avtomatik aniqlaydi: Node.js loyihasi → `npm install` → `npm start`

## 3. Environment variables qo'shing

1. Loyiha sahifasida **Variables** tab'ga o'ting
2. **+ New Variable** bosing va quyidagilarni birma-bir qo'shing:

```
BOT_TOKEN=<sizning_bot_tokeningiz>
ADMIN_CHAT_ID=<sizning_chat_id>
CLAUDE_API_KEY=<sizning_anthropic_keyingiz>
CLAUDE_MODEL=claude-haiku-4-5
DB_PATH=/app/data/clinic.db
LOG_LEVEL=info
SESSION_TTL_MIN=30
RATE_LIMIT_AI=5
RATE_LIMIT_AI_WINDOW_MIN=1
RATE_LIMIT_APPT=3
RATE_LIMIT_APPT_WINDOW_MIN=60
```

> Tokenlarning haqiqiy qiymatlari sizning local `.env` faylingizda — Railway'ga shu yerdan ko'chirib joylashtiring.

Yoki **Raw Editor** orqali hammasini birga joylashtiring.

## 4. Volume qo'shing (DB doimiy saqlanishi uchun)

SQLite faylini saqlashi uchun Volume kerak — bo'lmasa har deploy'da DB tozalanadi.

1. **Settings** tab → **Volumes** bo'limi
2. **+ New Volume** bosing
3. **Mount path:** `/app/data`
4. **Add** bosing

## 5. Deploy ishga tushadi

Railway avtomatik build qiladi va botni ishga tushiradi. **Deployments** tab'da log'larni ko'rishingiz mumkin.

Muvaffaqiyatli log:
```
{"t":"...","level":"info","msg":"Polling mode started","port":3000,"claude":true}
```

## 6. Tekshiring

Telegram'da [@Salomatlik_Clinic_UZ_Bot](https://t.me/Salomatlik_Clinic_UZ_Bot) ga `/start` yuboring.

Bot endi **kompyuteringiz o'chirilsa ham** 24/7 ishlaydi.

---

## Update qilish

Kodga o'zgartirish kirsangiz:

```bash
cd C:\clinic-bot-pro
git add -A
git commit -m "Update: <nima qildingiz>"
git push
```

Railway GitHub push'ni avtomatik aniqlaydi va **qayta deploy qiladi** (1-2 daqiqa).

## Monitoring

- **Deployments** — har bir push uchun alohida build/deploy tarixi
- **Logs** — real-vaqt server log'lari (JSON formatda)
- **Metrics** — CPU, RAM, network ishlatilishi
- **Usage** — qancha kredit sarflandi

## Telegram'da kelganidan ko'ra qulay

Variant — har AI yo'naltirish/qabul kelganda **sizning ADMIN telegram'ingizga** alohida xabar boradi (allaqachon sozlangan, `ADMIN_CHAT_ID=7240820925`).

## Muammolar

**"Build failed"** — Deployments → log'ni o'qing. Odatda env var yetishmaydi.

**"Bot javob bermayapti"** — Variables tab'da BOT_TOKEN to'g'ri yozilganmi tekshiring.

**"DB tozalanib qoldi"** — Volume `/app/data` ga mount qilinmaganmi tekshiring.

**Free kredit tugadi** — $5 kredit oxiriga yetganda Railway sizga email yuboradi. To'lov rejimini yoqing yoki kichik VPS'ga ko'chiring (DigitalOcean $4/oy).
