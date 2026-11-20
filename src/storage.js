/* التخزين: IndexedDB على الجهاز، أو قاعدة بيانات الصفحة (خاصة بالمالك)، مع تشفير الخزنة والنسخ الاحتياطي */
(function (root) {
'use strict';
const PART = 90000;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };
const hex = buf => Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
const rand = n => crypto.getRandomValues(new Uint8Array(n));

const Crypto = {
  async sha256(str) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(str))); },
  async pinHash(pin, saltB64) { const k = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(saltB64), iterations: 120000, hash: 'SHA-256' }, k, 256); return hex(bits); },
  newSalt() { return b64(rand(16)); },
  async key(pass, saltB64, iter) { const k = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(saltB64), iterations: iter || 210000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); },
  async encrypt(key, str) { const iv = rand(12); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(str)); return JSON.stringify({ iv: b64(iv), ct: b64(ct) }); },
  async decrypt(key, payload) { const o = JSON.parse(payload); const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.ct)); return dec.decode(pt); }
};

function withTimeout(p, ms) { return Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]); }

const Store = {
  mode: 'memory', db: null, uid: null, idb: null, mem: {}, parts: {}, cache: {}, pending: new Set(), status: 'idle', onStatus: null,
  async init() {
    if (root.claude && typeof root.claude.use === 'function') {
      try {
        const [db, user] = await withTimeout(Promise.all([root.claude.use('db'), root.claude.use('user')]), 10000) || [];
        const id = user ? await withTimeout(user.id(), 8000) : null;
        if (db && id) { this.db = db; this.uid = id; this.mode = 'cloud'; this.downloads = await withTimeout(root.claude.use('downloads'), 5000); return this.mode; }
      } catch (e) { console.warn('db unavailable', e); }
    }
    try { this.idb = await this._openIdb(); this.mode = 'local'; } catch (e) { this.mode = 'memory'; }
    return this.mode;
  },
  _openIdb() {
    return new Promise((res, rej) => {
      if (!root.indexedDB) return rej(new Error('no idb'));
      const r = indexedDB.open('smartcare-finance', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('chunks', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },
  _coll() { return this.db.collection('data/users/' + this.uid); },
  _docId(ws, key, p) { return (ws + '~' + key + '~' + p).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_'); },
  setStatus(s) { this.status = s; if (this.onStatus) this.onStatus(s, this.pending.size); },
  async loadAll(ws) {
    const out = {};
    if (this.mode === 'local') {
      const all = await new Promise((res, rej) => { const tx = this.idb.transaction('chunks', 'readonly'); const r = tx.objectStore('chunks').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      for (const x of all) if (x.ws === ws) out[x.key] = x.s;
    } else if (this.mode === 'cloud') {
      const parts = {}; let last = '';
      for (let guard = 0; guard < 200; guard++) {
        let q = this._coll().where('ws', '==', ws);
        if (last) q = q.where('ord', '>', last);
        const snap = await q.orderBy('ord').limit(400).get();
        for (const d of snap.docs) { const v = d.data(); (parts[v.k] = parts[v.k] || [])[v.p] = v.s; parts[v.k].n = v.n; last = v.ord; }
        if (snap.size < 400) break;
      }
      for (const k in parts) { const arr = parts[k]; this.parts[ws + '|' + k] = arr.n; let s = ''; for (let i = 0; i < arr.n; i++) s += arr[i] || ''; out[k] = s; }
    } else Object.assign(out, this.mem[ws] || {});
    // صندوق الصادر: تعديلات لم تصل للتخزين قبل إغلاق الصفحة
    try { const ob = JSON.parse(localStorage.getItem('scf_outbox_' + ws) || '{}'); for (const k in ob) { out[k] = ob[k]; this.pending.add(k); } } catch (e) { /* لا يوجد */ }
    for (const k in out) this.cache[ws + '|' + k] = out[k];
    if (this.pending.size) setTimeout(() => this.flush(ws), 500);
    return out;
  },
  _outbox(ws, key, s) { try { const ob = JSON.parse(localStorage.getItem('scf_outbox_' + ws) || '{}'); if (s == null) delete ob[key]; else ob[key] = s; localStorage.setItem('scf_outbox_' + ws, JSON.stringify(ob)); } catch (e) { /* التخزين المحلي غير متاح */ } },
  queue: {},
  async put(ws, key, s) {
    if (this.cache[ws + '|' + key] === s) return true;
    this.cache[ws + '|' + key] = s; this.queue[ws + '|' + key] = { ws, key, s }; this.pending.add(key);
    if (this.mode === 'cloud') this._outbox(ws, key, s);
    return this.flush(ws);
  },
  async del(ws, key) { return this.put(ws, key, null); },
  _flushP: null,
  flush() {
    if (this._flushP) { this._again = true; return this._flushP; }
    this._flushP = (async () => {
      let ok = true;
      do {
        this._again = false; ok = true; this.setStatus('saving');
        for (const id of Object.keys(this.queue)) {
          const { ws, key, s } = this.queue[id];
          try { await this._write(ws, key, s); if (this.queue[id] && this.queue[id].s === s) { delete this.queue[id]; this.pending.delete(key); if (this.mode === 'cloud') this._outbox(ws, key, null); } }
          catch (e) { ok = false; console.warn('write failed', key, e); if (e && (e.code === 'quota_exceeded' || e.code === 'invalid_argument')) this.lastError = e.code; }
        }
      } while (this._again && ok);
      this.setStatus(ok ? 'saved' : 'offline');
      if (!ok && !this._retry) this._retry = setTimeout(() => { this._retry = null; this.flush(); }, 15000);
      return ok;
    })().finally(() => { this._flushP = null; });
    return this._flushP;
  },
  async _write(ws, key, s) {
    if (this.mode === 'memory') { (this.mem[ws] = this.mem[ws] || {}); if (s == null) delete this.mem[ws][key]; else this.mem[ws][key] = s; return; }
    if (this.mode === 'local') {
      return new Promise((res, rej) => { const tx = this.idb.transaction('chunks', 'readwrite'); const st = tx.objectStore('chunks'); if (s == null) st.delete(ws + '|' + key); else st.put({ id: ws + '|' + key, ws, key, s }); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
    const pk = ws + '|' + key; const oldN = this.parts[pk] || 0;
    const n = s == null ? 0 : Math.max(1, Math.ceil(s.length / PART));
    for (let i = 0; i < n; i++) await this._coll().doc(this._docId(ws, key, i)).set({ ws, k: key, p: i, n, ord: key + '#' + String(i).padStart(3, '0'), s: s.slice(i * PART, (i + 1) * PART) });
    for (let i = n; i < oldN; i++) await this._coll().doc(this._docId(ws, key, i)).delete();
    this.parts[pk] = n;
  },
  async wipe(ws) { const all = Object.keys(this.cache).filter(k => k.startsWith(ws + '|')); for (const k of all) await this.put(ws, k.slice(ws.length + 1), null); },
  async download(filename, blob) {
    if (this.mode === 'cloud' && this.downloads) { try { await this.downloads.save({ filename, data: blob }); return true; } catch (e) { try { await this.downloads.save({ filename, data: await blob.text() }); return true; } catch (e2) { return false; } } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); return true;
  }
};
root.SCStore = Store; root.SCCrypto = Crypto;
})(typeof window !== 'undefined' ? window : globalThis);
