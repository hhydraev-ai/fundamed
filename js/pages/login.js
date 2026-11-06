import { db, $, el, roleLabel } from '../common.js';
const form = $('form'), msg = $('message'), profile = $('profile');
let failures = 0, lockUntil = 0;

async function showProfile() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  const { data, error } = await db.from('staff_profiles').select('display_name,role').eq('user_id', user.id).maybeSingle();
  if (error) { msg.textContent = 'Profilni yuklashda xatolik yuz berdi.'; return; }
  if (!data) { msg.textContent = 'Akkaunt mavjud, lekin kafedra ruxsati hali berilmagan.'; return; }
  form.hidden = true; profile.hidden = false; profile.replaceChildren();
  const b = el('button', 'Chiqish', 'secondary');
  b.onclick = async () => { await db.auth.signOut(); location.reload(); };
  const go = el('a', 'Boshqaruv paneliga o‘tish →', 'btn-link'); go.href = './dashboard.html';
  const tasks = el('a', 'Vazifalar paneli'); tasks.href = './vazifalar.html';
  profile.append(el('p', 'Xush kelibsiz, ' + data.display_name + '! Rol: ' + roleLabel(data.role)), go, el('p'), tasks, el('p'), b);
  msg.textContent = '';
}

form.onsubmit = async e => {
  e.preventDefault();
  if (Date.now() < lockUntil) { msg.textContent = 'Ko‘p marta noto‘g‘ri urinish. ' + Math.ceil((lockUntil - Date.now()) / 1000) + ' soniyadan keyin qayta urinib ko‘ring.'; return; }
  const b = $('submit'); b.disabled = true; msg.textContent = 'Tekshirilmoqda...';
  try {
    const { error } = await db.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
    $('password').value = '';
    if (error) {
      failures++; if (failures >= 5) { lockUntil = Date.now() + 30000 * (failures - 4); }
      msg.textContent = 'Kirish amalga oshmadi. Email yoki parolni tekshiring.';
    } else { failures = 0; await showProfile(); }
  } catch { msg.textContent = 'Ulanish xatosi. Keyinroq urinib ko‘ring.'; }
  finally { b.disabled = false; }
};
showProfile();
