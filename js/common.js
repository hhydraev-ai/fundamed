// Barcha sahifalar uchun umumiy yordamchi funksiyalar.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

if (!window.supabase || !window.supabase.createClient) throw new Error('Supabase kutubxonasi yuklanmadi');
export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

export const $ = id => document.getElementById(id);
export function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null) n.textContent = String(text);
  if (cls) n.className = cls;
  return n;
}
export const pad = n => String(n).padStart(2, '0');
export const isoDate = d => [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('-');
export const today = () => isoDate(new Date());
export const daysFromToday = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };

export const MANAGER_ROLES = ['superadmin', 'head', 'deputy', 'coordinator'];
export const DELETE_ROLES = ['superadmin', 'head'];
export const ROLE_LABELS = {
  superadmin: 'Tizim administratori', head: 'Kafedra mudiri', deputy: 'Mudir o‘rinbosari',
  coordinator: 'Koordinator', teacher: 'O‘qituvchi', staff: 'Xodim', assistant: 'Assistent', viewer: 'Kuzatuvchi'
};
export const roleLabel = r => ROLE_LABELS[r] || r || 'Noma’lum rol';
export const isManager = r => MANAGER_ROLES.includes(r);

export const STATUS_LABELS = { new: 'Yangi', in_progress: 'Jarayonda', done: 'Bajarilgan', cancelled: 'Bekor qilingan' };
export const PRIORITY_LABELS = { normal: 'Oddiy', important: 'Muhim', urgent: 'Shoshilinch' };
export const isOpenTask = t => !['done', 'cancelled'].includes(t.status);
export const isLateTask = t => isOpenTask(t) && !!t.due_date && t.due_date < today();

export const NAV = [
  ['dashboard.html', 'Boshqaruv'], ['vazifalar.html', 'Vazifalar'], ['hisobotlar.html', 'Hisobotlar'],
  ['hujjatlar.html', 'Hujjatlar'], ['bilimlar.html', 'Bilimlar bazasi'], ['ai-agent.html', 'AI yordamchi'], ['jamoa.html', 'Jamoa']
];

/** Sarlavhadagi navigatsiyani to‘ldiradi. */
export function renderNav(container) {
  if (!container) return;
  const here = location.pathname.split('/').pop() || 'index.html';
  container.replaceChildren();
  for (const [href, label] of NAV) {
    const a = el('a', label);
    a.href = './' + href;
    if (href === here) a.setAttribute('aria-current', 'page');
    container.append(a);
  }
  const out = el('button', 'Chiqish', 'secondary');
  out.type = 'button';
  out.onclick = logout;
  container.append(out);
}

export async function logout() {
  try { await db.auth.signOut(); } finally { location.replace('./login.html'); }
}

/**
 * Foydalanuvchi va uning kafedra profilini tekshiradi.
 * Kirmagan bo‘lsa login sahifasiga yuboradi. Profil bo‘lmasa null qaytaradi.
 */
export async function requireProfile(statusFn) {
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) { location.replace('./login.html'); return null; }
  const p = await db.from('staff_profiles').select('user_id,display_name,role').eq('user_id', user.id).maybeSingle();
  if (p.error) { statusFn?.('Profilni yuklashda xatolik yuz berdi. Keyinroq urinib ko‘ring.'); return null; }
  if (!p.data) { statusFn?.('Sizning kafedra profilingiz topilmadi. Administratorga murojaat qiling.'); return null; }
  return { user, profile: p.data };
}

/** Supabase’dan sahifalab barcha qatorlarni oladi (1000 tadan). */
export async function fetchAll(table, columns, { order = 'created_at', ascending = false, max = 20000 } = {}) {
  const out = [];
  for (let from = 0; from < max; from += 1000) {
    const r = await db.from(table).select(columns).order(order, { ascending }).range(from, from + 999);
    if (r.error) throw new Error(r.error.message);
    out.push(...(r.data || []));
    if ((r.data || []).length < 1000) break;
  }
  return out;
}

export const TASK_COLUMNS = 'id,title,description,status,due_date,assignee_id,created_by,created_at,priority';
export const fetchAllTasks = (cols = TASK_COLUMNS) => fetchAll('department_tasks', cols);
export async function fetchStaff() {
  const r = await db.from('staff_profiles').select('user_id,display_name,role').order('display_name');
  if (r.error) throw new Error(r.error.message);
  return r.data || [];
}

/** Foydalanuvchiga ko‘rsatiladigan xato matni (texnik tafsilotlarsiz). */
export function friendlyError(e) {
  const m = String(e?.message || e || '');
  if (/JWT|session|auth/i.test(m)) return 'Sessiya tugagan. Qaytadan kiring.';
  if (/permission|policy|row-level|42501/i.test(m)) return 'Bu amal uchun ruxsatingiz yo‘q.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Internet aloqasi yo‘q yoki server javob bermadi.';
  if (/relation .* does not exist|42P01|schema cache/i.test(m)) return 'Bazada kerakli jadval hali yaratilmagan (migratsiyani bajaring).';
  return m || 'Noma’lum xatolik';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** CSV katakchasi: Excel formula in'ektsiyasidan himoya. */
export function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}

const loaded = new Map();
/** Kutubxonani faqat kerak bo‘lganda yuklaydi (vendor papkasidan). */
export function loadScript(src) {
  if (!loaded.has(src)) loaded.set(src, new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Kutubxona yuklanmadi: ' + src));
    document.head.append(s);
  }));
  return loaded.get(src);
}
