# FUNDAMED — kod auditi (2026-11-06)

Tekshirilgan: `login.html`, `parol.html`, `vazifalar.html`, `dashboard.html`, `hisobotlar.html`, `hujjatlar.html`, `ai-agent.html`, `index.html`, `jamoa.html`, `README.md` va git tarixi.

**Git tarixi:** maxfiy kalit (`service_role`, `sb_secret_`, JWT, AI kalitlari) yoki parol topilmadi. Repozitoriyadagi yagona kalit — Supabase *publishable* kaliti, u ochiq bo‘lishi uchun mo‘ljallangan.

## Xavfsizlik

| # | Daraja | Muammo | Holat |
|---|---|---|---|
| S1 | Yuqori | `supabase-js` har sahifada `esm.sh` CDN’dan yaxlitlik tekshiruvisiz yuklanardi — CDN buzilsa, kirish ma’lumotlari va sessiya o‘g‘irlanishi mumkin edi | **Tuzatildi:** barcha kutubxonalar `vendor/` da, aniq versiyalar |
| S2 | Yuqori | Content-Security-Policy yo‘q edi, barcha skriptlar sahifa ichida | **Tuzatildi:** skriptlar alohida fayllarda, `script-src 'self'`, ulanish faqat Supabase’ga |
| S3 | Yuqori | Fayl turi faqat kengaytma bo‘yicha tekshirilardi; makrosli Office, skriptli PDF, `hisobot.exe.pdf` kabi nomlar o‘tib ketardi; serverda hajm/tur cheklovi yo‘q | **Tuzatildi:** ichki imzo (magic bytes), makros, PDF JavaScript, ikki kengaytmali nomlar tekshiriladi. Server tomonidagi cheklov — migratsiyada (bajarilishi kerak) |
| S4 | Yuqori | RLS siyosatlari repozitoriyada yo‘q — ruxsatlar faqat interfeysda ko‘rinadi (rollar brauzerda tekshiriladi). Haqiqiy himoyani tekshirib bo‘lmadi | **Ochiq:** `supabase/audit/security_check.sql` ni bajarib, natijani ko‘rib chiqish kerak. Tavsiya: mavjud sxemani (ma’lumotsiz) `supabase db dump --schema public` bilan repozitoriyaga qo‘shish |
| S5 | O‘rta | `parol.html`: taklif tokenlari muvaffaqiyatli bo‘lgunga qadar manzil satrida va brauzer tarixida qolardi | **Tuzatildi:** darhol tozalanadi |
| S6 | O‘rta | Parol talabi faqat `minlength=12` | **Qisman:** brauzerda kuchliroq tekshiruv; Supabase Auth’da parol siyosatini yoqish kerak (README, 3-qadam) |
| S7 | Past | Imzolangan fayl havolalari `Referer` orqali sizishi mumkin edi | **Tuzatildi:** `referrer: no-referrer` |
| S8 | Past | Xom baza xatolari foydalanuvchiga ko‘rsatilardi | **Tuzatildi:** tushunarli o‘zbekcha xabarlar (`friendlyError`) |
| S9 | Past | Kirishda takroriy urinishlarga cheklov yo‘q | **Qisman:** brauzerda kutish vaqti; asosiy himoya — Supabase’ning server limitlari |
| S10 | Ma’lumot | CSV eksportda formula in’ektsiyasidan himoya bor edi (yaxshi) | Saqlandi, Excel eksportiga ham qo‘llandi |

## Buzilgan funksiyalar

| # | Muammo | Holat |
|---|---|---|
| B1 | `jamoa.html` bo‘sh (0 bayt) edi, lekin bosh sahifadan havola bor edi | **Tuzatildi:** Supabase’dagi xodimlar ro‘yxati |
| B2 | Vazifalar tahlilida qator o‘rniga `\n` belgisi chiqardi | **Tuzatildi** |
| B3 | Vazifalar sahifasi faqat 100 ta, hisobotlar 1000 ta vazifani olardi — statistika noto‘g‘ri bo‘lishi mumkin edi | **Tuzatildi:** hamma joyda sahifalab yuklash |
| B4 | Navigatsiya har sahifada har xil, hisobotlarda «Chiqish» yo‘q | **Tuzatildi:** yagona navigatsiya |
| B5 | Rollar `head`, `coordinator` kabi kod ko‘rinishida | **Tuzatildi:** o‘zbekcha nomlar |
| B6 | Bosh sahifa localStorage sinov paneli edi, README eskirgan | **Tuzatildi:** bosh sahifa yangilandi, sinov paneli `sinov.html` da saqlandi |

## Arxitektura cheklovlari

| # | Cheklov | Yechim |
|---|---|---|
| A1 | AI yordamchi faqat vazifalarni hisoblardi, hujjatlarni o‘qimasdi | Bilimlar bazasi + o‘zbekcha NLU + ixtiyoriy til modeli |
| A2 | Testlar yo‘q edi | Unit, SQL (RLS) va brauzer testlari |
| A3 | Baza sxemasi repozitoriyada yo‘q | Yangi qismlar `supabase/migrations/` da; mavjud sxemani ham qo‘shish tavsiya etiladi |
| A4 | Har sahifada kod takrorlangan | `js/common.js`, `js/config.js` |

## Qolgan tavsiyalar

1. `security_check.sql` natijasida `anon` roli uchun ochiq siyosat yoki `using (true)` bo‘lsa — tuzatish.
2. `department_tasks` uchun: oddiy xodim faqat o‘ziga biriktirilgan vazifa holatini o‘zgartira olishi kerakmi — qaror qabul qilib, siyosatni shunga moslash (hozir interfeysda faqat boshqaruv rollari o‘zgartiradi).
3. Supabase Auth: ro‘yxatdan o‘tishni o‘chirish, parol siyosati, MFA (mudir va administrator uchun).
4. Muntazam zaxira nusxa (bepul tarifda avtomatik zaxira yo‘q — haftalik `pg_dump` tavsiya etiladi).
