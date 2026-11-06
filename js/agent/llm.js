// Ixtiyoriy til modeli rejimi: Supabase Edge Function orqali. Kalit brauzerda YO‘Q.
import { db } from '../common.js';
import { isSensitive } from '../kb/fields.js';

export function redact(s) {
  return String(s ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email yashirildi]')
    .replace(/\b\d{14}\b/g, '[JShShIR yashirildi]')
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, '[karta yashirildi]')
    .replace(/\b[A-Z]{2}\s?\d{7}\b/g, '[pasport yashirildi]')
    .replace(/(\+?998[\s-]?)?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g, '[telefon yashirildi]');
}

/** Kontekstni tayyorlash: maxfiy maydonlar umuman yuborilmaydi, qolgan matn tozalanadi. */
export function buildContext({ results = [], facts = [], extra = [] }) {
  const items = [];
  for (const t of extra) items.push({ title: t.title, location: t.location, text: redact(t.text) });
  for (const f of facts) if (!isSensitive(f.field)) items.push({ title: f.document_title, location: f.location, text: redact((f.entity ? f.entity + ' — ' : '') + f.field_label + ': ' + f.value) });
  for (const r of results) items.push({ title: r.title, location: r.location, text: redact(r.content) });
  return items.slice(0, 14);
}

/** @returns {Promise<null | {answer, used_sources, missing, grounded, model}>} null — rejim sozlanmagan */
export async function askLLM(question, context) {
  const r = await db.functions.invoke('ai-agent', { body: { question: redact(question), context } });
  if (r.error) {
    const status = r.error.context?.status;
    if (status === 503 || status === 404) return null;
    if (status === 429) throw new Error('Soatlik AI so‘rovlar chegarasiga yetdingiz. Keyinroq urinib ko‘ring.');
    throw new Error('Til modeli javob bermadi.');
  }
  return r.data;
}

export async function logLocal(intent, sourceCount) {
  try { await db.from('ai_audit_log').insert({ mode: 'local', intent: String(intent).slice(0, 60), used_external: false, source_count: sourceCount }); } catch { /* jurnal ixtiyoriy */ }
}
