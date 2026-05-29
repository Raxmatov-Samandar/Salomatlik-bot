/**
 * Clinic data + RAG knowledge base.
 * Doctors' telegram_id should be filled in via `npm run db:reset` then SQL, or env override.
 */

const CLINIC = {
  name: "Salomatlik Klinikasi",
  established: "2010",
  address: "Toshkent, Yunusobod tumani, 5-mavze, 12-uy",
  phone: "+998 71 123 45 67",
  whatsapp: "+998 90 123 45 67",
  mapLat: 41.2995,
  mapLng: 69.2401,
  workingHours: {
    "Dushanba – Juma": "08:00 – 20:00",
    "Shanba": "09:00 – 17:00",
    "Yakshanba": "Dam olish kuni",
  },
  doctors: [
    {
      id: 1, name: "Dr. Aziz Karimov", spec: "Terapevt", exp: "15 yil",
      price: 80_000, telegramId: null,
      bio: "Toshkent Tibbiyot Akademiyasini 2008-yilda tamomlagan. Germaniyada malaka oshirgan. Yurak-qon tomir va nafas yo'li kasalliklarida ixtisoslashgan.",
      schedule: { mon: "09:00-17:00", tue: "09:00-17:00", wed: "09:00-17:00", thu: "09:00-17:00", fri: "09:00-17:00", sat: "09:00-13:00", sun: null },
      treats: ["gripp", "shamollash", "bronxit", "pnevmoniya", "gipertenziya", "umumiy tekshiruv", "isitma"],
    },
    {
      id: 2, name: "Dr. Malika Yusupova", spec: "Kardiolog", exp: "12 yil",
      price: 120_000, telegramId: null,
      bio: "Yurak kasalliklari bo'yicha oliy malakali mutaxassis. EKG va EXO-KG tekshiruvlarini o'tkazadi. 500+ muvaffaqiyatli bemor.",
      schedule: { mon: "10:00-18:00", tue: "10:00-18:00", wed: "10:00-18:00", thu: "10:00-18:00", fri: "10:00-18:00", sat: null, sun: null },
      treats: ["yurak og'rig'i", "aritmiya", "gipertenziya", "stenokardiya", "yurak yetishmovchiligi", "EKG", "yurak urishi"],
    },
    {
      id: 3, name: "Dr. Bobur Toshmatov", spec: "Nevropatolog", exp: "10 yil",
      price: 120_000, telegramId: null,
      bio: "Asab tizimi kasalliklari mutaxassisi. Bosh og'rig'i, migren, osteoxondroz davolashda katta tajribaga ega.",
      schedule: { mon: "09:00-17:00", tue: "09:00-17:00", wed: "09:00-17:00", thu: "09:00-17:00", fri: "09:00-17:00", sat: "09:00-17:00", sun: null },
      treats: ["bosh og'rig'i", "migren", "osteoxondroz", "uyqusizlik", "depressiya", "insult", "epilepsiya", "asab"],
    },
    {
      id: 4, name: "Dr. Nodira Aliyeva", spec: "Ginekolog", exp: "18 yil",
      price: 100_000, telegramId: null,
      bio: "Ayollar salomatligi bo'yicha eng tajribali mutaxassislardan biri. Homiladorlik, tug'ruq va ginekologik kasalliklarni davolaydi.",
      schedule: { mon: "08:00-16:00", tue: "08:00-16:00", wed: "08:00-16:00", thu: "08:00-16:00", fri: "08:00-16:00", sat: "08:00-12:00", sun: null },
      treats: ["homiladorlik", "ginekologik kasalliklar", "oylik buzilishi", "kista", "mioma", "STI", "ayollar salomatligi"],
    },
    {
      id: 5, name: "Dr. Sardor Xoliqov", spec: "Urolog", exp: "8 yil",
      price: 100_000, telegramId: null,
      bio: "Siydik-tanosil tizimi kasalliklari mutaxassisi. Zamonaviy endoskopik usullar bilan davolaydi.",
      schedule: { mon: "10:00-18:00", tue: "10:00-18:00", wed: "10:00-18:00", thu: "10:00-18:00", fri: "10:00-18:00", sat: "10:00-18:00", sun: null },
      treats: ["siydik yo'li kasalliklari", "prostatit", "buyrak toshi", "sistit", "potentsiya"],
    },
    {
      id: 6, name: "Dr. Zulfiya Raximova", spec: "Pediatr", exp: "14 yil",
      price: 90_000, telegramId: null,
      bio: "Bolalar shifokori, 0-16 yosh. Bolalar kasalliklari va rivojlanishi bo'yicha mutaxassis.",
      schedule: { mon: "08:00-17:00", tue: "08:00-17:00", wed: "08:00-17:00", thu: "08:00-17:00", fri: "08:00-17:00", sat: "08:00-17:00", sun: null },
      treats: ["bolalar kasalliklari", "isitma", "yo'tal", "allergiya", "emlash", "rivojlanish"],
    },
    {
      id: 7, name: "Dr. Kamol Mirzayev", spec: "Oftalmolog", exp: "11 yil",
      price: 110_000, telegramId: null,
      bio: "Ko'z kasalliklari mutaxassisi. Ko'z bosimi, katarakt, ko'rish buzilishlari davolashda ixtisoslashgan.",
      schedule: { mon: "09:00-17:00", tue: "09:00-17:00", wed: "09:00-17:00", thu: "09:00-17:00", fri: "09:00-17:00", sat: null, sun: null },
      treats: ["ko'z qizarishi", "ko'z og'rig'i", "ko'rish yomonlashishi", "ko'z bosimi", "katarakt", "konyunktivit"],
    },
    {
      id: 8, name: "Dr. Dilnoza Xasanova", spec: "Dermatolog", exp: "9 yil",
      price: 100_000, telegramId: null,
      bio: "Teri kasalliklari va kosmetologiya mutaxassisi. Ekzema, psoriaz, akne davolashda tajribali.",
      schedule: { mon: "10:00-18:00", tue: "10:00-18:00", wed: "10:00-18:00", thu: "10:00-18:00", fri: "10:00-18:00", sat: "10:00-18:00", sun: null },
      treats: ["ekzema", "psoriaz", "akne", "teri qichishi", "toshmalar", "zamburug'", "allergik dermatit"],
    },
    {
      id: 9, name: "Dr. Jasur Tursunov", spec: "Ortoped", exp: "13 yil",
      price: 120_000, telegramId: null,
      bio: "Suyak va bo'g'im kasalliklari mutaxassisi. Artrit, artroz, umurtqa kasalliklarini davolaydi.",
      schedule: { mon: "09:00-17:00", tue: "09:00-17:00", wed: "09:00-17:00", thu: "09:00-17:00", fri: "09:00-17:00", sat: null, sun: null },
      treats: ["bo'g'im og'rig'i", "bel og'rig'i", "artrit", "artroz", "suyak sinishi", "umurtqa"],
    },
    {
      id: 10, name: "Dr. Maftuna Ergasheva", spec: "Endokrinolog", exp: "10 yil",
      price: 110_000, telegramId: null,
      bio: "Gormon va modda almashinuvi kasalliklari mutaxassisi. Diabet, qalqonsimon bez kasalliklari.",
      schedule: { mon: "09:00-17:00", tue: "09:00-17:00", wed: "09:00-17:00", thu: "09:00-17:00", fri: "09:00-17:00", sat: "09:00-17:00", sun: null },
      treats: ["diabet", "qalqonsimon bez", "semirish", "hormon buzilishi", "osteoporoz"],
    },
  ],
  services: [
    { name: "Terapevt maslahati",        price: 80_000  },
    { name: "Kardiolog maslahati",        price: 120_000 },
    { name: "Ginekolog maslahati",        price: 100_000 },
    { name: "Pediatr maslahati",          price: 90_000  },
    { name: "Oftalmolog maslahati",       price: 110_000 },
    { name: "Dermatolog maslahati",       price: 100_000 },
    { name: "Nevropatolog maslahati",     price: 120_000 },
    { name: "Urolog maslahati",           price: 100_000 },
    { name: "Ortoped maslahati",          price: 120_000 },
    { name: "Endokrinolog maslahati",     price: 110_000 },
    { name: "UZI (qorin bo'shlig'i)",     price: 80_000  },
    { name: "UZI (ginekologik)",          price: 90_000  },
    { name: "UZI (yurak — EXO-KG)",       price: 120_000 },
    { name: "Qon tahlili (umumiy)",       price: 35_000  },
    { name: "Qon tahlili (to'liq panel)", price: 150_000 },
    { name: "Siydik tahlili",             price: 25_000  },
    { name: "Qand (glyukoza) tahlili",    price: 20_000  },
    { name: "EKG",                        price: 50_000  },
    { name: "MRT",                        price: 350_000 },
    { name: "KT (kompyuter tomografiya)", price: 400_000 },
    { name: "Rentgen",                    price: 45_000  },
    { name: "Massaj (1 seans)",           price: 60_000  },
    { name: "Tish tekshiruvi",            price: 50_000  },
  ],
  discounts: [
    "Pensionerlar (65+): 15% chegirma",
    "Talabalar: 10% chegirma (talaba guvohnomasi bilan)",
    "Birinchi tashrif: 10% chegirma",
    "Kompleks tekshiruv (5+ xizmat): 20% chegirma",
    "Sug'urta orqali: to'lov sug'urta kompaniyasiga qarab",
  ],
};

