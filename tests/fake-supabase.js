// Testlar uchun Supabase’ning xotiradagi soxta nusxasi (faqat e2e testlarda ishlatiladi; saytga ulanmaydi).
(function () {
  const KEY = '__fundamed_fake_db';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const save = s => localStorage.setItem(KEY, JSON.stringify(s));
  let S = load() || window.__FAKE_SEED || { tables: {}, files: {}, session: null, users: [], seq: 1 };
  const persist = () => save(S);
  const T = n => (S.tables[n] ||= []);
  const me = () => S.session && S.users.find(u => u.id === S.session);
  const role = () => (T('staff_profiles').find(p => p.user_id === S.session) || {}).role;
  const MANAGER = ['superadmin', 'head', 'deputy', 'coordinator'];

  class Q {
    constructor(table) { this.t = table; this.filters = []; this.op = 'select'; this._order = null; this._range = null; this._single = null; this.opts = {}; }
    select(cols, opts) { if (this.op === 'select') this.opts = opts || {}; this.cols = cols; this._ret = true; return this; }
    insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
    upsert(row) { this.op = 'upsert'; this.payload = Array.isArray(row) ? row : [row]; return this; }
    update(obj) { this.op = 'update'; this.payload = obj; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filters.push(r => String(r[c]) === String(v)); return this; }
    gte(c, v) { this.filters.push(r => r[c] >= v); return this; }
    order(c, o) { this._order = [c, o?.ascending !== false]; return this; }
    range(a, b) { this._range = [a, b]; return this; }
    limit(n) { this._range = [0, n - 1]; return this; }
    maybeSingle() { this._single = 'maybe'; return this; }
    single() { this._single = 'one'; return this; }
    then(res, rej) { try { res(this.run()); } catch (e) { rej(e); } }
    run() {
      if (!S.session) return { data: null, error: { message: 'JWT expired' } };
      if (S.missingTables?.includes(this.t)) return { data: null, error: { message: 'relation "' + this.t + '" does not exist' } };
      const rows = T(this.t);
      const kb = ['document_chunks', 'document_facts', 'document_analysis'];
      if (this.op !== 'select' && (kb.includes(this.t) || this.t === 'department_documents') && !MANAGER.includes(role())) return { data: null, error: { message: 'new row violates row-level security policy' } };
      if (this.op === 'insert') {
        for (const r of this.payload) { const row = { id: this.t.startsWith('document_') && this.t !== 'department_documents' ? S.seq++ : (r.id ?? 'id' + S.seq++), created_at: new Date().toISOString(), ...r }; if (this.t === 'ai_audit_log') row.user_id = S.session; rows.push(row); }
        persist(); return { data: null, error: null };
      }
      if (this.op === 'upsert') { for (const r of this.payload) { const i = rows.findIndex(x => String(x.document_id ?? x.id) === String(r.document_id ?? r.id)); if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push(r); } persist(); return { data: null, error: null }; }
      let list = rows.filter(r => this.filters.every(f => f(r)));
      if (this.op === 'update') { list.forEach(r => Object.assign(r, this.payload)); persist(); return { data: null, error: null }; }
      if (this.op === 'delete') { S.tables[this.t] = rows.filter(r => !list.includes(r)); persist(); return { data: null, error: null }; }
      if (this._order) { const [c, asc] = this._order; list = [...list].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); }
      const count = list.length;
      if (this._range) list = list.slice(this._range[0], this._range[1] + 1);
      if (this.opts.head) return { data: null, count, error: null };
      if (this._single) { if (this._single === 'one' && list.length !== 1) return { data: null, error: { message: 'not single' } }; return { data: list[0] ? { ...list[0] } : null, error: null }; }
      return { data: list.map(r => ({ ...r })), count, error: null };
    }
  }
  const norm = s => String(s).toLowerCase().replace(/[ʻʼ‘’'`]/g, '');
  const client = {
    from: t => new Q(t),
    rpc: async (fn, args) => {
      if (fn !== 'search_knowledge') return { data: null, error: { message: 'no fn' } };
      const words = args.q.split(' or ').map(norm);
      const docs = T('department_documents');
      const data = T('document_chunks').map(c => ({ c, hits: words.filter(w => norm(c.content_norm).includes(w)).length })).filter(x => x.hits)
        .sort((a, b) => b.hits - a.hits).slice(0, args.max_results)
        .map(({ c, hits }) => { const d = docs.find(x => String(x.id) === String(c.document_id)); return { document_id: String(c.document_id), title: d?.title, category: d?.category, location: c.location, content: c.content, rank: hits / 10 }; });
      return { data, error: null };
    },
    auth: {
      getUser: async () => ({ data: { user: me() || null }, error: me() ? null : { message: 'no session' } }),
      signInWithPassword: async ({ email, password }) => { const u = S.users.find(x => x.email === email && x.password === password); if (!u) return { error: { message: 'Invalid login' } }; S.session = u.id; persist(); return { error: null, data: {} }; },
      signOut: async () => { S.session = null; persist(); return { error: null }; },
      verifyOtp: async () => ({ error: { message: 'bad' } }), setSession: async () => ({ error: { message: 'bad' } }), updateUser: async () => ({ error: null })
    },
    storage: { from: () => ({
      upload: async (path, blob) => { if (!MANAGER.includes(role())) return { error: { message: 'row-level security' } }; const buf = new Uint8Array(await blob.arrayBuffer()); S.files[path] = btoa(Array.from(buf, b => String.fromCharCode(b)).join('')); persist(); return { data: { path }, error: null }; },
      download: async path => { const b = S.files[path]; if (!b) return { error: { message: 'not found' } }; const bin = atob(b), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return { data: new Blob([u8]), error: null }; },
      createSignedUrl: async path => ({ data: { signedUrl: 'about:blank#' + path }, error: null }),
      remove: async paths => { paths.forEach(p => delete S.files[p]); persist(); return { error: null }; }
    }) },
    functions: { invoke: async () => (S.llm ? { data: S.llm, error: null } : { data: null, error: { message: 'not configured', context: { status: 503 } } }) }
  };
  window.supabase = { createClient: () => client };
  window.__fakeState = () => S;
})();
