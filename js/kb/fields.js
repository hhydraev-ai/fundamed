// Kafedra hujjatlarida uchraydigan ustun nomlari → standart maydonlar lug‘ati.
import { key } from '../agent/uz.js';

export const FIELDS = {
  row_no:        { label: '№', syn: ['№', 't/r', 'tr', 't r', 'n', '#', 'nomer', 'raqam', 'p/n', 'п/п', 'тр'], ignore: true },
  full_name:     { label: 'F.I.Sh.', syn: ['fish', 'f i sh', 'f.i.sh', 'f.i.o', 'fio', 'ф.и.ш', 'ф.и.о', 'ism familiya', 'familiya ism', 'familiya ismi sharifi', 'familiyasi ismi', 'ism sharif', 'ism-sharif', 'xodim', 'xodimlar', 'xodim fish', 'oqituvchi', 'oqituvchilar', 'professor oqituvchi', 'professor-oqituvchi', 'professor oqituvchilar', 'fish oqituvchi'], entity: 'person' },
  position:      { label: 'Lavozim', syn: ['lavozim', 'lavozimi', 'egallab turgan lavozimi', 'должность'] },
  academic_degree:{ label: 'Ilmiy daraja', syn: ['ilmiy daraja', 'ilmiy darajasi', 'daraja'] },
  academic_title:{ label: 'Ilmiy unvon', syn: ['ilmiy unvon', 'ilmiy unvoni', 'unvon', 'unvoni'] },
  rate:          { label: 'Stavka', syn: ['stavka', 'stavkasi', 'shtat birligi', 'shtat', 'ставка'] },
  employment:    { label: 'Ish turi', syn: ['ish turi', 'asosiy orindosh', 'orindoshlik', 'asosiy yoki orindosh'] },
  phone:         { label: 'Telefon', syn: ['telefon', 'tel', 'telefon raqami', 'mobil', 'aloqa telefoni', 'телефон'], sensitive: true },
  email:         { label: 'E-pochta', syn: ['email', 'e-mail', 'e mail', 'elektron pochta', 'pochta'], sensitive: true },
  birth_date:    { label: 'Tug‘ilgan sana', syn: ['tugilgan sana', 'tugilgan yili', 'tugilgan sanasi', 'tugilgan yil', 'tugilgan'], sensitive: true },
  passport:      { label: 'Pasport', syn: ['pasport', 'pasport seriyasi', 'pasport malumotlari', 'passport'], sensitive: true },
  pinfl:         { label: 'JShShIR', syn: ['jshshir', 'pinfl', 'jshshr', 'shaxsiy raqam'], sensitive: true },
  address:       { label: 'Manzil', syn: ['manzil', 'yashash manzili', 'turar joyi', 'yashash joyi'], sensitive: true },
  experience:    { label: 'Ish staji', syn: ['ish staji', 'staj', 'pedagogik staj', 'umumiy staj', 'mehnat staji'] },
  education:     { label: 'Ma’lumoti', syn: ['malumoti', 'malumot', 'tamomlagan oliygoh', 'tamomlagan otm', 'bitirgan oliygohi'] },
  specialty:     { label: 'Mutaxassislik', syn: ['mutaxassislik', 'mutaxassisligi', 'ixtisoslik'] },
  subject:       { label: 'Fan', syn: ['fan', 'fan nomi', 'fanlar', 'fanning nomi', 'oqitadigan fani', 'fanlar nomi', 'дисциплина'], entity: 'subject', multi: true },
  hours_total:   { label: 'Jami soat', syn: ['jami soat', 'jami', 'jami yuklama', 'umumiy soat', 'oquv yuklamasi', 'yuklama', 'soat', 'soatlar'], multi: true },
  hours_lecture: { label: 'Ma’ruza soati', syn: ['maruza', 'maruza soati', 'maruzalar'], multi: true },
  hours_practice:{ label: 'Amaliy soat', syn: ['amaliy', 'amaliy mashgulot', 'amaliy soati', 'seminar'], multi: true },
  hours_lab:     { label: 'Laboratoriya soati', syn: ['laboratoriya', 'lab', 'laboratoriya mashgulot'], multi: true },
  group:         { label: 'Guruh', syn: ['guruh', 'guruhlar', 'guruh raqami'], multi: true },
  course:        { label: 'Kurs', syn: ['kurs', 'bosqich'], multi: true },
  semester:      { label: 'Semestr', syn: ['semestr', 'semester'], multi: true },
  faculty:       { label: 'Fakultet', syn: ['fakultet'] },
  department:    { label: 'Kafedra', syn: ['kafedra', 'kafedra nomi'] },
  publications:  { label: 'Ilmiy ishlar', syn: ['maqola', 'maqolalar', 'nashrlar', 'ilmiy ishlar', 'ilmiy maqolalar'], multi: true },
  task_title:    { label: 'Vazifa / tadbir', syn: ['vazifa', 'vazifalar', 'tadbir', 'tadbirlar', 'tadbir nomi', 'tadbirlar nomi', 'ish nomi', 'bajariladigan ishlar', 'rejalashtirilgan ishlar'], entity: 'task', multi: true },
  responsible:   { label: 'Mas’ul', syn: ['masul', 'masullar', 'javobgar', 'ijrochi', 'ijrochilar', 'masul shaxs'], multi: true },
  deadline:      { label: 'Muddat', syn: ['muddat', 'muddati', 'bajarilish muddati', 'ijro muddati', 'sana', 'sanasi'], multi: true },
  status:        { label: 'Holat', syn: ['holat', 'holati', 'bajarilishi', 'bajarilish holati', 'ijro holati'], multi: true },
  role:          { label: 'Tizimdagi rol', syn: ['rol', 'tizim roli'] },
  note:          { label: 'Izoh', syn: ['izoh', 'eslatma', 'qayd', 'izohlar'], noConflict: true }
};

const INDEX = [];
for (const [field, f] of Object.entries(FIELDS)) for (const s of f.syn) INDEX.push([key(s), field]);
INDEX.sort((a, b) => b[0].length - a[0].length);

/** Ustun sarlavhasini standart maydonga moslaydi. Topilmasa null. */
export function matchHeader(header) {
  const k = key(header);
  if (!k) return null;
  for (const [s, field] of INDEX) if (k === s) return field;
  const padded = ' ' + k + ' ';
  for (const [s, field] of INDEX) if (s.length >= 3 && padded.includes(' ' + s + ' ')) return field;
  return null;
}
export const fieldLabel = f => FIELDS[f]?.label || f;
export const isSensitive = f => !!FIELDS[f]?.sensitive;