const KNOWLEDGE_BASE = `
=== SALOMATLIK KLINIKASI — TO'LIQ MA'LUMOT BAZASI ===

KLINIKA HAQIDA:
- 2010-yildan buyon ishlamoqda, 14+ yillik tajriba
- 10 ta mutaxassis shifokor, 23+ tibbiy xizmat
- Zamonaviy MRT, KT, UZI, laboratoriya jihozlari
- Dorixona klinika ichida mavjud
- Sug'urta: Uzbekinvest, Gross, Alpha Insurance qabul qilinadi

PROTOKOLLAR:
- Qabulga yozilish: 1-2 kun oldin tavsiya etiladi
- Kechikish: 15 daqiqadan ko'p kechiksa, navbat keyinga suriladi
- Tahlil natijalari: umumiy qon 2 soat, to'liq panel 1 kun
- MRT/KT natijasi: 2-4 soat
- Bolalar (16 yoshgacha): ota-onasi bilan kelishi shart
- Homilador ayollar: ustunlik beriladi

TEZ-TEZ BERILADIGAN SAVOLLAR:
S: Qon tahlili uchun ro'za tutish kerakmi?
J: Glyukoza va lipid tahlili uchun 8-12 soat ro'za tutish kerak. Umumiy qon uchun shart emas.

S: MRT uchun tayyorgarlik kerakmi?
J: Metall implant, kardiostimulyator bo'lsa OLDINDAN aytish shart. Qorin MRT uchun 4 soat ovqat yeymaslik kerak.

S: Bolani yolg'iz yuborishim mumkinmi?
J: 16 yoshgacha ota-ona yoki vasiy bilan kelish shart.

S: Natijalarni online olsa bo'ladimi?
J: Ha, Telegram orqali yuboriladi.

KASALLIKLAR VA SHIFOKORLAR ALOQASI:
- Bosh og'rig'i, migren → Nevropatolog (Dr. Toshmatov)
- Yurak og'rig'i, bosim, yurak urishi → Kardiolog (Dr. Yusupova)
- Ko'z muammolari → Oftalmolog (Dr. Mirzayev)
- Teri muammolari → Dermatolog (Dr. Xasanova)
- Bel, bo'g'im og'rig'i → Ortoped (Dr. Tursunov)
- Qand kasalligi, vazn, gormon → Endokrinolog (Dr. Ergasheva)
- Bolalar (0-16 yosh) kasalliklari → Pediatr (Dr. Raximova)
- Ayollar muammolari, homiladorlik → Ginekolog (Dr. Aliyeva)
- Siydik muammolari, prostatit → Urolog (Dr. Xoliqov)
- Shamollash, gripp, umumiy tekshiruv → Terapevt (Dr. Karimov)
`;

module.exports = { CLINIC, KNOWLEDGE_BASE };
