import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';
// Bu sahifada taklif havolasidagi tokenni o‘qish uchun detectSessionInUrl yoqilgan alohida mijoz kerak.
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { detectSessionInUrl: true, persistSession: true } });
const msg = document.getElementById('message'), form = document.getElementById('form');
let ready = false;

export function passwordProblems(p) {
  const out = [];
  if (p.length < 12) out.push('kamida 12 belgi');
  if (!/[a-zа-я]/i.test(p)) out.push('harf');
  if (!/\d/.test(p)) out.push('raqam');
  if (/^(.)\1+$/.test(p) || /^(12345|qwerty|parol|password)/i.test(p)) out.push('oddiy bo‘lmagan parol');
  return out;
}

async function init() {
  const url = new URL(location.href), hash = new URLSearchParams(location.hash.slice(1));
  const errorText = hash.get('error_description') || url.searchParams.get('error_description');
  // Tokenlarni manzil satridan darhol olib tashlaymiz (tarix va skrinshotlarda qolmasin).
  history.replaceState({}, '', location.pathname);
  if (errorText) { msg.textContent = 'Taklif havolasi ishlamadi: ' + errorText + '. Yangi taklif yoki parol tiklash havolasi kerak.'; return; }
  const token = url.searchParams.get('token_hash'), type = url.searchParams.get('type');
  if (token && ['invite', 'recovery'].includes(type)) {
    const r = await db.auth.verifyOtp({ token_hash: token, type });
    if (r.error) { msg.textContent = 'Taklif havolasi yaroqsiz yoki muddati tugagan.'; return; }
  } else if (hash.get('access_token') && hash.get('refresh_token')) {
    const r = await db.auth.setSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') });
    if (r.error) { msg.textContent = 'Taklifni tasdiqlashda xatolik yuz berdi.'; return; }
  }
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) { msg.textContent = 'Taklif tasdiqlanmadi. Emaildagi yangi taklif yoki parolni tiklash havolasini oching.'; return; }
  ready = true; form.hidden = false; msg.textContent = 'Yangi, boshqa joyda ishlatilmagan parol kiriting.';
}
document.getElementById('password').oninput = e => {
  const p = passwordProblems(e.target.value);
  document.getElementById('strength').textContent = p.length ? 'Kerak: ' + p.join(', ') : 'Parol talablarga mos.';
};
form.onsubmit = async e => {
  e.preventDefault(); if (!ready) return;
  const a = document.getElementById('password').value, b = document.getElementById('confirm').value;
  if (a !== b) { msg.textContent = 'Parollar bir xil emas.'; return; }
  const probs = passwordProblems(a);
  if (probs.length) { msg.textContent = 'Parol talablarga javob bermaydi: ' + probs.join(', ') + '.'; return; }
  const btn = document.getElementById('save'); btn.disabled = true;
  const { error } = await db.auth.updateUser({ password: a });
  document.getElementById('password').value = ''; document.getElementById('confirm').value = '';
  if (error) { msg.textContent = 'Parolni saqlashda xatolik: ' + error.message; btn.disabled = false; return; }
  msg.textContent = 'Parol muvaffaqiyatli o‘rnatildi. Endi tizimga kirishingiz mumkin.'; form.hidden = true;
  await db.auth.signOut(); btn.disabled = false;
};
init().catch(() => msg.textContent = 'Havolani tekshirishda xatolik yuz berdi.');
