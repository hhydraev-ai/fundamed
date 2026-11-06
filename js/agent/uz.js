// O‘zbek matnini solishtirish va qidirish uchun normallashtirish (sof funksiyalar).
const CYR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'j',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'x',ц:'s',ч:'ch',ш:'sh',щ:'sh',ъ:"'",ы:'i',ь:'',э:'e',ю:'yu',я:'ya',ў:"o'",қ:'q',ғ:"g'",ҳ:'h' };

/** Kirill → lotin (taxminiy, qidiruv uchun yetarli). */
export function cyrToLat(s) {
  return String(s ?? '').replace(/[а-яёўқғҳ]/gi, ch => {
    const low = ch.toLowerCase(), t = CYR[low] ?? ch;
    return ch === low ? t : t.charAt(0).toUpperCase() + t.slice(1);
  });
}

/** Solishtirish uchun: kichik harf, lotin, apostroflar bir xil, ortiqcha belgilar olib tashlangan. */
export function norm(s) {
  return cyrToLat(String(s ?? '').normalize('NFKC'))
    .toLowerCase()
    .replace(/[ʻʼ‘’`´']/g, "'")
    .replace(/o'|o‘/g, "o'").replace(/g'|g‘/g, "g'")
    .replace(/[“”«»"]/g, ' ')
    .replace(/[^\p{L}\p{N}' .,:;/@+\-]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** Qidiruv kaliti: apostrof va tinish belgilarisiz. */
export const key = s => norm(s).replace(/'/g, '').replace(/[.,:;]/g, ' ').replace(/\s+/g, ' ').trim();

export function tokens(s) { return key(s).split(' ').filter(w => w.length > 1); }

/** Levenshtein masofasi (qisqa satrlar uchun). */
export function lev(a, b) {
  if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** So‘z o‘zagi bo‘yicha taxminiy moslik (o‘zbek qo‘shimchalari uchun: -lar, -ni, -ga, -da, -dan...). */
const SUFFIXES = ['larning', 'laridan', 'larini', 'lariga', 'larida', 'lardan', 'larni', 'larga', 'larda', 'lari', 'ning', 'dagi', 'dan', 'lar', 'ni', 'ga', 'da', 'ka', 'qa', 'im', 'ing', 'si', 'mi'].sort((a, b) => b.length - a.length);
export function stem(w) {
  w = key(w);
  for (const s of SUFFIXES) if (w.length - s.length >= 3 && w.endsWith(s)) return w.slice(0, -s.length);
  return w;
}

export function samePerson(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.length || !B.length) return false;
  const long = x => x.filter(t => t.length > 2);
  const la = long(A), lb = long(B);
  // Familiya (eng uzun to‘liq so‘z) mos kelishi va qolgan so‘zlar bosh harf bilan zid emasligi.
  const common = la.filter(t => lb.some(u => u === t || (t.length > 4 && lev(t, u) <= 1)));
  if (!common.length) return false;
  const restA = A.filter(t => !common.includes(t)), restB = B.filter(t => !common.some(c => c === t || lev(c, t) <= 1));
  if (!restA.length || !restB.length) return common.length >= 1 && (la.length === 1 || lb.length === 1 || common.length >= Math.min(la.length, lb.length));
  return restA.every(t => restB.some(u => u[0] === t[0]));
}
