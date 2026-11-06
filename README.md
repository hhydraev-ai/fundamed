# FUNDAMED

**Osiyo Xalqaro Universiteti (OXU) Fundamental tibbiyot kafedrasi** uchun boshqaruv tizimi: vazifalar, hujjatlar, bilimlar bazasi, hisobotlar va o‘zbek tilini tushunadigan AI yordamchi.

## Arxitektura

| Qism | Texnologiya | Izoh |
|---|---|---|
| Sayt | Statik HTML + JavaScript (GitHub Pages) | Server kodi yo‘q, kutubxonalar `vendor/` papkasida (CDN’siz) |
| Kirish | Supabase Auth | Akkauntlarni faqat administrator ochadi; `parol.html` — taklif orqali parol o‘rnatish |
| Baza | Supabase PostgreSQL + RLS | `staff_profiles`, `department_tasks`, `department_documents` + bilimlar bazasi jadvallari |
| Fayllar | Supabase Storage (`department-documents`, maxfiy) | Fayllar faqat 60 soniyalik imzolangan havola orqali ochiladi |
| Hujjat tahlili | Brauzerda: ExcelJS, mammoth, pdf.js | Fayl mazmuni tashqi xizmatga yuborilmaydi |
| Hisobot fayllari | Brauzerda: docx, pdfmake, ExcelJS | Word, PDF, Excel |
| AI yordamchi | Oflayn o‘zbekcha NLU + ixtiyoriy til modeli (Supabase Edge Function) | Til modeli kaliti faqat Supabase Secrets’da |

**Muhim:** `js/config.js` dagi Supabase *publishable* kaliti brauzer uchun mo‘ljallangan va ochiq bo‘lishi mumkin. Ma’lumotni faqat bazadagi **RLS siyosatlari** himoya qiladi. `service_role`, `sb_secret_…` yoki AI provayder kalitlari hech qachon repozitoriyaga yozilmaydi.

## Sahifalar

| Sahifa | Vazifasi | Kim uchun |
|---|---|---|
| `index.html` | Bosh sahifa | Hamma |
| `login.html`, `parol.html` | Kirish, parol o‘rnatish | Xodimlar |
| `dashboard.html` | Ko‘rsatkichlar, kechikkan ishlar, yuklama | Xodimlar |
| `vazifalar.html` | Vazifa yaratish/tahrirlash (boshqaruv rollari), holat, qidiruv | Xodimlar |
| `hisobotlar.html` | Vazifalar hisoboti: Word, PDF, Excel, CSV | Xodimlar |
| `hujjatlar.html` | Xavfsiz yuklash, mazmunini tahlil qilish | Yuklash/tahlil — boshqaruv rollari |
| `bilimlar.html` | Hujjatlardan qidirish, qarama-qarshi va yetishmayotgan ma’lumotlar | Xodimlar (faqat ruxsatli hujjatlar) |
| `ai-agent.html` | O‘zbekcha topshiriqlar, Excel shablon to‘ldirish, Word/PDF tayyorlash | Xodimlar |
| `jamoa.html` | Xodimlar ro‘yxati va yuklamasi | Xodimlar |
| `sinov.html` | Oflayn sinov paneli (faqat shu brauzerda) | Sinov uchun |

Boshqaruv rollari: `superadmin`, `head` (kafedra mudiri), `deputy`, `coordinator`. Hujjatni o‘chirish: `superadmin`, `head`.

## AI yordamchi nimalar qila oladi

- «Kechikkan vazifalarni ko‘rsat», «Karimovga biriktirilgan vazifalar», «Shu haftadagi vazifalar», «Kimda ko‘p vazifa?»
- «Каримовнинг лавозими қандай?» — kirill yozuvini ham tushunadi; javob hujjat va joylashuv (varaq/qator/sahifa) bilan beriladi
- «Qarama-qarshi ma’lumotlar», «Yetishmayotgan ma’lumotlar»
- «Kechikkan vazifalar bo‘yicha Word hisobot tayyorla», «Karimov haqida PDF ma’lumotnoma»
- Excel shablonni biriktirib «shablonni to‘ldir» — formatlash va formulalar saqlanadi, mavjud kataklar o‘zgarmaydi

**Ma’lumot o‘ylab topilmaydi:** topilmagan katak bo‘sh qoladi va **sariq** rangda belgilanadi, hujjatlar bir-biriga zid bo‘lsa — **to‘q sariq**, barcha holatlar «FUNDAMED tekshiruv» varag‘ida manbasi bilan ro‘yxatlanadi.

## O‘rnatish (administrator uchun)

1. **Bilimlar bazasi migratsiyasi** — Supabase → SQL Editor’da bajaring:
   `supabase/migrations/20261106120000_document_intelligence.sql`
   (takror bajarish xavfsiz; mavjud jadvallar va siyosatlarni o‘zgartirmaydi; hujjatlar omborini ommaviy emas qilib, hajm va turini server tomonida cheklaydi).
2. **Xavfsizlik tekshiruvi** — `supabase/audit/security_check.sql` ni bajaring (faqat o‘qiydi) va natijalarni `docs/AUDIT.md` dagi tavsiyalar bilan solishtiring.
3. **Supabase Auth sozlamasi** — Authentication → Policies: parol uzunligi kamida 12, «Leaked password protection» yoqilgan bo‘lsin; «Allow new users to sign up» o‘chirilgan bo‘lsin.
4. **Til modeli (ixtiyoriy, egasining roziligi bilan)** — standart holatda o‘chiq. Ulash uchun bepul OpenAI-mos xizmat (masalan, Groq bepul tarifi) kaliti olinadi va:
   ```bash
   supabase secrets set LLM_API_KEY=... LLM_BASE_URL=https://api.groq.com/openai/v1 LLM_MODEL=llama-3.3-70b-versatile ALLOWED_ORIGINS=https://hhydraev-ai.github.io
   supabase functions deploy ai-agent
   ```
   Til modeliga faqat savolga mos hujjat parchalari yuboriladi; telefon, email, pasport, JShShIR yashiriladi; maxfiy maydonlar umuman yuborilmaydi; har bir foydalanuvchi uchun soatlik limit bor (`AI_HOURLY_LIMIT`, standart 30). Bepul tariflarning ma’lumotdan foydalanish shartlarini ulashdan oldin o‘qing.

## Testlar

```bash
npm install
npm test            # unit testlar (NLU, tahlil, fayl tekshiruvi, shablon rejasi)
npm run test:sql    # migratsiya va RLS siyosatlari (PGlite — WASM PostgreSQL)
npm run test:e2e    # barcha sahifalar Chromium’da, soxta Supabase bilan (Playwright kerak)
```

Testlar faqat to‘qima ma’lumotlardan foydalanadi va haqiqiy Supabase’ga ulanmaydi.

## Cheklovlar

- Skanerlangan (rasm) PDF’lar uchun OCR yo‘q — tizim buni ogohlantiradi.
- Eski `.xls` va `.doc` fayllar saqlanadi, lekin mazmuni tahlil qilinmaydi (`.xlsx`/`.docx` ga o‘tkazish kerak).
- Oflayn NLU qoidaviy: erkin, murakkab savollarga hujjat parchalari bilan javob beradi; yaxlit matnli javob uchun til modeli rejimi kerak.
- Supabase bepul tarifi chegaralari: 500 MB baza, 1 GB fayl ombori.

## Xavfsizlik qoidalari

Repozitoriya **ochiq**. Unga parollar, maxfiy kalitlar, xodimlar yoki talabalarning shaxsiy ma’lumotlari va kafedra hujjatlarini joylamang. Batafsil: `docs/AUDIT.md`.
