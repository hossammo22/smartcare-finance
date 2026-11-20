/* Smart Care | الإدارة المالية والسيولة — الواجهة */
(function () {
'use strict';
const C = window.SCCore, ST = window.SCStore, CR = window.SCCrypto;
const APP_VERSION = '1.0.0';
let S = null, U = null, VKEY = null, WS = null, lastVaultPlain = null, RAW = {};
const UI = { view: 'home', ef: 'all', modal: null, charts: [], post: [], radar: { sid: null, set: 'base', gran: 'week' }, rep: { preset: 'month', from: null, to: null, methodId: '', accountId: '', categoryId: '' }, txf: { q: '', kind: '', from: '', to: '' }, decide: null, decideObj: 'profit', whatif: { sel: [] }, vaultTab: 'assets', settingsTab: 'general', fails: 0, lockUntil: 0, importState: null };

/* ---------- أدوات ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d) => (n == null || isNaN(n)) ? '—' : (+n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: 0 });
const money = (n, cls) => { if (n == null || isNaN(n)) return '<span class="muted">—</span>'; const v = Math.round(n); return '<span class="num ' + (v < 0 ? 'neg' : '') + (cls ? ' ' + cls : '') + '">' + fmt(v) + '</span>'; };
const fdate = s => s ? s.slice(0, 10).split('-').reverse().join('/') : '—';
const en = id => { const e = S.entities.find(x => x.id === id); return e ? e.name : (id || '—'); };
const an = id => { const a = S.accounts.find(x => x.id === id); return a ? a.name : '—'; };
const mn = id => { const m = S.methods.find(x => x.id === id); return m ? m.name : '—'; };
const cn = id => { const c = S.categories.income.concat(S.categories.expense).find(x => x.id === id); return c ? c.name : '—'; };
const BADGE = { actual: ['فعلي', 'b-act'], estimate: ['تقديري', 'b-est'], assumption: ['افتراض', 'b-asm'], forecast: ['توقع', 'b-fc'], pattern: ['نمط فعلي', 'b-act'], scheduled: ['مجدول', 'b-fc'], project: ['مشروع', 'b-asm'], scenario: ['سيناريو', 'b-asm'] };
const badge = k => { const b = BADGE[k] || [k, '']; return '<span class="badge ' + b[1] + '">' + b[0] + '</span>'; };
const can = p => C.userCan(U, p);
const visIds = () => C.visibleEntityIds(S, U);
const efIds = () => { const v = visIds(); return UI.ef === 'all' ? v : v.filter(x => x === UI.ef); };
const branchesVis = () => S.entities.filter(e => visIds().includes(e.id) && e.active !== false);
const toast = (msg, type) => { let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); } const t = document.createElement('div'); t.className = 'toast ' + (type || ''); t.textContent = msg; box.appendChild(t); setTimeout(() => t.classList.add('show'), 10); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3800); };
const opt = (v, t, sel) => '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(t) + '</option>';
const kpi = (label, val, sub, cls) => '<div class="kpi ' + (cls || '') + '"><div class="kl">' + label + '</div><div class="kv">' + val + '</div>' + (sub ? '<div class="ks">' + sub + '</div>' : '') + '</div>';
const card = (title, body, extra) => '<section class="card">' + (title ? '<div class="ch"><h3>' + title + '</h3>' + (extra || '') + '</div>' : '') + body + '</section>';
const info = t => '<span class="info" title="' + esc(t) + '">ⓘ</span>';
const empty = t => '<div class="empty">' + t + '</div>';
const LOADING = {};
function loadScript(src) { if (LOADING[src]) return LOADING[src]; LOADING[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { s.remove(); delete LOADING[src]; rej(new Error('تعذر تحميل ' + src)); }; document.head.appendChild(s); }); return LOADING[src]; }
const LIB = { xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', chart: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js', h2c: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' };

/* ---------- الحفظ ---------- */
function isVaultAudit(a) { const chk = o => o && (o.entityId === 'owner'); return chk(a.before) || chk(a.after) || /^vault/.test(a.type); }
function partition() {
  const nonOwner = arr => arr.filter(x => x.entityId !== 'owner');
  const ops = { meta: S.meta, settings: S.settings, entities: S.entities.filter(e => e.id !== 'owner'), methods: S.methods, accounts: nonOwner(S.accounts), categories: S.categories, users: S.users, claims: nonOwner(S.claims), payables: nonOwner(S.payables), closings: S.closings, liabilities: nonOwner(S.liabilities), imports: S.imports };
  const chunks = { ops: JSON.stringify(ops) };
  const byDay = {}; for (const t of S.txns) if (t.entityId !== 'owner') (byDay[t.date] = byDay[t.date] || []).push(t);
  for (const d in byDay) chunks['tx-' + d] = JSON.stringify(byDay[d]);
  const byM = {}; const vAudit = [];
  for (const a of S.audit) { if (isVaultAudit(a)) { vAudit.push(a); continue; } const m = a.at.slice(0, 7); (byM[m] = byM[m] || []).push(a); }
  for (const m in byM) chunks['au-' + m] = JSON.stringify(byM[m]);
  let vault = null;
  if (S._vaultOpen) vault = JSON.stringify({ owner: S.entities.find(e => e.id === 'owner'), accounts: S.accounts.filter(x => x.entityId === 'owner'), txns: S.txns.filter(x => x.entityId === 'owner'), claims: S.claims.filter(x => x.entityId === 'owner'), payables: S.payables.filter(x => x.entityId === 'owner'), liabilities: S.liabilities.filter(x => x.entityId === 'owner'), assets: S.assets, projects: S.projects, scenarios: S.scenarios, audit: vAudit });
  return { chunks, vault };
}
let saveTimer = null;
function commit(msg) { S._rev = (S._rev || 0) + 1; render(); if (msg) toast(msg, 'ok'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }
async function save() {
  if (!S || !WS) return;
  const { chunks, vault } = partition();
  for (const k in chunks) ST.put(WS, k, chunks[k]);
  if (vault != null && VKEY && vault !== lastVaultPlain) { lastVaultPlain = vault; ST.put(WS, 'vault', await CR.encrypt(VKEY, vault)); }
}
function syncBadge(s, n) {
  const el = $('#sync'); if (!el) return;
  const mode = { local: 'محفوظ على هذا الجهاز', cloud: 'محفوظ في حسابك (يتزامن بين أجهزتك)', memory: 'ذاكرة مؤقتة فقط — صدّر نسخة احتياطية' }[ST.mode];
  const st = s === 'saving' ? 'جارٍ الحفظ…' : s === 'offline' ? 'بانتظار الاتصال (' + n + ')' : 'تم الحفظ';
  el.className = 'sync ' + (s === 'offline' ? 'warn' : s === 'saving' ? 'busy' : 'ok'); el.textContent = st; el.title = mode;
}
ST.onStatus = (s, n) => { syncBadge(s, n); if (UI.view === 'txns') { /* تحديث شارات الحالة */ } };
window.addEventListener('online', () => ST.flush());

async function loadWorkspace(ws) {
  RAW = await ST.loadAll(ws);
  if (!RAW.ops) return false;
  const ops = JSON.parse(RAW.ops);
  const base = C.emptyState(ws); const ownerPh = base.entities.find(e => e.id === 'owner');
  S = Object.assign(base, ops); S.txns = []; S.audit = []; S.assets = []; S.projects = []; S.scenarios = [];
  S.entities = ops.entities.concat([ownerPh]);
  for (const k in RAW) { if (k.startsWith('tx-')) S.txns.push.apply(S.txns, JSON.parse(RAW[k])); else if (k.startsWith('au-')) S.audit.push.apply(S.audit, JSON.parse(RAW[k])); }
  S.txns.sort((a, b) => (a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1);
  S._vaultCipher = RAW.vault || null; S._vaultOpen = false; S._rev = 1;
  WS = ws; VKEY = null; lastVaultPlain = null;
  return true;
}
async function openVault(pass) {
  if (!S.settings.vaultSalt) { S.settings.vaultSalt = CR.newSalt(); }
  VKEY = await CR.key(pass, S.settings.vaultSalt);
  if (S._vaultCipher) {
    const v = JSON.parse(await CR.decrypt(VKEY, S._vaultCipher));
    const i = S.entities.findIndex(e => e.id === 'owner'); if (v.owner) S.entities[i] = v.owner;
    S.accounts.push.apply(S.accounts, v.accounts || []); S.txns.push.apply(S.txns, v.txns || []); S.claims.push.apply(S.claims, v.claims || []); S.payables.push.apply(S.payables, v.payables || []); S.liabilities.push.apply(S.liabilities, v.liabilities || []);
    S.assets = v.assets || []; S.projects = v.projects || []; S.scenarios = v.scenarios || []; S.audit.push.apply(S.audit, v.audit || []);
    S.txns.sort((a, b) => (a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1);
  }
  S._vaultOpen = true; S._rev++;
  lastVaultPlain = partition().vault;
}

/* ---------- التشغيل والدخول ---------- */
async function boot() {
  $('#app').innerHTML = '<div class="splash"><div class="logo">SC</div><div>جارٍ التحميل…</div></div>';
  await ST.init();
  let ws = null; try { ws = localStorage.getItem('scf_ws'); } catch (e) { /* */ }
  if (!ws) { const r = await ST.loadAll('real'); ws = r.ops ? 'real' : null; }
  if (!ws) return welcome();
  if (!(await loadWorkspace(ws))) { if (ws === 'demo') { await createDemo(); } else return welcome(); }
  loginScreen();
}
function setWs(ws) { try { localStorage.setItem('scf_ws', ws); } catch (e) { /* */ } }
function welcome() {
  $('#app').innerHTML = `<div class="auth"><div class="auth-card wide">
    <div class="logo big">SC</div><h1>Smart Care | الإدارة المالية والسيولة</h1>
    <p class="muted">تسجيل الحركة اليومية للفروع، الأرصدة والإقفال، الخزنة الشخصية، رادار السيولة، محاكي «ماذا لو؟»، ومحرك القرار وتخصيص رأس المال — في تطبيق واحد.</p>
    <div class="grid2">
      <button class="choice" data-act="startDemo"><b>جرّب بالبيانات التجريبية</b><span>3 فروع وأصول والتزامات ومشاريع بأرقام افتراضية واضحة. لا تختلط ببياناتك.</span></button>
      <button class="choice" data-act="startReal"><b>ابدأ ببياناتي الفعلية</b><span>مساحة مستقلة فارغة. تضيف الفروع والحسابات والأرصدة الافتتاحية.</span></button>
    </div>
    <p class="muted small">مكان الحفظ: ${{ local: 'على هذا الجهاز (IndexedDB)', cloud: 'في حسابك على Claude، خاص بك ويتزامن بين أجهزتك', memory: 'ذاكرة مؤقتة — صدّر نسخة احتياطية قبل الإغلاق' }[ST.mode]}</p>
  </div></div>`;
}
async function createDemo() {
  $('#app').innerHTML = '<div class="splash"><div class="logo">SC</div><div>جارٍ تجهيز البيانات التجريبية…</div></div>';
  await new Promise(r => setTimeout(r, 30));
  const D = window.SCDemo.build();
  D.settings.vaultSalt = CR.newSalt();
  for (const u of window.SCDemo.users) { const salt = CR.newSalt(); D.users.push({ id: C.uid('u'), name: u.name, role: u.role, entityIds: u.entityIds, approveClose: !!u.approveClose, salt, hash: await CR.pinHash(u.pin, salt), active: true }); }
  S = D; WS = 'demo'; S._rev = 1;
  VKEY = await CR.key('123456', S.settings.vaultSalt); S._vaultOpen = true;
  await save(); await ST.flush();
  S._vaultOpen = false; VKEY = null; lastVaultPlain = null;
  setWs('demo'); await loadWorkspace('demo');
}
function setupReal() {
  $('#app').innerHTML = `<div class="auth"><div class="auth-card wide"><h2>تجهيز مساحة البيانات الفعلية</h2>
  <form id="setupForm" class="form">
    <label>اسم المالك<input name="name" required value="د. حسام"></label>
    <label>كلمة مرور المالك (6 أحرف على الأقل) — تفتح الخزنة الشخصية المشفّرة<input name="pass" type="password" minlength="6" required autocomplete="new-password"></label>
    <label>تأكيد كلمة المرور<input name="pass2" type="password" minlength="6" required autocomplete="new-password"></label>
    <fieldset><legend>الفروع النشطة (تقدر تعدّلها لاحقًا من الإعدادات)</legend>
      <label class="chk"><input type="checkbox" name="b1" checked> الهدي سمارت – أكتوبر</label>
      <label class="chk"><input type="checkbox" name="b2" checked> كيو دينتال – فيصل</label>
      <label class="chk"><input type="checkbox" name="b3" checked> جراند كلينك – الحصري</label>
      <label>فرع آخر (اختياري)<input name="b4" placeholder="اسم الفرع"></label>
    </fieldset>
    <label class="chk"><input type="checkbox" name="accts" checked> أنشئ لكل فرع: خزنة + فودافون كاش + ماكينة POS، وحساب بنكي مركزي للإدارة يستقبل إنستاباي</label>
    <p class="muted small">كلمة مرور المالك لا تُخزن، ولا يمكن استرجاعها. لو نسيتها لن تُفتح الخزنة الشخصية. احتفظ بنسخة احتياطية مشفّرة.</p>
    <div class="row"><button class="btn primary">إنشاء المساحة</button><button type="button" class="btn" data-act="welcome">رجوع</button></div>
  </form></div></div>`;
  $('#setupForm').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    if (f.get('pass') !== f.get('pass2')) return toast('كلمتا المرور غير متطابقتين', 'err');
    const N = C.emptyState('real'); N.settings.vaultSalt = CR.newSalt();
    const names = []; if (f.get('b1')) names.push('الهدي سمارت – أكتوبر'); if (f.get('b2')) names.push('كيو دينتال – فيصل'); if (f.get('b3')) names.push('جراند كلينك – الحصري'); if ((f.get('b4') || '').trim()) names.push(f.get('b4').trim());
    const T = C.today();
    if (f.get('accts')) N.accounts.push({ id: C.uid('a'), name: 'الحساب البنكي المركزي (الإدارة)', entityId: 'admin', type: 'bank', opening: 0, openingDate: T, active: true });
    for (const n of names) {
      const id = C.uid('b'); N.entities.push({ id, name: n, type: 'branch', active: true, assume: { mode: 'auto', monthlyIn: 0, monthlyOut: 0, monthlyNewClaims: 0, claimLagDays: 60 }, depreciationMonthly: 0 });
      if (f.get('accts')) { const bank = N.accounts[0].id; N.accounts.push({ id: C.uid('a'), name: 'خزنة ' + n, entityId: id, type: 'cash', opening: 0, openingDate: T, active: true }, { id: C.uid('a'), name: 'فودافون كاش ' + n, entityId: id, type: 'wallet', opening: 0, openingDate: T, active: true }, { id: C.uid('a'), name: 'ماكينة POS ' + n, entityId: id, type: 'pos', opening: 0, openingDate: T, linkedBankId: bank, settleDays: 2, feePct: 1.5, active: true }); }
    }
    const salt = CR.newSalt(); const owner = { id: C.uid('u'), name: f.get('name'), role: 'owner', entityIds: [], salt, hash: await CR.pinHash(f.get('pass'), salt), active: true };
    N.users.push(owner);
    S = N; WS = 'real'; S._rev = 1; VKEY = await CR.key(f.get('pass'), S.settings.vaultSalt); S._vaultOpen = true;
    C.audit(S, owner, 'create', 'workspace', 'real', null, { branches: names });
    await save(); await ST.flush(); setWs('real');
    U = owner; startIdle(); renderShell(); go('settings'); toast('تم إنشاء المساحة — أدخل الأرصدة الافتتاحية من «الإعدادات ← الحسابات»', 'ok');
  };
}
function loginScreen() {
  const users = S.users.filter(u => u.active !== false);
  $('#app').innerHTML = `<div class="auth"><div class="auth-card">
    <div class="logo big">SC</div><h2>تسجيل الدخول</h2>
    <div class="ws-tag ${WS}">${WS === 'demo' ? 'مساحة البيانات التجريبية' : 'مساحة البيانات الفعلية'}</div>
    <form id="loginForm" class="form">
      <label>المستخدم<select name="u">${users.map(u => opt(u.id, u.name + ' — ' + C.ROLES[u.role])).join('')}</select></label>
      <label>الرقم السري / كلمة المرور<input name="pin" type="password" inputmode="text" autocomplete="current-password" required></label>
      ${WS === 'demo' ? '<p class="muted small">للتجربة: المالك 123456، مدير الفرع 2222، المحاسب 3333، الكاشير 4444</p>' : ''}
      <button class="btn primary block">دخول</button>
    </form>
    <div class="row center small"><button class="link" data-act="switchWs">${WS === 'demo' ? 'الانتقال للبيانات الفعلية' : 'فتح البيانات التجريبية'}</button></div>
  </div></div>`;
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    if (Date.now() < UI.lockUntil) return toast('محاولات كثيرة — انتظر قليلًا', 'err');
    const f = new FormData(e.target); const u = S.users.find(x => x.id === f.get('u'));
    const h = await CR.pinHash(f.get('pin'), u.salt);
    if (h !== u.hash) { UI.fails++; if (UI.fails >= 5) { UI.lockUntil = Date.now() + 30000; UI.fails = 0; } return toast('رقم سري غير صحيح', 'err'); }
    UI.fails = 0; U = u;
    if (u.role === 'owner') { try { await openVault(f.get('pin')); } catch (err) { toast('تعذر فتح الخزنة الشخصية: ' + err.message, 'err'); } }
    C.audit(S, U, 'login', 'session', U.id, null, null); commitQuiet();
    startIdle(); renderShell(); go(location.hash.slice(1) || 'home');
  };
}
function commitQuiet() { S._rev++; clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); }
let idleT = null;
function startIdle() { const reset = () => { clearTimeout(idleT); idleT = setTimeout(() => logout('تم القفل تلقائيًا بعد 20 دقيقة خمول'), 20 * 60000); }; ['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, reset, { passive: true })); reset(); }
async function logout(msg) { await save(); await ST.flush(); U = null; VKEY = null; await loadWorkspace(WS); loginScreen(); if (msg) toast(msg); }

/* ---------- الهيكل والتنقل ---------- */
const NAV = [
  { id: 'home', t: 'الرئيسية', g: 'يومي' }, { id: 'day', t: 'شاشة اليوم', g: 'يومي' }, { id: 'txns', t: 'الحركات', g: 'يومي', perm: 'view' }, { id: 'close', t: 'إقفال اليوم', g: 'يومي', perm: 'record' },
  { id: 'balances', t: 'الأرصدة والمطابقة', g: 'يومي', perm: 'view' }, { id: 'claims', t: 'الآجل والمستحقات', g: 'يومي', perm: 'view' }, { id: 'liabilities', t: 'الالتزامات والأقساط', g: 'يومي', perm: 'view' }, { id: 'reports', t: 'التقارير', g: 'يومي', perm: 'view' },
  { id: 'radar', t: 'رادار السيولة', g: 'التخطيط', perm: 'forecast' }, { id: 'whatif', t: 'محاكي «ماذا لو؟»', g: 'التخطيط', perm: 'scenario' }, { id: 'decide', t: 'محرك القرار', g: 'التخطيط', perm: 'decide' }, { id: 'analysis', t: 'التحليل المالي الشامل', g: 'التخطيط', perm: 'decide' },
  { id: 'vault', t: 'الخزنة الشخصية', g: 'المالك', perm: 'vault' }, { id: 'projects', t: 'المزرعة والمشاريع', g: 'المالك', perm: 'vault' },
  { id: 'import', t: 'استيراد Excel', g: 'الإدارة', perm: 'import' }, { id: 'settings', t: 'الإعدادات', g: 'الإدارة', perm: 'settings' }, { id: 'audit', t: 'سجل التدقيق', g: 'الإدارة', perm: 'audit' }, { id: 'backup', t: 'النسخ الاحتياطي', g: 'الإدارة', perm: 'settings' }
];
const navOk = n => !n.perm || can(n.perm) || (n.id === 'close' && can('close'));
const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', day: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  radar: '<path d="M3 17l5-6 4 4 8-9"/><path d="M3 21h18"/>', more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>', plus: '<path d="M12 5v14M5 12h14"/>'
};
const svg = k => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICON[k] + '</svg>';
function renderShell() {
  const groups = {}; NAV.filter(navOk).forEach(n => (groups[n.g] = groups[n.g] || []).push(n));
  $('#app').innerHTML = `
  ${WS === 'demo' ? '<div class="demo-bar">بيانات تجريبية — كل الأرقام افتراضية للتجربة فقط</div>' : ''}
  <header class="top">
    <button class="icon-btn only-m" data-act="toggleSide" aria-label="القائمة">☰</button>
    <div class="brand"><span class="logo">SC</span><span class="bt">Smart Care <small>الإدارة المالية والسيولة</small></span></div>
    <select id="ef" class="ef" aria-label="الجهة">${opt('all', 'كل الجهات المتاحة')}${S.entities.filter(e => visIds().includes(e.id)).map(e => opt(e.id, e.name + (e.active === false ? ' (موقوف)' : ''), UI.ef === e.id)).join('')}</select>
    <span id="sync" class="sync ok">تم الحفظ</span>
    <button class="user-chip" data-act="userMenu">${esc(U.name)} <small>${C.ROLES[U.role]}</small></button>
  </header>
  <aside class="side" id="side">${Object.keys(groups).map(g => '<div class="ng">' + g + '</div>' + groups[g].map(n => '<a href="#' + n.id + '" data-nav="' + n.id + '">' + n.t + '</a>').join('')).join('')}
    <div class="side-foot small muted">${{ local: 'الحفظ: على هذا الجهاز', cloud: 'الحفظ: حسابك (خاص ومتزامن)', memory: 'الحفظ: مؤقت' }[ST.mode]}<br>الإصدار ${APP_VERSION}</div></aside>
  <main id="main" tabindex="-1"></main>
  <nav class="bottom">
    <a href="#home" data-nav="home">${svg('home')}<span>الرئيسية</span></a>
    <a href="#day" data-nav="day">${svg('day')}<span>اليوم</span></a>
    <button class="fab" data-act="quick" aria-label="تسجيل سريع">${svg('plus')}</button>
    ${can('forecast') ? '<a href="#radar" data-nav="radar">' + svg('radar') + '<span>السيولة</span></a>' : '<a href="#close" data-nav="close">' + svg('day') + '<span>الإقفال</span></a>'}
    <button data-act="toggleSide">${svg('more')}<span>المزيد</span></button>
  </nav>
  <div id="modal" class="modal" hidden><div class="sheet" role="dialog" aria-modal="true"><div class="mh"><b id="mt"></b><button class="icon-btn" data-act="closeModal" aria-label="إغلاق">✕</button></div><div id="mb"></div></div></div>
  <div id="toasts"></div>`;
  $('#ef').onchange = e => { UI.ef = e.target.value; render(); };
  syncBadge(ST.status === 'offline' ? 'offline' : 'saved', ST.pending.size);
}
function go(v) { const n = NAV.find(x => x.id === v); if (!n || !navOk(n)) v = 'home'; UI.view = v; if (location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v); render(); document.body.classList.remove('side-open'); const m = $('#main'); if (m) m.scrollTop = 0; window.scrollTo(0, 0); }
window.addEventListener('hashchange', () => { if (U) go(location.hash.slice(1)); });
function render() {
  if (!U || !$('#main')) return;
  UI.charts.forEach(c => { try { c.destroy(); } catch (e) { /* */ } }); UI.charts = []; UI.post = [];
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === UI.view));
  let html; try { html = (VIEWS[UI.view] || VIEWS.home)(); } catch (e) { console.error(e); html = card('حدث خطأ في العرض', '<pre class="err">' + esc(e.stack || e.message) + '</pre>'); }
  $('#main').innerHTML = html;
  UI.post.forEach(f => { try { f(); } catch (e) { console.error(e); } });
}

/* ---------- الرسوم ---------- */
function chart(id, cfg) {
  UI.post.push(async () => {
    try { if (!window.Chart) await loadScript(LIB.chart); } catch (e) { const el = document.getElementById(id); if (el) el.parentElement.innerHTML = '<div class="muted small">الرسم يحتاج اتصالًا لأول مرة</div>'; return; }
    const el = document.getElementById(id); if (!el) return;
    const css = getComputedStyle(document.documentElement);
    Chart.defaults.font.family = css.getPropertyValue('--font'); Chart.defaults.color = css.getPropertyValue('--muted').trim();
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { rtl: true, callbacks: { label: c => ' ' + c.dataset.label + ': ' + fmt(c.parsed.y) } } }, scales: { y: { ticks: { callback: v => fmt(v) }, grid: { color: css.getPropertyValue('--line') } }, x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } } } }, cfg.options || {});
    UI.charts.push(new Chart(el, cfg));
  });
}
const COL = { pri: '#0f6e6a', in: '#1a7f4b', out: '#c2410c', net: '#334155', res: '#b91c1c', alt: ['#0f6e6a', '#7c3aed', '#c2410c', '#0369a1', '#a16207'] };

/* ---------- الواجهات ---------- */
const VIEWS = {};
VIEWS.home = function () {
  const T = C.today(); const ids = efIds();
  const tbl = C.methodTable(S, { entityIds: ids, from: T, to: T });
  const liq = C.liquidityTiers(S, ids).tiers;
  const ob = C.obligationsWithin(S, ids, 30);
  let html = '<div class="page-h"><h2>الرئيسية</h2><span class="muted">' + fdate(T) + ' — توقيت القاهرة</span></div>';
  html += '<div class="quick-row">' + [['income', 'إيراد'], ['expense', 'مصروف'], ['transfer', 'تحويل'], ['refund', 'استرداد'], ['closeday', 'إقفال اليوم']].map(([k, t]) => '<button class="qbtn q-' + k + '" data-act="form" data-f="' + k + '">' + t + '</button>').join('') + '</div>';
  html += '<div class="kpis">' + kpi('تحصيل اليوم', money(tbl.total.rev)) + kpi('مصروف اليوم', money(tbl.total.exp)) + kpi('صافي اليوم', money(tbl.total.net), tbl.total.ref ? 'مردودات ' + fmt(tbl.total.ref) : '') + kpi('السيولة المتاحة', money(liq.now), liq.posPending ? 'قيد تسوية POS: ' + fmt(liq.posPending) : '') + '</div>';
  if (U.role === 'cashier') return html + card('حركات اليوم', txnList(S.txns.filter(t => t.date === T && ids.includes(t.entityId)).slice(-30).reverse()));
  // تنبيهات الرادار
  if (can('forecast')) {
    const fc = C.forecast(S, {}); const sid = pickSeries(fc, ids); const st = C.seriesStats(fc, sid, 90);
    const alerts = [];
    if (st.firstBelowDate) alerts.push('<a href="#radar" class="alert bad">الرصيد المتوقع لـ' + esc(fc.series[sid].name) + ' ينزل تحت الاحتياطي يوم ' + fdate(st.firstBelowDate) + ' — الفجوة ' + fmt(st.gap) + ' ج.م</a>');
    const late = S.claims.filter(c => !c.voided && ids.includes(c.entityId) && C.claimStatus(S, c).outstanding > 0 && c.expectedDate < T);
    if (late.length) alerts.push('<a href="#claims" class="alert warn">' + late.length + ' مطالبة/آجل متأخرة عن موعد التحصيل بإجمالي ' + fmt(late.reduce((s, c) => s + C.claimStatus(S, c).outstanding, 0)) + ' ج.م</a>');
    const unclosed = branchesVis().filter(e => e.type === 'branch' && ids.includes(e.id) && S.txns.some(t => t.entityId === e.id && t.date === C.addDays(T, -1)) && !C.isDayLocked(S, e.id, C.addDays(T, -1)));
    if (unclosed.length) alerts.push('<a href="#close" class="alert warn">يوم أمس غير مقفل في: ' + unclosed.map(e => esc(e.name)).join('، ') + '</a>');
    if (alerts.length) html += '<div class="alerts">' + alerts.join('') + '</div>';
    html += '<div class="grid2">' + card('السيولة المتوقعة — 90 يوم', '<div class="chart"><canvas id="ch_fc"></canvas></div><div class="small muted">أقل رصيد ' + fmt(st.min) + ' يوم ' + fdate(st.minDate) + ' • الاحتياطي ' + fmt(st.reserve) + '</div>', '<a href="#radar" class="link">التفاصيل</a>');
    const days = 90; const lab = [], bal = [], res = [];
    for (let d = 0; d < days; d += 1) { lab.push(fdate(C.addDays(T, d)).slice(0, 5)); bal.push(Math.round(fc.series[sid].bal[d])); res.push(st.reserve); }
    chart('ch_fc', { type: 'line', data: { labels: lab, datasets: [{ label: 'الرصيد المتوقع', data: bal, borderColor: COL.pri, backgroundColor: 'rgba(15,110,106,.08)', fill: true, pointRadius: 0, tension: .25 }, { label: 'الاحتياطي', data: res, borderColor: COL.res, borderDash: [5, 4], pointRadius: 0 }] } });
  } else html += '<div class="grid2">';
  // آخر 30 يوم
  const lab2 = [], r = [], x = [], n = [];
  for (let d = -29; d <= 0; d++) { const dt = C.addDays(T, d); const m = C.methodTable(S, { entityIds: ids, from: dt, to: dt }).total; lab2.push(fdate(dt).slice(0, 5)); r.push(m.rev); x.push(m.exp + m.ref); n.push(m.net); }
  html += card('الإيرادات والمصروفات — آخر 30 يوم', '<div class="chart"><canvas id="ch_30"></canvas></div>') + '</div>';
  chart('ch_30', { type: 'bar', data: { labels: lab2, datasets: [{ label: 'الإيرادات', data: r, backgroundColor: COL.in }, { label: 'المصروفات والمردودات', data: x, backgroundColor: COL.out }, { type: 'line', label: 'الصافي', data: n, borderColor: COL.net, pointRadius: 0 }] } });
  html += '<div class="grid2">' + card('أقرب الالتزامات (30 يوم)', ob.items.length ? '<table class="t"><thead><tr><th>التاريخ</th><th>البند</th><th>المبلغ</th></tr></thead><tbody>' + ob.items.slice(0, 8).map(i => '<tr class="' + (i.overdue ? 'row-bad' : '') + '"><td>' + fdate(i.date) + '</td><td>' + esc(i.label) + (i.overdue ? ' <span class="badge b-bad">متأخر</span>' : '') + '</td><td>' + money(i.amount) + '</td></tr>').join('') + '</tbody><tfoot><tr><td colspan="2">الإجمالي</td><td>' + money(ob.total) + '</td></tr></tfoot></table>' : empty('لا التزامات خلال 30 يوم'), '<a href="#liabilities" class="link">الكل</a>')
    + card('صافي اليوم حسب طريقة الدفع', methodTableHtml(tbl)) + '</div>';
  return html;
};
function pickSeries(fc, ids) { if (UI.ef !== 'all' && fc.series[UI.ef]) return UI.ef; if (U.role === 'owner') return fc.groups.total ? 'total' : 'company'; return ids.find(i => fc.series[i]) || 'company'; }
function methodTableHtml(tbl, opts) {
  opts = opts || {};
  return '<div class="tw"><table class="t mt"><thead><tr><th>طريقة الدفع</th><th>الإيرادات</th><th>المصروفات</th><th>المبالغ المردودة</th><th>صافي الحركة</th><th>إجمالي الفرع</th></tr></thead><tbody>'
    + tbl.rows.filter(r => r.rev || r.exp || r.ref || !opts.compact).map(r => '<tr><td>' + esc(mn(r.methodId)) + '</td><td>' + money(r.rev) + '</td><td>' + money(r.exp) + '</td><td>' + money(r.ref) + '</td><td><b>' + money(r.net) + '</b></td><td></td></tr>').join('')
    + '</tbody><tfoot><tr><td>الإجمالي</td><td>' + money(tbl.total.rev) + '</td><td>' + money(tbl.total.exp) + '</td><td>' + money(tbl.total.ref) + '</td><td>' + money(tbl.total.net) + '</td><td><b>' + money(tbl.total.net) + '</b><div class="small muted">إيرادات ' + fmt(tbl.total.rev) + ' − مصروفات ' + fmt(tbl.total.exp) + ' − مردودات ' + fmt(tbl.total.ref) + '</div></td></tr></tfoot></table></div>'
    + ((tbl.fin.in || tbl.fin.out || tbl.fin.transfers) ? '<div class="small muted">خارج الجدول: تحويلات بين الحسابات ' + fmt(tbl.fin.transfers) + ' • حركات تمويلية واردة ' + fmt(tbl.fin.in) + ' / صادرة ' + fmt(tbl.fin.out) + ' (لا تدخل في مبيعات أو مصروفات التشغيل)</div>' : '');
}
VIEWS.day = function () {
  const T = UI.dayDate || C.today();
  const list = branchesVis().filter(e => efIds().includes(e.id));
  let html = '<div class="page-h"><h2>شاشة اليوم</h2><input type="date" value="' + T + '" data-change="dayDate" class="inp-s"></div>';
  html += '<div class="quick-row">' + [['income', 'إيراد'], ['expense', 'مصروف'], ['transfer', 'تحويل'], ['refund', 'استرداد'], ['closeday', 'إقفال اليوم']].map(([k, t]) => '<button class="qbtn q-' + k + '" data-act="form" data-f="' + k + '">' + t + '</button>').join('') + '</div>';
  for (const e of list) {
    const tbl = C.methodTable(S, { entityIds: [e.id], from: T, to: T });
    const p = C.pnl(S, [e.id], T, T); const cash = C.entityCash(S, e.id);
    const locked = C.isDayLocked(S, e.id, T);
    const three = '<div class="kpis three">' + kpi('صافي الحركة اليومية ' + info('الإيرادات المحصلة − المصروفات المدفوعة − المردودات في هذا اليوم'), money(tbl.total.net)) + kpi('الربح التشغيلي ' + info('على أساس الاستحقاق: يشمل الإيراد الآجل/التأمين المستحق والمصروفات المستحقة والإهلاك'), money(p.operatingProfit)) + kpi('السيولة المتاحة للسداد ' + info('أرصدة حسابات هذه الجهة المعتمدة، بدون مبالغ POS قيد التسوية'), money(cash.cash), cash.posPending ? 'قيد التسوية ' + fmt(cash.posPending) : '') + '</div>';
    const diffs = [];
    if (p.claimsAccrued) diffs.push('إيراد آجل/تأمين مستحق ' + fmt(p.claimsAccrued) + ' لم يدخل النقد');
    if (p.payablesAccrued) diffs.push('مصروفات مستحقة ' + fmt(p.payablesAccrued) + ' لم تُدفع');
    if (p.depreciation) diffs.push('إهلاك غير نقدي ' + fmt(p.depreciation));
    if (cash.posPending) diffs.push('POS قيد التسوية ' + fmt(cash.posPending));
    if (p.liabilityPaid) diffs.push('أقساط مدفوعة ' + fmt(p.liabilityPaid));
    html += card(esc(e.name) + (locked ? ' <span class="badge b-act">مقفل</span>' : ''), three + (diffs.length ? '<div class="small muted">سبب الفرق بين الأرقام الثلاثة: ' + diffs.join(' • ') + '</div>' : '') + methodTableHtml(tbl), '<button class="btn sm" data-act="form" data-f="closeday" data-e="' + e.id + '">إقفال</button>');
  }
  if (!list.length) html += empty('لا توجد جهات متاحة لك');
  return html;
};
function txnAmount(t) { return (t.kind === 'transfer' || t.kind === 'settlement') ? +t.amount : C.lineTotal(t); }
function txnList(list, withActions) {
  if (!list.length) return empty('لا توجد حركات');
  return '<div class="tw"><table class="t"><thead><tr><th>التاريخ</th><th>النوع</th><th>الجهة</th><th>التفاصيل</th><th>المبلغ</th><th>الحالة</th>' + (withActions ? '<th></th>' : '') + '</tr></thead><tbody>' + list.map(t => {
    const det = (t.kind === 'transfer' || t.kind === 'settlement') ? esc(an(t.fromAccountId)) + ' ← ' + esc(an(t.toAccountId)) + (t.finSub ? ' <span class="badge b-asm">' + C.FIN_LABELS[t.finSub] + '</span>' : '') + (t.kind === 'settlement' ? ' (إجمالي ' + fmt(t.gross) + ' رسوم ' + fmt(t.fee) + ')' : '') : (t.lines || []).map(l => esc(mn(l.methodId)) + ' ' + fmt(l.amount) + ' <span class="muted">(' + esc(an(l.accountId)) + ')</span>').join(' + ');
    const st = t.voided ? '<span class="badge b-bad">ملغاة</span>' : t.reversedBy ? '<span class="badge b-asm">معكوسة</span>' : t.reversalOf ? '<span class="badge b-asm">قيد تصحيح</span>' : ST.pending.size && ST.queue[WS + '|tx-' + t.date] ? '<span class="badge b-est">بانتظار المزامنة</span>' : '<span class="badge b-act">' + (ST.mode === 'cloud' ? 'متزامنة' : 'محفوظة') + '</span>';
    const kindL = t.kind === 'financing' ? C.FIN_LABELS[t.sub] : C.KIND_LABELS[t.kind];
    return '<tr><td>' + fdate(t.date) + ' <span class="muted small">' + (t.time || '') + '</span></td><td>' + kindL + (t.categoryId ? '<div class="small muted">' + esc(cn(t.categoryId)) + '</div>' : '') + '</td><td>' + esc(en(t.entityId)) + '</td><td>' + det + (t.note ? '<div class="small muted">' + esc(t.note) + '</div>' : '') + (t.ref ? '<div class="small muted">مرجع: ' + esc(t.ref) + '</div>' : '') + '</td><td>' + money(txnAmount(t)) + '</td><td>' + st + '<div class="small muted">' + esc(t.userName || '') + '</div></td>' + (withActions ? '<td class="nowrap">' + (t.attId ? '<button class="btn xs" data-act="viewAtt" data-id="' + t.attId + '">مرفق</button> ' : '') + (can('review') && !t.reversedBy && !t.reversalOf && !t.voided && !/_fee$/.test(t.id) ? '<button class="btn xs" data-act="reverse" data-id="' + t.id + '">قيد تصحيح</button>' : '') + '</td>' : '') + '</tr>';
  }).join('') + '</tbody></table></div>';
}
VIEWS.txns = function () {
  const f = UI.txf; const ids = efIds();
  let list = S.txns.filter(t => ids.includes(t.entityId) && (!f.kind || t.kind === f.kind) && (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to));
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter(t => JSON.stringify([t.note, t.ref, t.id, cn(t.categoryId), en(t.entityId), C.lineTotal(t), t.amount]).toLowerCase().includes(q)); }
  const total = list.length; list = list.slice(-300).reverse();
  return '<div class="page-h"><h2>الحركات</h2><button class="btn primary" data-act="quick">تسجيل حركة</button></div>'
    + '<div class="filters"><input placeholder="بحث: مرجع، ملاحظة، مبلغ…" value="' + esc(f.q) + '" data-change="txf.q"><select data-change="txf.kind">' + opt('', 'كل الأنواع') + Object.keys(C.KIND_LABELS).map(k => opt(k, C.KIND_LABELS[k], f.kind === k)).join('') + '</select><input type="date" value="' + f.from + '" data-change="txf.from"><input type="date" value="' + f.to + '" data-change="txf.to"></div>'
    + card('<span>' + fmt(total) + ' حركة' + (total > 300 ? ' (أحدث 300)' : '') + '</span>', txnList(list, true));
};
VIEWS.balances = function () {
  const ids = efIds(); const accs = S.accounts.filter(a => ids.includes(a.entityId));
  const T = C.today();
  let rows = '';
  for (const a of accs) {
    const L = C.accountLedger(S, a.id); const v = a.verified; const old = !v || C.diffDays(v.date, T) > 7;
    rows += '<tr' + (a.active === false ? ' class="muted"' : '') + '><td><b>' + esc(a.name) + '</b><div class="small muted">' + C.ACCOUNT_TYPES[a.type] + ' • ' + esc(en(a.entityId)) + '</div></td><td>' + money(L.opening) + '<div class="small muted">' + fdate(L.openingDate) + '</div></td><td>' + money(L.in) + '</td><td>' + money(-L.out) + '</td><td>' + money(L.tin) + ' / ' + money(-L.tout) + '</td><td><b>' + money(L.book) + '</b></td><td>' + (v ? money(v.amount) + '<div class="small ' + (old ? 'warn-t' : 'muted') + '">آخر مطابقة ' + fdate(v.date) + '</div>' : '<span class="badge b-est">لم تتم مطابقة</span>') + '</td><td>' + (v ? money(L.approved) : '—') + (v && Math.abs(L.approved - L.book) > 0.5 ? '<div class="small warn-t">فرق عن الدفاتر ' + fmt(L.approved - L.book) + '</div>' : '') + '</td><td>' + (a.type === 'pos' ? (L.book > 0.5 && can('record') ? '<button class="btn xs" data-act="form" data-f="settlement" data-acc="' + a.id + '">تسوية</button>' : '') : (can('review') ? '<button class="btn xs" data-act="form" data-f="verify" data-acc="' + a.id + '">مطابقة</button>' : '')) + '</td></tr>';
  }
  const own = {}; for (const a of accs) { if (a.type === 'pos') continue; (own[a.entityId] = own[a.entityId] || 0); own[a.entityId] += C.accountLedger(S, a.id).approved; }
  const pend = C.posPendingList(S, ids);
  return '<div class="page-h"><h2>الأرصدة والمطابقة</h2></div>'
    + card('أرصدة الحسابات', '<div class="tw"><table class="t"><thead><tr><th>الحساب</th><th>رصيد البداية</th><th>داخل</th><th>خارج</th><th>تحويلات داخل/خارج</th><th>رصيد الدفاتر المتوقع</th><th>الرصيد الفعلي المتحقق منه</th><th>الرصيد المعتمد الآن ' + info('الرصيد الفعلي في آخر مطابقة + الحركات بعدها') + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div><p class="small muted">الحساب المشترك (مثل البنك المركزي الذي يستقبل إنستاباي من عدة فروع) يظهر رصيده مرة واحدة هنا عند الجهة المالكة له، بينما تظهر تحصيلات كل فرع في تقرير الفرع.</p>')
    + '<div class="grid2">' + card('الرصيد حسب الجهة المالكة للحساب', '<table class="t"><tbody>' + Object.keys(own).map(k => '<tr><td>' + esc(en(k)) + '</td><td>' + money(own[k]) + '</td></tr>').join('') + '</tbody></table>')
    + card('مبالغ POS قيد التسوية', pend.length ? '<table class="t"><thead><tr><th>الماكينة</th><th>المبلغ المعلق</th><th>يصل إلى</th><th></th></tr></thead><tbody>' + pend.map(p => '<tr><td>' + esc(p.account.name) + '</td><td>' + money(p.pending) + '</td><td>' + esc(an(p.account.linkedBankId)) + ' خلال ' + (p.account.settleDays || 1) + ' يوم</td><td>' + (can('record') ? '<button class="btn xs" data-act="form" data-f="settlement" data-acc="' + p.account.id + '">تسوية</button>' : '') + '</td></tr>').join('') + '</tbody></table>' : empty('لا توجد مبالغ معلقة')) + '</div>';
};
VIEWS.close = function () {
  const T = C.today(); const ids = efIds().filter(id => { const e = S.entities.find(x => x.id === id); return e && e.type !== 'owner'; });
  const recent = S.closings.filter(c => ids.includes(c.entityId)).slice(-40).reverse();
  return '<div class="page-h"><h2>إقفال اليوم</h2>' + (can('close') ? '<button class="btn primary" data-act="form" data-f="closeday">إقفال يوم</button>' : '<span class="muted small">اعتماد الإقفال يحتاج إذنًا من المالك</span>') + '</div>'
    + '<div class="kpis">' + ids.map(id => { const y = C.addDays(T, -1); const st = C.isDayLocked(S, id, T) ? 'اليوم مقفل' : C.isDayLocked(S, id, y) ? 'أمس مقفل' : 'أمس غير مقفل'; return kpi(esc(en(id)), st, '', st === 'أمس غير مقفل' ? 'warn' : ''); }).join('') + '</div>'
    + card('سجل الإقفالات', recent.length ? '<div class="tw"><table class="t"><thead><tr><th>اليوم</th><th>الجهة</th><th>الحركات</th><th>الإيرادات</th><th>المصروفات</th><th>الصافي</th><th>فروق العد</th><th>بواسطة</th><th>الحالة</th><th></th></tr></thead><tbody>' + recent.map(c => { const diffs = Object.keys(c.counted || {}).map(k => c.counted[k]).filter(x => x.diff); return '<tr><td>' + fdate(c.date) + '</td><td>' + esc(en(c.entityId)) + '</td><td>' + c.count + '</td><td>' + money(c.totals.rev) + '</td><td>' + money(c.totals.exp) + '</td><td>' + money(c.totals.net) + '</td><td>' + (diffs.length ? diffs.map(x => '<span class="' + (x.diff < 0 ? 'neg' : 'pos') + '">' + fmt(x.diff) + '</span> ' + esc(x.reason || '')).join('<br>') : '<span class="muted">مطابق</span>') + '</td><td>' + esc(c.by) + '<div class="small muted">' + c.at + '</div></td><td>' + (c.status === 'closed' ? '<span class="badge b-act">مقفل</span>' : '<span class="badge b-est">أعيد فتحه</span><div class="small muted">' + esc(c.reopenedBy || '') + ': ' + esc(c.reopenReason || '') + '</div>') + '</td><td>' + (c.status === 'closed' && can('reopen') ? '<button class="btn xs" data-act="reopen" data-id="' + c.id + '">إعادة فتح</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' : empty('لا توجد إقفالات بعد'));
};
VIEWS.claims = function () {
  const ids = efIds(); const T = C.today();
  const cl = S.claims.filter(c => !c.voided && ids.includes(c.entityId)).map(c => Object.assign({ c }, C.claimStatus(S, c))).sort((a, b) => b.outstanding - a.outstanding);
  const py = S.payables.filter(p => !p.voided && ids.includes(p.entityId)).map(p => Object.assign({ p }, C.payableStatus(S, p))).sort((a, b) => a.p.dueDate < b.p.dueDate ? -1 : 1);
  const totO = cl.reduce((s, x) => s + Math.max(0, x.outstanding), 0), totP = py.reduce((s, x) => s + Math.max(0, x.outstanding), 0);
  return '<div class="page-h"><h2>الإيراد الآجل والمطالبات والمستحقات</h2><div class="row"><button class="btn" data-act="form" data-f="claim">مطالبة/آجل جديد</button><button class="btn" data-act="form" data-f="payable">مصروف مستحق جديد</button></div></div>'
    + '<div class="kpis">' + kpi('مستحق لنا (آجل + تأمين)', money(totO)) + kpi('مستحق علينا للموردين', money(totP)) + kpi('متأخر عن موعده', money(cl.filter(x => x.outstanding > 0 && x.c.expectedDate < T).reduce((s, x) => s + x.outstanding, 0)), '', 'warn') + '</div>'
    + card('المطالبات والإيراد الآجل', cl.length ? '<div class="tw"><table class="t"><thead><tr><th>الجهة الدافعة</th><th>الفرع</th><th>تاريخ المطالبة</th><th>موعد التحصيل المتوقع</th><th>القيمة</th><th>المحصل</th><th>المتبقي</th><th></th></tr></thead><tbody>' + cl.map(x => '<tr class="' + (x.outstanding > 0 && x.c.expectedDate < T ? 'row-warn' : '') + '"><td>' + esc(x.c.payer) + '</td><td>' + esc(en(x.c.entityId)) + '</td><td>' + fdate(x.c.date) + '</td><td>' + fdate(x.c.expectedDate) + '</td><td>' + money(x.c.amount) + '</td><td>' + money(x.paid) + '</td><td><b>' + money(x.outstanding) + '</b></td><td>' + (x.outstanding > 0 && can('record') ? '<button class="btn xs" data-act="form" data-f="claimpay" data-id="' + x.c.id + '">تحصيل</button>' : '<span class="badge b-act">مكتمل</span>') + '</td></tr>').join('') + '</tbody></table></div>' : empty('لا توجد مطالبات'))
    + card('المصروفات المستحقة', py.length ? '<div class="tw"><table class="t"><thead><tr><th>المورد/الجهة</th><th>على</th><th>التصنيف</th><th>الاستحقاق</th><th>الأولوية</th><th>القيمة</th><th>المدفوع</th><th>المتبقي</th><th></th></tr></thead><tbody>' + py.map(x => '<tr class="' + (x.outstanding > 0 && x.p.dueDate < T ? 'row-bad' : '') + '"><td>' + esc(x.p.payee) + '</td><td>' + esc(en(x.p.entityId)) + '</td><td>' + esc(cn(x.p.categoryId)) + '</td><td>' + fdate(x.p.dueDate) + '</td><td>' + clsLabel(x.p.class) + '</td><td>' + money(x.p.amount) + '</td><td>' + money(x.paid) + '</td><td><b>' + money(x.outstanding) + '</b></td><td>' + (x.outstanding > 0 && can('record') ? '<button class="btn xs" data-act="form" data-f="paypay" data-id="' + x.p.id + '">سداد</button>' : '<span class="badge b-act">مسدد</span>') + '</td></tr>').join('') + '</tbody></table></div>' : empty('لا توجد مستحقات'));
};
const clsLabel = c => ({ mandatory: '<span class="badge b-bad">إلزامي</span>', deferrable: '<span class="badge b-est">قابل للتأجيل</span>', optional: '<span class="badge b-asm">اختياري</span>' }[c || 'mandatory']);
VIEWS.liabilities = function () {
  const ids = efIds(); const T = C.today();
  const Ls = S.liabilities.filter(L => !L.voided && ids.includes(L.entityId));
  const o = [30, 90, 365].map(d => C.obligationsWithin(S, ids, d).total);
  return '<div class="page-h"><h2>الالتزامات والأقساط</h2>' + (can('settings') ? '<button class="btn primary" data-act="form" data-f="liability">التزام جديد</button>' : '') + '</div>'
    + '<div class="kpis">' + kpi('خلال 30 يوم', money(o[0])) + kpi('خلال 90 يوم', money(o[1])) + kpi('خلال 365 يوم', money(o[2])) + kpi('إجمالي المتبقي (أصل)', money(Ls.reduce((s, L) => s + C.liabilitySchedule(S, L).outstanding, 0))) + '</div>'
    + (Ls.length ? Ls.map(L => { const sc = C.liabilitySchedule(S, L); const nx = sc.schedule[0]; return card(esc(L.name) + ' ' + clsLabel(L.class), '<div class="kv-list"><div><span>الجهة</span><b>' + esc(L.lender || '—') + '</b></div><div><span>على</span><b>' + esc(en(L.entityId)) + '</b></div><div><span>القسط</span><b>' + fmt(L.installment) + ' ' + (L.currency || 'EGP') + ' كل ' + (L.frequencyMonths || 1) + ' شهر</b></div>' + (L.currency && L.currency !== 'EGP' ? '<div><span>سعر الصرف</span><b>' + fmt(L.fxRate, 2) + ' (' + fdate(L.fxDate) + ' — ' + esc(L.fxSource || 'غير محدد') + ')</b></div>' : '') + '<div><span>الأقساط المتبقية</span><b>' + sc.schedule.length + '</b></div><div><span>المتبقي من الأصل</span><b>' + fmt(sc.outstanding) + ' ج.م</b></div><div><span>الفائدة السنوية</span><b>' + fmt(L.interestRate || 0, 2) + '%</b></div><div><span>القسط القادم</span><b class="' + (nx && nx.due < T ? 'neg' : '') + '">' + (nx ? fdate(nx.due) + ' — ' + fmt(nx.amount) + ' ج.م' : '—') + '</b></div><div><span>السداد المبكر</span><b>' + esc(L.earlyTerms || (L.earlyPenaltyPct ? 'غرامة ' + L.earlyPenaltyPct + '%' : '—')) + '</b></div></div>'
      + '<details><summary>جدول الأقساط</summary><table class="t"><tbody>' + sc.schedule.slice(0, 24).map(s => '<tr><td>' + (s.idx + 1) + '</td><td>' + fdate(s.due) + '</td><td>' + money(s.amount) + '</td></tr>').join('') + '</tbody></table></details>',
      '<div class="row">' + (can('record') && nx ? '<button class="btn xs" data-act="form" data-f="liabpay" data-id="' + L.id + '">سداد قسط</button>' : '') + (can('settings') ? '<button class="btn xs" data-act="form" data-f="liability" data-id="' + L.id + '">تعديل</button>' : '') + '</div>'); }).join('') : empty('لا توجد التزامات مسجلة'));
};
/* التقارير */
function repRange() {
  const r = UI.rep; const T = C.today();
  if (r.preset === 'day') return [T, T]; if (r.preset === 'week') return [C.addDays(T, -6), T]; if (r.preset === 'month') return [C.monthStart(T), T];
  if (r.preset === 'lastmonth') { const s = C.addMonths(C.monthStart(T), -1); return [s, C.monthEnd(s)]; }
  return [r.from || C.addDays(T, -30), r.to || T];
}
VIEWS.reports = function () {
  const r = UI.rep; const [from, to] = repRange(); const ids = efIds();
  const f = { entityIds: ids, from, to, methodId: r.methodId || null, accountId: r.accountId || null, categoryId: r.categoryId || null };
  const tbl = C.methodTable(S, f); const p = C.pnl(S, ids, from, to);
  const cats = Object.keys(p.byCategory).map(k => ({ k, v: p.byCategory[k] })).sort((a, b) => b.v - a.v);
  // حسب الجهة
  const byE = ids.map(id => { const x = C.pnl(S, [id], from, to); return { id, x }; }).filter(o => o.x.cashIn || o.x.cashOut || o.x.netRevenue);
  return '<div class="page-h"><h2>التقارير</h2><div class="row">' + (can('export') ? '<button class="btn" data-act="exportReport">تصدير Excel</button><button class="btn" data-act="pdf" data-el="#repBody" data-name="تقرير">PDF</button>' : '') + '</div></div>'
    + '<div class="filters"><select data-change="rep.preset">' + [['day', 'اليوم'], ['week', 'آخر 7 أيام'], ['month', 'الشهر الحالي'], ['lastmonth', 'الشهر الماضي'], ['custom', 'بين تاريخين']].map(([k, t]) => opt(k, t, r.preset === k)).join('') + '</select>'
    + (r.preset === 'custom' ? '<input type="date" value="' + (r.from || from) + '" data-change="rep.from"><input type="date" value="' + (r.to || to) + '" data-change="rep.to">' : '')
    + '<select data-change="rep.methodId">' + opt('', 'كل طرق الدفع') + S.methods.map(m => opt(m.id, m.name, r.methodId === m.id)).join('') + '</select>'
    + '<select data-change="rep.accountId">' + opt('', 'كل الحسابات') + S.accounts.filter(a => ids.includes(a.entityId)).map(a => opt(a.id, a.name, r.accountId === a.id)).join('') + '</select>'
    + '<select data-change="rep.categoryId">' + opt('', 'كل التصنيفات') + S.categories.income.concat(S.categories.expense).map(c => opt(c.id, c.name, r.categoryId === c.id)).join('') + '</select></div>'
    + '<div id="repBody"><div class="rep-h"><b>تقرير ' + (UI.ef === 'all' ? 'كل الجهات المتاحة' : esc(en(UI.ef))) + '</b> — من ' + fdate(from) + ' إلى ' + fdate(to) + '</div>'
    + card('صافي الحركة حسب طريقة الدفع', methodTableHtml(tbl))
    + '<div class="grid2">' + card('الربح التشغيلي مقابل التدفق النقدي (المصالحة)', '<table class="t"><tbody>' + [['الإيرادات المحصلة نقدًا', p.revenueCash], ['+ إيراد آجل/تأمين مستحق', p.claimsAccrued], ['− المردودات', -p.refunds], ['= صافي الإيراد', p.netRevenue], ['− مصروفات التشغيل (مدفوعة + مستحقة)', -p.opex], ['− الإهلاك', -p.depreciation], ['= الربح التشغيلي', p.operatingProfit], ['− الفوائد', -p.interest], ['= صافي الربح', p.netProfit]].map(([l, v]) => '<tr' + (l[0] === '=' ? ' class="tot"' : '') + '><td>' + l + '</td><td>' + money(v) + '</td></tr>').join('') + '</tbody></table><h4>من الربح إلى النقد</h4><table class="t"><tbody>' + p.recon.map(x => '<tr' + (x.label[0] === '=' ? ' class="tot"' : '') + '><td>' + x.label + '</td><td>' + money(x.amount) + '</td></tr>').join('') + '</tbody></table>')
    + card('حسب التصنيف', cats.length ? '<table class="t"><tbody>' + cats.map(c => '<tr><td>' + esc(cn(c.k)) + '</td><td>' + money(c.v) + '</td></tr>').join('') + '</tbody></table>' : empty('لا بيانات')) + '</div>'
    + card('حسب الجهة', '<div class="tw"><table class="t"><thead><tr><th>الجهة</th><th>صافي الإيراد</th><th>مصروفات التشغيل</th><th>الربح التشغيلي</th><th>نقد داخل</th><th>نقد خارج</th><th>صافي النقد</th></tr></thead><tbody>' + byE.map(o => '<tr><td>' + esc(en(o.id)) + '</td><td>' + money(o.x.netRevenue) + '</td><td>' + money(o.x.opex) + '</td><td>' + money(o.x.operatingProfit) + '</td><td>' + money(o.x.cashIn) + '</td><td>' + money(o.x.cashOut) + '</td><td><b>' + money(o.x.operatingCash) + '</b></td></tr>').join('') + '</tbody></table></div>')
    + '</div>';
};
/* رادار السيولة */
VIEWS.radar = function () {
  const set = UI.radar.set; const A = S.settings.scen[set];
  const fc = C.forecast(S, { assume: A }); const ids = efIds();
  const sids = [].concat(fc.groups.total ? ['total'] : [], U.role === 'owner' ? ['company'] : [], fc.ids.filter(i => ids.includes(i)));
  let sid = UI.radar.sid && sids.includes(UI.radar.sid) ? UI.radar.sid : pickSeries(fc, ids); if (!sids.includes(sid)) sid = sids[0];
  const s = fc.series[sid]; const st = C.seriesStats(fc, sid);
  const st13 = C.seriesStats(fc, sid, 91);
  const w = C.weeklyRows(fc, sid, 13), m = C.monthlyRows(fc, sid, 24);
  const T = fc.T;
  let html = '<div class="page-h"><h2>رادار السيولة</h2><div class="row"><select data-change="radar.sid">' + sids.map(x => opt(x, fc.series[x].name, x === sid)).join('') + '</select><select data-change="radar.set">' + [['base', 'السيناريو الأساسي'], ['conservative', 'المتحفظ'], ['optimistic', 'المتفائل']].map(([k, t]) => opt(k, t, set === k)).join('') + '</select></div></div>';
  html += '<div class="kpis">' + kpi('أقل رصيد متوقع (24 شهر)', money(st.min), fdate(st.minDate), st.min < st.reserve ? 'bad' : '') + kpi('أقل رصيد خلال 13 أسبوع', money(st13.min), fdate(st13.minDate), st13.min < st13.reserve ? 'bad' : '') + kpi('أول نزول تحت الاحتياطي', st.firstBelowDate ? fdate(st.firstBelowDate) : 'لا يوجد', st.firstBelowDate ? 'الفجوة ' + fmt(st.gap) + ' ج.م' : 'الاحتياطي ' + fmt(st.reserve), st.firstBelowDate ? 'bad' : 'good') + kpi('الرصيد بعد 30 يوم', money(st.b30), 'بعد 90 يوم: ' + fmt(st.b90)) + '</div>';
  const pat = s.members ? s.members.map(id => fc.entities[id]) : [fc.entities[sid]];
  html += '<div class="small muted legend">' + badge('actual') + ' رصيد افتتاحي معتمد ' + badge('scheduled') + ' مواعيد فعلية مسجلة (أقساط، مستحقات، مطالبات، تسويات) ' + badge('pattern') + ' نمط تحصيل/صرف من الحركات الفعلية ' + badge('assumption') + ' افتراض قابل للتعديل من الإعدادات</div>';
  html += card('الرصيد المتوقع', '<div class="seg"><button class="' + (UI.radar.gran === 'week' ? 'on' : '') + '" data-act="radarGran" data-g="week">13 أسبوع</button><button class="' + (UI.radar.gran === 'month' ? 'on' : '') + '" data-act="radarGran" data-g="month">24 شهر</button></div><div class="chart tall"><canvas id="ch_radar"></canvas></div>');
  const days = UI.radar.gran === 'week' ? 91 : fc.H; const step = UI.radar.gran === 'week' ? 1 : 7;
  const lab = [], bal = [], res = []; for (let d = 0; d < days; d += step) { lab.push(fdate(C.addDays(T, d)).slice(0, UI.radar.gran === 'week' ? 5 : 10)); bal.push(Math.round(s.bal[d])); res.push(s.reserve); }
  chart('ch_radar', { type: 'line', data: { labels: lab, datasets: [{ label: 'الرصيد المتوقع', data: bal, borderColor: COL.pri, backgroundColor: 'rgba(15,110,106,.08)', fill: true, pointRadius: 0, tension: .2 }, { label: 'الاحتياطي', data: res, borderColor: COL.res, borderDash: [5, 4], pointRadius: 0 }] } });
  if (st.drivers.length) html += card('أكبر الدفعات المسببة لأقل رصيد', '<table class="t"><tbody>' + st.drivers.map(e => '<tr><td>' + fdate(e.date) + '</td><td>' + evLink(e) + '</td><td>' + money(e.amount) + '</td><td>' + badge(e.src) + '</td></tr>').join('') + '</tbody></table>');
  html += card('أساس التوقع لكل جهة', '<table class="t"><thead><tr><th>الجهة</th><th>رصيد الافتتاح</th><th>تحصيل شهري متوقع</th><th>صرف شهري متوقع</th><th>المصدر</th></tr></thead><tbody>' + pat.map(x => '<tr><td>' + esc(x.name) + '</td><td>' + money(x.open) + ' ' + badge('actual') + '</td><td>' + money(x.pattern.monthlyIn) + '</td><td>' + money(x.pattern.monthlyOut) + '</td><td>' + (x.pattern.src === 'pattern' ? badge('pattern') + ' <span class="small muted">آخر ' + x.pattern.histDays + ' يوم</span>' : badge('assumption')) + '</td></tr>').join('') + '</tbody></table><p class="small muted">النمط يستبعد الأقساط والمستحقات والمطالبات المسجلة لأنها تدخل بتواريخها الفعلية، فلا تُحتسب مرتين. عند تسجيل التحصيل أو السداد الفعلي يُخصم من التوقع تلقائيًا.</p>');
  const rowsHtml = (rows, isW) => '<div class="tw"><table class="t"><thead><tr><th>' + (isW ? 'الأسبوع' : 'الشهر') + '</th><th>رصيد الافتتاح</th><th>المتحصلات</th><th>المدفوعات</th><th>رصيد الإقفال</th><th>أقل رصيد</th><th></th></tr></thead><tbody>' + rows.map((r, i) => '<tr class="' + (r.min < s.reserve ? 'row-bad' : '') + '"><td>' + (isW ? r.w + ' <span class="small muted">' + fdate(r.from).slice(0, 5) + '–' + fdate(r.to).slice(0, 5) + '</span>' : r.month) + '</td><td>' + money(r.open) + '</td><td>' + money(r.in) + '</td><td>' + money(-r.out) + '</td><td><b>' + money(r.close) + '</b></td><td>' + money(r.min) + '</td><td>' + (r.events.length ? '<button class="btn xs" data-act="toggleRow" data-r="' + (isW ? 'w' : 'm') + i + '">' + r.events.length + ' بند</button>' : '') + '</td></tr>' + (r.events.length ? '<tr class="sub" id="r_' + (isW ? 'w' : 'm') + i + '" hidden><td colspan="7"><table class="t inner"><tbody>' + r.events.sort((a, b) => a.d - b.d).map(e => '<tr><td>' + fdate(e.date) + '</td><td>' + evLink(e) + ' <span class="small muted">' + esc(en(e.entityId)) + '</span></td><td>' + money(e.amount) + '</td><td>' + badge(e.src) + '</td></tr>').join('') + '</tbody></table></td></tr>' : '')).join('') + '</tbody></table></div>';
  html += card('التوقع الأسبوعي — أول 13 أسبوع', rowsHtml(w, true)) + card('التوقع الشهري — 24 شهر', rowsHtml(m, false));
  return html;
};
function evLink(e) {
  const map = { claim: 'claims', payable: 'claims', liability: 'liabilities', project: 'projects', account: 'balances' };
  const v = e.ref && map[e.ref.type]; return v ? '<a href="#' + v + '">' + esc(e.label) + '</a>' : esc(e.label);
}
/* محاكي ماذا لو */
VIEWS.whatif = function () {
  const scs = S.scenarios;
  let html = '<div class="page-h"><h2>محاكي «ماذا لو؟»</h2><button class="btn primary" data-act="form" data-f="scenario">سيناريو جديد</button></div>';
  html += '<p class="muted small">كل سيناريو مبني على نسخة مؤرخة من بياناتك وقت إنشائه. التجارب داخله لا تغير أي سجل فعلي. يمكنك تحديث النسخة لتاريخ اليوم في أي وقت.</p>';
  if (!scs.length) return html + empty('أنشئ سيناريو لتجربة شراء جهاز، ضخ مبلغ في المزرعة، فتح فرع، بيع ذهب أو أسهم، سداد مبكر، تأجيل دفعة، أو تأخر التأمين.');
  html += scs.map(sc => card(esc(sc.name) + ' <span class="small muted">نسخة بيانات ' + esc(sc.snapshotAt) + '</span>', (sc.changes.length ? '<ul class="changes">' + sc.changes.map((c, i) => '<li>' + changeLabel(c) + ' <button class="link" data-act="delChange" data-s="' + sc.id + '" data-i="' + i + '">حذف</button></li>').join('') + '</ul>' : '<p class="muted small">لا تغييرات بعد</p>'), '<div class="row"><label class="chk small"><input type="checkbox" data-act="selScen" data-id="' + sc.id + '" ' + (UI.whatif.sel.includes(sc.id) ? 'checked' : '') + '> مقارنة</label><button class="btn xs" data-act="form" data-f="change" data-s="' + sc.id + '">+ تغيير</button><button class="btn xs" data-act="refreshScen" data-id="' + sc.id + '">تحديث النسخة</button><button class="btn xs danger" data-act="delScen" data-id="' + sc.id + '">حذف</button></div>')).join('');
  const sel = scs.filter(s => UI.whatif.sel.includes(s.id));
  if (sel.length) {
    const set = UI.whatif.set || 'base';
    const baseFc = C.forecast(S, { assume: S.settings.scen[set] });
    const gid = baseFc.groups.total ? 'total' : 'company';
    const cols = [{ name: 'الوضع الحالي', fc: baseFc }].concat(sel.map(sc => ({ name: sc.name, fc: C.runScenario(S, sc, set) })));
    const met = cols.map(c => C.scenarioMetrics(S, c.fc, baseFc, gid));
    const rows = [['صافي التدفق التشغيلي المتوقع (24 شهر)', 'profit24'], ['أقل رصيد', 'min'], ['تاريخ أقل رصيد', 'minDate', 'd'], ['أول نزول تحت الاحتياطي', 'firstBelow', 'd'], ['قيمة الفجوة', 'gap'], ['الرصيد بعد 30 يوم', 'b30'], ['الرصيد بعد 90 يوم', 'b90'], ['أكبر مبلغ مربوط مقارنة بالوضع الحالي', 'maxTied'], ['استرداد المبلغ المربوط', 'payback', 'd']];
    html += card('المقارنة جنبًا إلى جنب — ' + (gid === 'total' ? 'الإجمالي' : 'الشركة'), '<div class="seg">' + [['base', 'أساسي'], ['conservative', 'متحفظ'], ['optimistic', 'متفائل']].map(([k, t]) => '<button class="' + (set === k ? 'on' : '') + '" data-act="whatifSet" data-k="' + k + '">' + t + '</button>').join('') + '</div><div class="tw"><table class="t cmp"><thead><tr><th></th>' + cols.map(c => '<th>' + esc(c.name) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(([l, k, t]) => '<tr><td>' + l + '</td>' + met.map(x => '<td>' + (t === 'd' ? (x[k] ? fdate(x[k]) : '—') : money(x[k])) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div><div class="chart tall"><canvas id="ch_cmp"></canvas></div><div id="sens"><button class="btn sm" data-act="sens">أي افتراض يقلب ترتيب البدائل؟</button></div>');
    const lab = []; for (let d = 0; d < baseFc.H; d += 7) lab.push(fdate(C.addDays(baseFc.T, d)));
    chart('ch_cmp', { type: 'line', data: { labels: lab, datasets: cols.map((c, i) => ({ label: c.name, data: lab.map((_, j) => Math.round(c.fc.series[gid].bal[j * 7])), borderColor: COL.alt[i % 5], pointRadius: 0, tension: .2 })).concat([{ label: 'الاحتياطي', data: lab.map(() => baseFc.series[gid].reserve), borderColor: COL.res, borderDash: [5, 4], pointRadius: 0 }]) } });
  }
  return html;
};
function changeLabel(c) {
  const t = C.CHANGE_TYPES[c.type]; const parts = [];
  if (c.label) parts.push(esc(c.label)); if (c.amount) parts.push(fmt(c.amount) + ' ج.م'); if (c.downPayment) parts.push('مقدم ' + fmt(c.downPayment)); if (c.installments) parts.push(c.installments + ' قسط × ' + fmt(c.installmentAmount));
  if (c.monthlyRevenue) parts.push('إيراد شهري ' + fmt(c.monthlyRevenue)); if (c.days) parts.push(c.days + ' يوم'); if (c.pct) parts.push(c.pct + '%'); if (c.months) parts.push(c.months + ' شهر');
  if (c.entityId) parts.push(esc(en(c.entityId))); if (c.assetId) { const a = S.assets.find(x => x.id === c.assetId); if (a) parts.push(esc(a.name)); } if (c.liabilityId) { const L = S.liabilities.find(x => x.id === c.liabilityId); if (L) parts.push(esc(L.name)); } if (c.projectId) { const p = S.projects.find(x => x.id === c.projectId); if (p) parts.push(esc(p.name)); }
  if (c.date) parts.push('من ' + fdate(c.date));
  return '<b>' + t + '</b>: ' + parts.join(' • ');
}
/* محرك القرار */
VIEWS.decide = function () {
  const D = UI.decide; const obj = UI.decideObj;
  let html = '<div class="page-h"><h2>محرك القرار وتخصيص رأس المال</h2><button class="btn primary" data-act="runDecide">' + (D ? 'إعادة الحساب' : 'احسب البدائل') + '</button></div>';
  html += '<div class="seg big">' + [['profit', '1. أعلى ربحية'], ['liquidity', '2. أعلى سيولة'], ['invest', '3. استثمار جديد']].map(([k, t]) => '<button class="' + (obj === k ? 'on' : '') + '" data-act="decObj" data-k="' + k + '">' + t + '</button>').join('') + '</div>';
  html += '<div class="filters"><label class="small">معدل الخصم السنوي ' + info('العائد الذي تتنازل عنه لو استثمرت المبلغ بدل أفضل بديل آمن متاح (مثلاً عائد الشهادات أو تكلفة الاقتراض). يُستخدم لحساب صافي القيمة الحالية NPV') + ' <input type="number" step="0.5" value="' + (S.settings.discountRate * 100) + '" data-change="discount" class="inp-s"> %</label><label class="small">معامل الاحتياطي <select data-change="reserveMult">' + [0.5, 1, 1.5, 2].map(v => opt(v, '×' + v, (UI.reserveMult || 1) == v)).join('') + '</select></label></div>';
  if (!D) return html + card('', '<p>يقارن المحرك كل التوليفات الممكنة من: بدء المشاريع قيد الدراسة (الآن / بعد 3 أو 6 شهور / تجربة مصغرة / تنفيذ مرحلي / عدم البدء)، والسداد المبكر للالتزامات ذات الفائدة، وتأجيل الدفعات القابلة للتأجيل، وبيع جزء من الأصول السائلة. ثم يختبر كل بديل يومًا بيوم على 24 شهرًا في السيناريو المتحفظ.</p><p class="muted small">نتائج المحرك مقترحات فقط، وأي حركة مالية فعلية تبقى قرارك.</p>');
  const best = D.best[obj === 'invest' ? 'balanced' : obj];
  const planRow = (name, r) => r ? '<tr><td><b>' + name + '</b><div class="small muted">' + (r.actions.length ? r.actions.map(a => esc(a.label)).join('، ') : 'الإبقاء على الوضع الحالي') + '</div></td><td>' + money(r.npv) + '</td><td>' + money(r.minCons) + '<div class="small muted">' + fdate(r.minConsDate) + '</div></td><td>' + (r.deficit ? '<span class="neg">' + fmt(r.deficit) + '</span> من ' + fdate(r.firstDeficit) : '<span class="pos">لا عجز</span>') + '</td><td>' + money(r.upfront) + '</td><td>' + money(r.tied) + '</td><td>' + (r.paybackMonths >= 0 ? r.paybackMonths + ' شهر' : '—') + '</td><td>' + fmt(r.hours, 1) + '</td></tr>' : '';
  html += card('النتيجة', '<p class="small muted">' + esc(D.method) + '. تم تقييم ' + D.evaluated + ' بديل، منها ' + D.feasibleCount + ' بديل يحقق كل القيود. الاحتياطي المطبق ' + fmt(D.reserve) + ' ج.م على مستوى ' + (D.gid === 'total' ? 'الإجمالي (الشركة + المالك)' : 'الشركة') + '. معدل الخصم ' + Math.round(D.discountRate * 100) + '%.</p>'
    + (D.binding.length ? '<div class="alerts">' + D.binding.map(b => '<div class="alert warn">' + esc(b) + '</div>').join('') + '</div>' : '')
    + '<div class="tw"><table class="t"><thead><tr><th>الخطة</th><th>NPV ' + info('صافي القيمة الحالية للتدفقات الإضافية مقارنة باستمرار الوضع الحالي على 10 سنوات مع القيمة المتبقية') + '</th><th>أقل رصيد (متحفظ)</th><th>العجز في المتحفظ</th><th>المبلغ المطلوب الآن</th><th>أقصى مبلغ مربوط</th><th>فترة الاسترداد</th><th>ساعات إدارة/أسبوع</th></tr></thead><tbody>'
    + planRow('الخطة 1: تعظيم الربحية', D.best.profit) + planRow('الخطة 2: تعظيم السيولة', D.best.liquidity) + planRow('الخيار المتوازن', D.best.balanced) + planRow('الوضع الحالي', D.statusQuo) + '</tbody></table></div>');
  if (best) html += card('الخطة المختارة للهدف: ' + { profit: 'أعلى ربحية', liquidity: 'أعلى سيولة', invest: 'استثمار جديد (متوازن)' }[obj], (best.actions.length ? '<table class="t"><thead><tr><th>الإجراء</th><th>المبلغ</th><th>التوقيت</th></tr></thead><tbody>' + best.actions.map(a => '<tr><td>' + esc(a.label) + '</td><td>' + money(a.amount) + '</td><td>' + fdate(a.date) + '</td></tr>').join('') + '</tbody></table>' : '<p>أفضل خيار هو الإبقاء على الوضع الحالي.</p>')
    + (obj === 'profit' && D.best.liquidity ? '<p class="small">العائد الإضافي فوق الخطة الأكثر سيولة: <b>' + fmt(best.npv - D.best.liquidity.npv) + ' ج.م</b> (NPV) مقابل نزول أقل رصيد متحفظ بمقدار <b>' + fmt(D.best.liquidity.minCons - best.minCons) + ' ج.م</b>.</p>' : '')
    + (obj === 'liquidity' && D.best.profit ? '<p class="small">الربح المتوقع الذي تتنازل عنه مقابل السيولة الأعلى: <b>' + fmt(D.best.profit.npv - best.npv) + ' ج.م</b> (NPV).</p>' : '')
    + '<p class="small muted">حساسية معدل الخصم: ' + D.discFlip.map(x => Math.round(x.rate * 100) + '% ← ' + (x.same ? 'نفس الاختيار' : 'يتغير إلى: ' + esc(x.alt))).join(' • ') + '</p>');
  html += card('منحنى المفاضلة بين الربح والسيولة', '<div class="chart"><canvas id="ch_front"></canvas></div><div class="tw"><table class="t"><thead><tr><th>#</th><th>البديل</th><th>NPV</th><th>هامش السيولة فوق الاحتياطي</th><th>تغير الربح عن السابق</th></tr></thead><tbody>' + D.frontier.map((r, i) => '<tr><td>' + (i + 1) + '</td><td class="small">' + (r.actions.map(a => esc(a.label)).join('، ') || 'الوضع الحالي') + '</td><td>' + money(r.npv) + '</td><td>' + money(r.headroom) + '</td><td>' + (i ? money(r.npv - D.frontier[i - 1].npv) + ' مقابل ' + money(r.headroom - D.frontier[i - 1].headroom) + ' سيولة' : '') + '</td></tr>').join('') + '</tbody></table></div>');
  chart('ch_front', { type: 'scatter', data: { datasets: [{ label: 'البدائل على المنحنى', data: D.frontier.map(r => ({ x: Math.round(r.headroom), y: Math.round(r.npv) })), backgroundColor: COL.pri, pointRadius: 6, showLine: true, borderColor: COL.pri }] }, options: { scales: { x: { title: { display: true, text: 'هامش السيولة (متحفظ)' }, ticks: { callback: v => fmt(v) } }, y: { title: { display: true, text: 'NPV' }, ticks: { callback: v => fmt(v) } } }, plugins: { tooltip: { callbacks: { label: c => 'سيولة ' + fmt(c.parsed.x) + ' • NPV ' + fmt(c.parsed.y) } } } } });
  html += card('سقف الاستثمار الآمن حسب موعد البدء ' + info('أقصى مبلغ تدفعه دفعة واحدة في هذا الموعد مع بقاء الرصيد فوق الاحتياطي في كل الأيام التالية حتى 24 شهر'), '<div class="tw"><table class="t"><thead><tr><th>موعد البدء</th><th>السقف في السيناريو المتحفظ</th><th>السقف في الأساسي</th></tr></thead><tbody>' + D.caps.map(c => '<tr><td>' + (c.month ? 'بعد ' + c.month + ' شهر' : 'الآن') + ' <span class="small muted">' + fdate(c.date) + '</span></td><td><b>' + money(c.lumpCapCons) + '</b></td><td>' + money(c.lumpCapBase) + '</td></tr>').join('') + '</tbody></table></div>');
  for (const pc of D.projectCaps) {
    const st = pc.stats;
    html += card('فرصة: ' + esc(pc.project.name), '<div class="kv-list"><div><span>الدفعة الأولى</span><b>' + fmt(st.initial) + '</b></div><div><span>التمويل حتى أول تحصيل</span><b>' + fmt(st.fundingToFirstRevenue) + '</b></div><div><span>أقصى مبلغ مربوط (حتى التعادل النقدي)</span><b>' + fmt(st.maxTied) + ' في الشهر ' + st.maxTiedMonth + '</b></div><div><span>أول تحصيل</span><b>' + (st.firstRevenueMonth >= 0 ? 'الشهر ' + st.firstRevenueMonth : 'لا يوجد إيراد مسجل') + '</b></div><div><span>التعادل النقدي الشهري</span><b>' + (st.cashBreakevenMonth >= 0 ? 'الشهر ' + st.cashBreakevenMonth : '—') + '</b></div><div><span>الاسترداد</span><b>' + (st.paybackMonth >= 0 ? st.paybackMonth + ' شهر' : 'أكثر من 10 سنوات / غير محسوب') + '</b></div><div><span>حد التعادل (مبيعات شهرية)</span><b>' + fmt(st.breakevenMonthlySales) + '</b></div><div><span>وقت الإدارة</span><b>' + fmt(pc.project.mgmtHoursWeek || 0) + ' ساعة/أسبوع</b></div></div>'
      + '<div class="tw"><table class="t"><thead><tr><th>البديل</th><th>NPV</th><th>أسوأ عجز (متحفظ)</th><th>أقل رصيد</th><th>المطلوب الآن</th><th>الاسترداد</th><th>الساعات</th><th>ممكن؟</th></tr></thead><tbody>' + pc.modes.map(r => '<tr><td>' + r.label + '</td><td>' + money(r.npv) + '</td><td>' + (r.deficit ? '<span class="neg">' + fmt(r.deficit) + '</span>' : 'لا عجز') + '</td><td>' + money(r.minCons) + '</td><td>' + money(r.upfront) + '</td><td>' + (r.paybackMonths >= 0 ? r.paybackMonths + ' شهر' : '—') + '</td><td>' + fmt(r.hours, 1) + '</td><td>' + (r.feasible ? '<span class="badge b-act">نعم</span>' : '<span class="badge b-bad">لا</span>') + '</td></tr>').join('') + '</tbody></table></div>'
      + '<p class="small">أقصى حجم آمن في المتحفظ: ' + pc.caps.map(c => (c.start ? 'بعد ' + c.start + ' شهر' : 'الآن') + ' ← <b>' + fmt(c.cap) + (c.scale >= 2.99 ? '+' : '') + '</b> (' + Math.round(c.scale * 100) + '% من الحجم المخطط)').join(' • ') + '</p>');
  }
  html += '<p class="small muted">مقارنة كل فرصة تتضمن ضمنيًا بديل الإبقاء على النقد (الوضع الحالي، بعائد يساوي معدل الخصم)، وبديل سداد الالتزام المكلف، وإعادة الاستثمار في فرع قائم إذا سجلته كمشروع توسعة. النتائج مقترحات، وأي حركة فعلية بيدك.</p>';
  return html;
};
/* التحليل المالي الشامل */
VIEWS.analysis = function () {
  const P = C.positions(S, U); const T = C.today();
  const D = UI.decide; const miss = C.missingData(S);
  const fcB = C.forecast(S, {}); const fcC = C.forecast(S, { assume: S.settings.scen.conservative }); const gid = fcB.groups.total ? 'total' : 'company';
  const sb = C.seriesStats(fcB, gid), sc = C.seriesStats(fcC, gid);
  const summary = [];
  const cons = P.consolidated || P.business;
  summary.push('السيولة الفورية ' + fmt(cons.tiers.now) + ' ج.م، وترتفع إلى ' + fmt(cons.tiers.cum30) + ' ج.م لو تم تسييل ما يمكن بيعه خلال 30 يومًا.');
  summary.push('صافي الثروة بعد الخصوم ' + fmt(cons.netWorth) + ' ج.م' + (P.consolidated ? ' (بعد حذف ' + fmt(P.consolidated.eliminated) + ' معاملات داخلية).' : '.'));
  summary.push('الالتزامات خلال 30 / 90 يوم: ' + fmt(cons.obl30) + ' / ' + fmt(cons.obl90) + ' ج.م.');
  summary.push('أقل رصيد متوقع في السيناريو الأساسي ' + fmt(sb.min) + ' يوم ' + fdate(sb.minDate) + '، وفي المتحفظ ' + fmt(sc.min) + ' يوم ' + fdate(sc.minDate) + (sc.firstBelowDate ? ' — ينزل تحت الاحتياطي من ' + fdate(sc.firstBelowDate) + ' بفجوة ' + fmt(sc.gap) + '.' : ' — بدون نزول تحت الاحتياطي.'));
  if (D) { const b = D.best.balanced; summary.push('أقصى مبلغ آمن لاستثمار جديد الآن في المتحفظ: ' + fmt(D.caps[0].lumpCapCons) + ' ج.م، وبعد 3 شهور: ' + fmt(D.caps[3].lumpCapCons) + ' ج.م.'); if (b) summary.push('الخيار المتوازن: ' + (b.actions.map(a => a.label).join('، ') || 'الإبقاء على الوضع الحالي') + '.'); }
  else summary.push('<button class="link" data-act="runDecide" data-back="analysis">احسب محرك القرار</button> لإظهار سقف الاستثمار والخطط الثلاث.');
  let html = '<div class="page-h"><h2>التحليل المالي الشامل</h2><div class="row"><button class="btn" data-act="exportAnalysis">Excel بكل التبويبات</button><button class="btn" data-act="pdf" data-el="#anBody" data-name="التحليل المالي">PDF</button></div></div><div id="anBody">';
  html += card('الملخص في دقيقة', '<ul class="summary">' + summary.map(s => '<li>' + s + '</li>').join('') + '</ul><p class="small muted">كل الأرقام محسوبة من السجلات الفعلية والأرصدة المعتمدة، والتوقعات من نمط الحركات أو الافتراضات الموضحة في الإعدادات. تاريخ الحساب ' + fdate(T) + '.</p>');
  const posRow = (l, k, o) => '<tr><td>' + l + '</td>' + ['personal', 'business', 'consolidated'].filter(x => P[x]).map(x => '<td>' + money(o ? o(P[x]) : P[x][k]) + '</td>').join('') + '</tr>';
  html += card('1) المركز المالي الحالي', '<div class="tw"><table class="t"><thead><tr><th></th>' + (P.personal ? '<th>شخصي</th>' : '') + '<th>النشاط (الشركة)</th>' + (P.consolidated ? '<th>مجمّع</th>' : '') + '</tr></thead><tbody>'
    + posRow('السيولة الفورية', null, p => p.tiers.now) + posRow('قابلة للتحرير خلال 7 أيام (تراكمي)', null, p => p.tiers.cum7) + posRow('خلال 30 يوم', null, p => p.tiers.cum30) + posRow('خلال 90 يوم', null, p => p.tiers.cum90) + posRow('أصول تحتاج أكثر من 90 يوم', null, p => p.tiers.later) + posRow('أصول مرهونة/محجوزة', null, p => p.tiers.pledged) + posRow('مستحقات لنا (آجل/تأمين)', 'receivables') + posRow('POS قيد التسوية', 'posPending') + posRow('مستحقات علينا', 'payables') + posRow('رصيد الالتزامات (أصل)', 'liabilities') + '<tr class="tot"><td>صافي الثروة</td>' + ['personal', 'business', 'consolidated'].filter(x => P[x]).map(x => '<td>' + money(P[x].netWorth) + '</td>').join('') + '</tr>' + posRow('التزامات خلال 30 يوم', 'obl30') + posRow('خلال 90 يوم', 'obl90') + posRow('خلال 365 يوم', 'obl365') + '</tbody></table></div><p class="small muted">قيم الأصول بصافي قيمة البيع المتاحة لك بعد تكاليف البيع أو الكسر. الأصول الأجنبية محولة بسعر الصرف المسجل مع تاريخه ومصدره في الخزنة.</p>');
  const brs = S.entities.filter(e => e.type !== 'owner' && visIds().includes(e.id));
  const from30 = C.addDays(T, -29);
  html += card('2) الفروع والإدارة', '<div class="tw"><table class="t"><thead><tr><th>الجهة</th><th>الربح التشغيلي (30 يوم)</th><th>النقد الذي ولّده</th><th>متأخرات التحصيل</th><th>مستحق لنا</th><th>التزامات 90 يوم</th></tr></thead><tbody>' + brs.map(e => { const p = C.pnl(S, [e.id], from30, T); const late = S.claims.filter(c => !c.voided && c.entityId === e.id && c.expectedDate < T).reduce((s, c) => s + Math.max(0, C.claimStatus(S, c).outstanding), 0); const rec = S.claims.filter(c => !c.voided && c.entityId === e.id).reduce((s, c) => s + Math.max(0, C.claimStatus(S, c).outstanding), 0); return '<tr><td>' + esc(e.name) + '</td><td>' + money(p.operatingProfit) + '</td><td>' + money(p.operatingCash) + '</td><td>' + money(late) + '</td><td>' + money(rec) + '</td><td>' + money(C.obligationsWithin(S, [e.id], 90).total) + '</td></tr>'; }).join('') + '</tbody></table></div><p class="small muted">ربحية الفرع هنا قبل تحميل نصيبه من مصروفات الإدارة المركزية. المصروفات التي دفعتها الإدارة نيابة عن الفرع (مثل الإيجار والرواتب) محملة على الفرع، ومخصومة من حساب الإدارة نقدًا مرة واحدة.</p>');
  if (D) {
    const r = k => D.best[k];
    html += card('3) مقارنة الخطط الثلاث', '<div class="tw"><table class="t"><thead><tr><th></th><th>تعظيم الربحية</th><th>تعظيم السيولة</th><th>الاستثمار الجديد (متوازن)</th></tr></thead><tbody>'
      + [['صافي القيمة الحالية NPV', x => money(x.npv)], ['أقل رصيد (متحفظ) وتاريخه', x => money(x.minCons) + ' <span class="small muted">' + fdate(x.minConsDate) + '</span>'], ['العجز في المتحفظ', x => x.deficit ? money(x.deficit) : 'لا يوجد'], ['المبلغ المستثمر الآن', x => money(x.upfront)], ['الإجراءات', x => '<span class="small">' + (x.actions.map(a => esc(a.label)).join('، ') || 'الوضع الحالي') + '</span>']].map(([l, f]) => '<tr><td>' + l + '</td>' + ['profit', 'liquidity', 'balanced'].map(k => '<td>' + (r(k) ? f(r(k)) : '—') + '</td>').join('') + '</tr>').join('')
      + '<tr><td>سقف الاستثمار الجديد وتوقيته</td><td colspan="3">الآن ' + fmt(D.caps[0].lumpCapCons) + ' • بعد 3 شهور ' + fmt(D.caps[3].lumpCapCons) + ' • بعد 6 شهور ' + fmt(D.caps[4].lumpCapCons) + ' ج.م (متحفظ)</td></tr></tbody></table></div>'
      + '<h4>4) متى يتغير الاختيار؟</h4><ul class="small"><li>لو ارتفعت تكلفة البديل الآمن (معدل الخصم): ' + D.discFlip.map(x => Math.round(x.rate * 100) + '% ← ' + (x.same ? 'نفس الخطة' : esc(x.alt))).join(' • ') + '</li><li>لو نزل التحصيل أكثر من افتراض السيناريو المتحفظ (' + Math.round((1 - S.settings.scen.conservative.collectionMult) * 100) + '%)، أو تأخر التأمين أكثر من ' + S.settings.scen.conservative.claimDelayDays + ' يوم، يقل سقف الاستثمار — أعد الحساب بعد تعديل الافتراض.</li>' + D.binding.map(b => '<li>' + esc(b) + '</li>').join('') + '</ul>');
    const plan = C.actionPlan(S, D);
    html += card('5) خطة التنفيذ — 30 و90 يوم', '<div class="tw"><table class="t"><thead><tr><th>التوقيت</th><th>الإجراء</th><th>المبلغ</th><th>المؤشر</th></tr></thead><tbody>' + plan.map(p => '<tr><td>' + (/^\d{4}-/.test(p.when) ? fdate(p.when) : esc(p.when)) + '</td><td>' + esc(p.action) + '</td><td>' + (p.amount != null ? money(p.amount) : '—') + '</td><td class="small">' + esc(p.kpi) + '</td></tr>').join('') + '</tbody></table></div>');
  }
  html += card('6) البيانات الناقصة التي قد تغيّر القرار', miss.length ? '<ol class="miss">' + miss.slice(0, 15).map(m => '<li><a href="#' + m.link + '">' + esc(m.msg) + '</a></li>').join('') + '</ol>' : empty('لا توجد بيانات ناقصة مؤثرة'));
  return html + '</div>';
};
/* الخزنة الشخصية */
VIEWS.vault = function () {
  if (!S._vaultOpen) return card('الخزنة مغلقة', '<p>سجّل الدخول بكلمة مرور المالك لفتحها.</p>');
  const tab = UI.vaultTab; const lt = C.liquidityTiers(S, ['owner']); const P = C.position(S, ['owner']);
  let html = '<div class="page-h"><h2>الخزنة الشخصية <span class="badge b-act">مشفّرة</span></h2><button class="btn primary" data-act="form" data-f="asset">أصل جديد</button></div>';
  html += '<div class="kpis">' + kpi('السيولة الفورية', money(lt.tiers.now)) + kpi('قابلة للتحرير خلال 30 يوم', money(lt.tiers.cum30), '7 أيام: ' + fmt(lt.tiers.cum7) + ' • 90 يوم: ' + fmt(lt.tiers.cum90)) + kpi('صافي الثروة الشخصية', money(P.netWorth)) + kpi('مرهون/محجوز', money(lt.tiers.pledged)) + '</div>';
  html += '<div class="seg">' + [['assets', 'الأصول والمدخرات'], ['accounts', 'الحسابات الشخصية'], ['liab', 'الالتزامات الشخصية']].map(([k, t]) => '<button class="' + (tab === k ? 'on' : '') + '" data-act="vaultTab" data-k="' + k + '">' + t + '</button>').join('') + '</div>';
  if (tab === 'assets') {
    const tierL = { now: 'فوري', d7: '≤ 7 أيام', d30: '≤ 30 يوم', d90: '≤ 90 يوم', later: '> 90 يوم', pledged: 'مرهون', internal: 'داخلي' };
    html += card('الأصول', lt.assetRows.length ? '<div class="tw"><table class="t"><thead><tr><th>الأصل</th><th>النوع</th><th>الكمية/العملة</th><th>القيمة</th><th>صافي البيع</th><th>مدة التسييل</th><th>التقييم</th><th></th></tr></thead><tbody>' + lt.assetRows.map(({ a, v, tier }) => '<tr><td><b>' + esc(a.name) + '</b><div class="small muted">المالك: ' + esc(a.owner || 'المالك') + (a.pledged ? ' • مرهون: ' + esc(a.pledgedNote || '') : '') + '</div></td><td>' + C.ASSET_TYPES[a.type] + '</td><td>' + (a.quantity ? fmt(a.quantity, 2) + ' ' + esc(a.unit || '') + (a.karat ? ' عيار ' + a.karat : '') : '') + (a.currency && a.currency !== 'EGP' ? '<div>' + fmt(a.valueOrig, 2) + ' ' + a.currency + '</div><div class="small muted">سعر ' + fmt(a.fxRate, 2) + ' — ' + fdate(a.fxDate) + ' — ' + esc(a.fxSource || 'المصدر غير محدد') + '</div>' : '') + '</td><td>' + money(v.value) + '</td><td><b>' + money(v.net) + '</b></td><td>' + (a.liquidationDays || 0) + ' يوم <span class="badge">' + tierL[tier] + '</span></td><td>' + badge(a.basis || 'estimate') + '<div class="small muted">' + fdate(a.valDate) + ' — ' + esc(a.valSource || '') + '</div></td><td><button class="btn xs" data-act="form" data-f="asset" data-id="' + a.id + '">تعديل</button></td></tr>').join('') + '</tbody></table></div>' : empty('لا توجد أصول مسجلة'));
  } else if (tab === 'accounts') {
    const accs = S.accounts.filter(a => a.entityId === 'owner');
    html += card('الحسابات الشخصية', accs.length ? '<table class="t"><tbody>' + accs.map(a => '<tr><td>' + esc(a.name) + '</td><td>' + C.ACCOUNT_TYPES[a.type] + '</td><td>' + money(C.accountLedger(S, a.id).approved) + '</td></tr>').join('') + '</tbody></table>' : empty('أضف حساباتك الشخصية من الإعدادات ← الحسابات واختر الجهة «المالك»'), '<button class="btn xs" data-act="form" data-f="account" data-ent="owner">حساب جديد</button>');
    html += card('آخر الحركات الشخصية', txnList(S.txns.filter(t => t.entityId === 'owner').slice(-40).reverse(), true));
  } else {
    UI.ef = 'owner'; const h = VIEWS.liabilities(); UI.ef = 'all'; html += h.replace('<div class="page-h"><h2>الالتزامات والأقساط</h2>', '<div class="page-h"><h3>الالتزامات الشخصية</h3>');
  }
  return html;
};
VIEWS.projects = function () {
  if (!S._vaultOpen) return card('الخزنة مغلقة', '');
  let html = '<div class="page-h"><h2>المزرعة والمشاريع والفرص</h2><button class="btn primary" data-act="form" data-f="project">مشروع / فرصة جديدة</button></div>';
  html += '<p class="small muted">المشروع «القائم» يدخل في توقع السيولة تلقائيًا. «قيد الدراسة» يُختبر فقط في محاكي «ماذا لو؟» ومحرك القرار. عائد النشاط محسوب منفصلًا عن تغير قيمة الأرض.</p>';
  html += S.projects.filter(p => !p.voided).map(p => {
    const st = C.projectStats(p, {}); const m = C.projectMonthly(p, { months: 24 });
    const y1 = m.slice(0, 12).reduce((s, x) => s + x.in - x.out - x.lump, 0);
    const landGain = (+p.landValue || 0) * ((+p.landAppreciationAnnual || 0) / 100);
    const statusL = { active: '<span class="badge b-act">قائم</span>', study: '<span class="badge b-est">قيد الدراسة</span>', contracted: '<span class="badge b-asm">متعاقد عليه</span>', rejected: '<span class="badge b-bad">مرفوض</span>' }[p.status];
    const id = 'ch_p_' + p.id;
    chart(id, { type: 'bar', data: { labels: m.map(x => 'ش' + (x.m + 1)), datasets: [{ label: 'تحصيل', data: m.map(x => Math.round(x.in)), backgroundColor: COL.in }, { label: 'صرف', data: m.map(x => -Math.round(x.out + x.lump)), backgroundColor: COL.out }] }, options: { scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: v => fmt(v) } } } } });
    return card(esc(p.name) + ' ' + statusL, '<div class="kv-list"><div><span>الجهة</span><b>' + esc(en(p.entityId)) + '</b></div><div><span>تكلفة البداية</span><b>' + fmt((p.setup || []).reduce((s, x) => s + (+x.amount || 0), 0) + (+p.workingCapital || 0)) + '</b></div><div><span>مصروف شهري</span><b>' + fmt(p.monthlyOpex) + '</b></div><div><span>إيراد شهري مستقر</span><b>' + fmt(p.steadyRevenue) + ' بعد ' + (p.rampMonths || 1) + ' شهر</b></div><div><span>أول تحصيل</span><b>' + (st.firstRevenueMonth >= 0 ? 'الشهر ' + st.firstRevenueMonth : '—') + '</b></div><div><span>أكبر مبلغ مربوط قبل التمويل الذاتي</span><b>' + fmt(st.maxTied) + '</b></div><div><span>صافي نقد النشاط أول 12 شهر</span><b class="' + (y1 < 0 ? 'neg' : '') + '">' + fmt(y1) + '</b></div><div><span>ارتفاع قيمة الأرض سنويًا (منفصل)</span><b>' + fmt(landGain) + '</b></div><div><span>وقت الإدارة</span><b>' + fmt(p.mgmtHoursWeek || 0) + ' س/أسبوع' + (p.ownerDependent ? ' • يعتمد على وجودك' : '') + '</b></div><div><span>تكلفة الخروج</span><b>' + fmt(p.exitCost || 0) + '</b></div></div><div class="chart"><canvas id="' + id + '"></canvas></div>' + (p.note ? '<p class="small muted">' + esc(p.note) + '</p>' : ''), '<button class="btn xs" data-act="form" data-f="project" data-id="' + p.id + '">تعديل</button>');
  }).join('') || empty('لا توجد مشاريع');
  return html;
};
/* الاستيراد */
const IMPORT_TYPES = {
  txns: { t: 'حركات (إيراد/مصروف)', fields: [['date', 'التاريخ *'], ['kind', 'النوع (إيراد/مصروف/استرداد)'], ['entity', 'الفرع/الجهة *'], ['amount', 'المبلغ *'], ['method', 'طريقة الدفع'], ['account', 'الحساب'], ['category', 'التصنيف'], ['ref', 'رقم المرجع'], ['note', 'ملاحظات']] },
  accounts: { t: 'حسابات وأرصدة افتتاحية', fields: [['name', 'اسم الحساب *'], ['entity', 'الجهة *'], ['type', 'النوع (خزنة/محفظة/بنك/POS)'], ['opening', 'الرصيد الافتتاحي'], ['openingDate', 'تاريخ الرصيد']] },
  branches: { t: 'فروع', fields: [['name', 'اسم الفرع *']] },
  liabilities: { t: 'التزامات', fields: [['name', 'الاسم *'], ['entity', 'الجهة *'], ['lender', 'الجهة الدائنة'], ['installment', 'قيمة القسط *'], ['frequency', 'كل كم شهر'], ['firstDue', 'تاريخ القسط القادم *'], ['count', 'عدد الأقساط المتبقية *'], ['principal', 'المتبقي من الأصل'], ['interest', 'الفائدة السنوية %'], ['class', 'التصنيف (إلزامي/قابل للتأجيل/اختياري)'], ['currency', 'العملة']] }
};
VIEWS.import = function () {
  const st = UI.importState;
  let html = '<div class="page-h"><h2>استيراد من Excel</h2></div>';
  html += card('1) اختر النوع والملف', '<div class="filters"><select id="impType">' + Object.keys(IMPORT_TYPES).map(k => opt(k, IMPORT_TYPES[k].t, st && st.type === k)).join('') + '</select><input type="file" id="impFile" accept=".xlsx,.xls,.csv"><button class="btn" data-act="impTemplate">تحميل قالب</button></div><p class="small muted">الصف الأول عناوين الأعمدة. ستظهر معاينة وربط للأعمدة، ويتم تحديد الصفوف الناقصة والمكررة قبل الاعتماد.</p>');
  UI.post.push(() => { const f = $('#impFile'); if (f) f.onchange = e => readImport(e.target.files[0], $('#impType').value); });
  if (st) {
    const T = IMPORT_TYPES[st.type];
    html += card('2) ربط الأعمدة — ' + esc(st.fileName) + ' (' + st.rows.length + ' صف)', '<div class="map-grid">' + T.fields.map(([k, l]) => '<label>' + l + '<select data-map="' + k + '">' + opt('', '— لا يوجد —') + st.headers.map((h, i) => opt(i, h, st.map[k] === i)).join('') + '</select></label>').join('') + '</div><button class="btn" data-act="impValidate">فحص الصفوف</button>');
    if (st.checked) {
      const ok = st.checked.filter(r => !r.err.length && !r.dup).length;
      html += card('3) المعاينة والفحص', '<p>' + ok + ' صف سليم • ' + st.checked.filter(r => r.err.length).length + ' به نقص أو خطأ • ' + st.checked.filter(r => r.dup).length + ' مكرر (لن يُستورد)</p><div class="tw"><table class="t"><thead><tr><th>#</th>' + T.fields.map(f => '<th>' + f[1].replace(' *', '') + '</th>').join('') + '<th>الفحص</th></tr></thead><tbody>' + st.checked.slice(0, 200).map(r => '<tr class="' + (r.err.length ? 'row-bad' : r.dup ? 'row-warn' : '') + '"><td>' + (r.i + 2) + '</td>' + T.fields.map(f => '<td>' + esc(r.v[f[0]] == null ? '' : r.v[f[0]]) + '</td>').join('') + '<td class="small">' + (r.err.join('، ') || (r.dup ? 'مكرر' : 'سليم')) + '</td></tr>').join('') + '</tbody></table></div>' + (ok ? '<button class="btn primary" data-act="impCommit">اعتماد ' + ok + ' صف</button>' : ''));
    }
  }
  const imps = S.imports.slice().reverse();
  html += card('دفعات الاستيراد السابقة', imps.length ? '<table class="t"><thead><tr><th>التاريخ</th><th>الملف</th><th>النوع</th><th>الصفوف</th><th>بواسطة</th><th></th></tr></thead><tbody>' + imps.map(i => '<tr><td>' + i.at + '</td><td>' + esc(i.source) + '</td><td>' + IMPORT_TYPES[i.type].t + '</td><td>' + i.count + '</td><td>' + esc(i.by) + '</td><td>' + (i.reverted ? '<span class="badge b-bad">ملغاة ' + esc(i.revertedAt) + '</span>' : (can('review') && (i.type === 'txns' || i.type === 'liabilities') ? '<button class="btn xs danger" data-act="impUndo" data-id="' + i.id + '">إلغاء الدفعة</button>' : '')) + '</td></tr>').join('') + '</tbody></table>' : empty('لا توجد دفعات'));
  return html;
};
/* الإعدادات */
VIEWS.settings = function () {
  const tab = UI.settingsTab; const s = S.settings;
  const tabs = [['general', 'عام والاحتياطي'], ['entities', 'الفروع والجهات'], ['accounts', 'الحسابات'], ['methods', 'طرق الدفع'], ['categories', 'التصنيفات'], ['scen', 'افتراضات السيناريوهات'], ['users', 'المستخدمون والصلاحيات'], ['workspace', 'المساحة والتخزين']];
  let html = '<div class="page-h"><h2>الإعدادات</h2></div><div class="seg wrap">' + tabs.map(([k, t]) => '<button class="' + (tab === k ? 'on' : '') + '" data-act="setTab" data-k="' + k + '">' + t + '</button>').join('') + '</div>';
  const num = (path, label, val, step, hint) => '<label>' + label + (hint ? ' ' + info(hint) : '') + '<input type="number" step="' + (step || 1) + '" value="' + (val == null ? '' : val) + '" data-set="' + path + '"></label>';
  if (tab === 'general') {
    html += card('احتياطي السيولة والحدود', '<div class="form grid3">' + num('reserve.ops', 'الحد الأدنى لسيولة تشغيل الشركة (ج.م)', s.reserve.ops, 1000, 'أقل رصيد إجمالي للفروع والإدارة تقبل النزول إليه') + num('reserve.branchDefault', 'الحد الأدنى لكل فرع (ج.م)', s.reserve.branchDefault, 1000) + num('reserve.owner', 'الحد الأدنى للسيولة الشخصية (ج.م)', s.reserve.owner, 1000) + num('financingLimit', 'أقصى تمويل/استدانة تقبله (ج.م)', s.financingLimit, 1000) + num('ownerHoursPerWeek', 'أقصى وقت إداري للمشاريع الجديدة (ساعة/أسبوع)', s.ownerHoursPerWeek, 1) + num('transfers.monthlyDrawing', 'سحب المالك الشهري من الإدارة (ج.م)', s.transfers.monthlyDrawing, 1000, 'يظهر كتحويل داخلي في التوقع') + num('historyDays', 'عدد الأيام لحساب نمط التحصيل', s.historyDays, 1) + '</div>'
      + '<div class="form grid3"><label>معدل الخصم السنوي %<input type="number" step="0.5" value="' + (s.discountRate * 100) + '" data-set="discountRatePct"></label><label>أساس معدل الخصم<select data-set="discountBasis">' + Object.keys(C.BASIS).map(k => opt(k, C.BASIS[k], s.discountBasis === k)).join('') + '</select></label><label class="chk"><input type="checkbox" data-set="transfers.ownerCoversCompany" ' + (s.transfers.ownerCoversCompany ? 'checked' : '') + '> مسموح بتحويل سيولة من المالك لتغطية عجز الشركة</label><label class="chk"><input type="checkbox" data-set="transfers.poolBranches" ' + (s.transfers.poolBranches ? 'checked' : '') + '> مسموح بنقل السيولة بين الفروع</label></div>');
  } else if (tab === 'entities') {
    html += card('الفروع والجهات', '<div class="tw"><table class="t"><thead><tr><th>الاسم</th><th>النوع</th><th>أساس التوقع</th><th>تحصيل شهري (افتراض)</th><th>صرف شهري (افتراض)</th><th>مطالبات شهرية جديدة</th><th>الإهلاك الشهري</th><th>الحالة</th><th></th></tr></thead><tbody>' + S.entities.filter(e => e.id !== 'owner' || S._vaultOpen).map(e => '<tr><td>' + esc(e.name) + '</td><td>' + ({ branch: 'فرع', admin: 'إدارة', owner: 'المالك' }[e.type]) + '</td><td>' + (e.assume.mode === 'manual' ? badge('assumption') : badge('pattern')) + '</td><td>' + fmt(e.assume.monthlyIn) + '</td><td>' + fmt(e.assume.monthlyOut) + '</td><td>' + fmt(e.assume.monthlyNewClaims) + '</td><td>' + fmt(e.depreciationMonthly) + '</td><td>' + (e.active === false ? '<span class="badge b-bad">موقوف</span>' : '<span class="badge b-act">نشط</span>') + '</td><td><button class="btn xs" data-act="form" data-f="entity" data-id="' + e.id + '">تعديل</button></td></tr>').join('') + '</tbody></table></div><p class="small muted">إيقاف الفرع يبقي بياناته التاريخية في التقارير ويخرجه من التوقع والتسجيل الجديد.</p>', '<button class="btn sm primary" data-act="form" data-f="entity">فرع جديد</button>');
  } else if (tab === 'accounts') {
    html += card('الحسابات (خزن، محافظ، بنوك، ماكينات)', '<div class="tw"><table class="t"><thead><tr><th>الحساب</th><th>النوع</th><th>مالك الحساب</th><th>الرصيد الافتتاحي</th><th>التاريخ</th><th>تفاصيل</th><th></th></tr></thead><tbody>' + S.accounts.filter(a => a.entityId !== 'owner' || S._vaultOpen).map(a => '<tr' + (a.active === false ? ' class="muted"' : '') + '><td>' + esc(a.name) + '</td><td>' + C.ACCOUNT_TYPES[a.type] + '</td><td>' + esc(en(a.entityId)) + '</td><td>' + money(a.opening) + '</td><td>' + fdate(a.openingDate) + '</td><td class="small">' + (a.type === 'pos' ? 'يُسوّى إلى ' + esc(an(a.linkedBankId)) + ' خلال ' + (a.settleDays || 1) + ' يوم، رسوم ' + (a.feePct || 0) + '%' : '') + '</td><td><button class="btn xs" data-act="form" data-f="account" data-id="' + a.id + '">تعديل</button></td></tr>').join('') + '</tbody></table></div>', '<button class="btn sm primary" data-act="form" data-f="account">حساب جديد</button>');
  } else if (tab === 'methods') {
    html += card('طرق الدفع', '<table class="t"><tbody>' + S.methods.map(m => '<tr><td>' + esc(m.name) + '</td><td>' + C.METHOD_KINDS[m.kind] + '</td></tr>').join('') + '</tbody></table><form class="row" data-inline="method"><input name="name" placeholder="طريقة جديدة" required><select name="kind">' + Object.keys(C.METHOD_KINDS).map(k => opt(k, C.METHOD_KINDS[k])).join('') + '</select><button class="btn sm">إضافة</button></form><p class="small muted">طريقة الدفع (مثل إنستاباي) مستقلة عن الحساب الذي يظهر فيه الرصيد (مثل الحساب البنكي).</p>');
  } else if (tab === 'categories') {
    html += '<div class="grid2">' + ['income', 'expense'].map(k => card(k === 'income' ? 'تصنيفات الإيرادات' : 'تصنيفات المصروفات', '<div class="chips">' + S.categories[k].map(c => '<span class="chip">' + esc(c.name) + '</span>').join('') + '</div><form class="row" data-inline="cat_' + k + '"><input name="name" placeholder="تصنيف جديد" required><button class="btn sm">إضافة</button></form>')).join('') + '</div>';
  } else if (tab === 'scen') {
    const keys = [['collectionMult', 'معامل التحصيل', 0.01], ['expenseMult', 'معامل المصروفات', 0.01], ['claimDelayDays', 'تأخير التأمين الإضافي (يوم)', 1], ['fxMult', 'معامل سعر الصرف للأصول الأجنبية', 0.01], ['assetMult', 'معامل أسعار بيع الأصول', 0.01], ['projectDelayMonths', 'تأخر إيراد المشاريع (شهر)', 1], ['projectRevenueMult', 'معامل إيراد المشاريع', 0.01]];
    html += card('افتراضات السيناريوهات (قابلة للتعديل)', '<div class="tw"><table class="t"><thead><tr><th>الافتراض</th><th>متحفظ</th><th>أساسي</th><th>متفائل</th></tr></thead><tbody>' + keys.map(([k, l, st]) => '<tr><td>' + l + '</td>' + ['conservative', 'base', 'optimistic'].map(sv => '<td><input class="inp-s" type="number" step="' + st + '" value="' + s.scen[sv][k] + '" data-set="scen.' + sv + '.' + k + '"></td>').join('') + '</tr>').join('') + '</tbody></table></div><p class="small muted">مثال: معامل التحصيل 0.85 = انخفاض التحصيل 15%. خطط محرك القرار تُختبر في المتحفظ وتُقيَّم ربحيتها في الأساسي.</p>');
  } else if (tab === 'users') {
    if (!can('users')) return html + empty('إدارة المستخدمين للمالك فقط');
    html += card('المستخدمون', '<div class="tw"><table class="t"><thead><tr><th>الاسم</th><th>الدور</th><th>الجهات المصرح بها</th><th>اعتماد الإقفال</th><th>الحالة</th><th></th></tr></thead><tbody>' + S.users.map(u => '<tr><td>' + esc(u.name) + '</td><td>' + C.ROLES[u.role] + '</td><td class="small">' + (u.role === 'owner' ? 'الكل + الخزنة الشخصية' : (u.entityIds || []).map(en).map(esc).join('، ')) + '</td><td>' + (u.role === 'owner' || u.approveClose ? '✓' : '—') + '</td><td>' + (u.active === false ? 'موقوف' : 'نشط') + '</td><td><button class="btn xs" data-act="form" data-f="user" data-id="' + u.id + '">تعديل</button></td></tr>').join('') + '</tbody></table></div><div class="small muted"><b>الصلاحيات:</b> المالك: رؤية كاملة والخزنة الشخصية واعتماد التصحيحات. مدير الفرع: بيانات فرعه واعتماد الإقفال إذا منحته الإذن. المحاسب: إدخال ومراجعة وتصدير بيانات الجهات المحددة. الكاشير: تسجيل حركات فرعه وعرض اليوم فقط. الخزنة الشخصية مشفرة بكلمة مرور المالك ولا تُفك على أي حساب آخر.</div>', '<button class="btn sm primary" data-act="form" data-f="user">مستخدم جديد</button>');
  } else if (tab === 'workspace') {
    html += card('المساحة الحالية: ' + (WS === 'demo' ? 'البيانات التجريبية' : 'البيانات الفعلية'), '<p>مكان الحفظ: <b>' + { local: 'على هذا الجهاز (IndexedDB) — يعمل بدون إنترنت', cloud: 'في حسابك على Claude — خاص بك ويتزامن بين أجهزتك', memory: 'ذاكرة مؤقتة — صدّر نسخة احتياطية' }[ST.mode] + '</b></p><p class="small muted">' + (ST.mode === 'cloud' ? 'في هذا الوضع يستخدم التطبيق حساب المالك فقط. لتشغيل حسابات الموظفين على أجهزتهم استخدم نسخة الاستضافة الذاتية (PWA). ' : '') + 'المساحتان التجريبية والفعلية منفصلتان تمامًا.</p><div class="row"><button class="btn" data-act="switchWs">' + (WS === 'demo' ? 'الانتقال للبيانات الفعلية' : 'فتح البيانات التجريبية') + '</button>' + (WS === 'demo' ? '<button class="btn danger" data-act="resetDemo">إعادة توليد البيانات التجريبية</button>' : '') + '</div>');
    if (U.role === 'owner') html += card('كلمة مرور المالك', '<form class="form grid3" data-inline="ownerpass"><label>الحالية<input type="password" name="old" required></label><label>الجديدة (6+)<input type="password" name="n1" minlength="6" required></label><label>تأكيد<input type="password" name="n2" minlength="6" required></label><button class="btn">تغيير وإعادة تشفير الخزنة</button></form>');
  }
  return html;
};
VIEWS.audit = function () {
  const list = S.audit.slice(-400).reverse();
  return '<div class="page-h"><h2>سجل التدقيق</h2></div>' + card(fmt(S.audit.length) + ' قيد', '<div class="tw"><table class="t"><thead><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>السجل</th><th>القيمة السابقة</th><th>القيمة الجديدة</th></tr></thead><tbody>' + list.map(a => '<tr><td class="nowrap">' + esc(a.at) + '</td><td>' + esc(a.userName) + '</td><td>' + esc({ create: 'إنشاء', reverse: 'قيد تصحيح', void: 'إلغاء', close: 'إقفال', reopen: 'إعادة فتح', update: 'تعديل', login: 'دخول', verify: 'مطابقة', import: 'استيراد', restore: 'استعادة', delete: 'حذف' }[a.action] || a.action) + (a.note ? '<div class="small muted">' + esc(a.note) + '</div>' : '') + '</td><td class="small">' + esc(a.type) + ' ' + esc(a.recordId || '') + '</td><td class="small mono">' + esc(a.before ? JSON.stringify(a.before).slice(0, 160) : '') + '</td><td class="small mono">' + esc(a.after ? JSON.stringify(a.after).slice(0, 160) : '') + '</td></tr>').join('') + '</tbody></table></div>');
};
VIEWS.backup = function () {
  return '<div class="page-h"><h2>النسخ الاحتياطي والاستعادة</h2></div>'
    + card('نسخة احتياطية مشفّرة', '<form class="form grid3" data-inline="backup"><label>كلمة مرور النسخة (8+)<input type="password" name="p1" minlength="8" required></label><label>تأكيد<input type="password" name="p2" minlength="8" required></label><button class="btn primary">تصدير النسخة</button></form><p class="small muted">النسخة تحتوي كل بيانات المساحة الحالية، والخزنة الشخصية تبقى مشفّرة بكلمة مرور المالك داخلها. يُحسب بصمة SHA-256 للمحتوى للتحقق عند الاستعادة.</p>')
    + card('استعادة نسخة', '<form class="form grid3" data-inline="restore"><label>ملف النسخة<input type="file" name="f" accept=".scfbackup,.json" required></label><label>كلمة مرور النسخة<input type="password" name="p" required></label><button class="btn">فحص النسخة</button></form><div id="restorePreview"></div>');
};

/* ---------- النماذج ---------- */
function field(name, label, type, o) {
  o = o || {}; const v = o.value == null ? '' : o.value; const req = o.req ? ' required' : '';
  if (type === 'select') return '<label' + (o.cls ? ' class="' + o.cls + '"' : '') + '>' + label + '<select name="' + name + '"' + req + (o.attr || '') + '>' + o.options.map(x => opt(x[0], x[1], String(x[0]) === String(v))).join('') + '</select></label>';
  if (type === 'textarea') return '<label class="full">' + label + '<textarea name="' + name + '" rows="2">' + esc(v) + '</textarea></label>';
  if (type === 'checkbox') return '<label class="chk"><input type="checkbox" name="' + name + '"' + (v ? ' checked' : '') + '> ' + label + '</label>';
  return '<label' + (o.cls ? ' class="' + o.cls + '"' : '') + '>' + label + '<input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(v) + '"' + req + (o.step ? ' step="' + o.step + '"' : type === 'number' ? ' step="any"' : '') + (o.attr || '') + '></label>';
}
const entOpts = (filter) => S.entities.filter(e => visIds().includes(e.id) && e.active !== false && (!filter || filter(e))).map(e => [e.id, e.name]);
const accOpts = (filter) => S.accounts.filter(a => a.active !== false && visIds().includes(a.entityId) && (!filter || filter(a))).map(a => [a.id, a.name + ' — ' + en(a.entityId)]);
const defaultEntity = () => (UI.ef !== 'all' && visIds().includes(UI.ef)) ? UI.ef : (entOpts(e => e.type === 'branch')[0] || entOpts()[0] || [''])[0];
function defaultAccount(entityId, methodId) {
  const m = S.methods.find(x => x.id === methodId); const want = { cash: 'cash', wallet: 'wallet', instapay: 'bank', bank: 'bank', pos: 'pos', other: 'bank' }[m ? m.kind : 'cash'];
  const pool = S.accounts.filter(a => a.active !== false && (visIds().includes(a.entityId) || (a.entityId === 'admin' && a.type === 'bank')));
  return (pool.find(a => a.entityId === entityId && a.type === want) || pool.find(a => a.type === want && (a.entityId === 'admin' || a.entityId === entityId)) || pool.find(a => a.entityId === entityId) || pool[0] || {}).id;
}
function linesEditor(entityId, lines) {
  lines = lines && lines.length ? lines : [{ methodId: S.methods[0].id, accountId: defaultAccount(entityId, S.methods[0].id), amount: '' }];
  return '<div class="lines" id="lines">' + lines.map(lineRow).join('') + '</div><button type="button" class="link" data-act="addLine">+ تقسيم على طريقة دفع أخرى</button><div class="small muted" id="linesTotal"></div>';
}
const lineAccs = () => S.accounts.filter(a => a.active !== false && (visIds().includes(a.entityId) || (a.entityId === 'admin' && a.type === 'bank'))).map(a => [a.id, a.name + ' — ' + en(a.entityId)]);
function lineRow(l) { return '<div class="line"><select class="l-m" data-act-change="lineMethod">' + S.methods.filter(m => m.active !== false).map(m => opt(m.id, m.name, m.id === l.methodId)).join('') + '</select><select class="l-a">' + lineAccs().map(a => opt(a[0], a[1], a[0] === l.accountId)).join('') + '</select><input class="l-v" type="number" step="any" min="0" placeholder="المبلغ" value="' + esc(l.amount) + '" required><button type="button" class="icon-btn" data-act="rmLine" aria-label="حذف">✕</button></div>'; }
function readLines() { return Array.from(document.querySelectorAll('#lines .line')).map(r => ({ methodId: r.querySelector('.l-m').value, accountId: r.querySelector('.l-a').value, amount: +r.querySelector('.l-v').value || 0 })).filter(l => l.amount); }
function modal(title, body, submitName, data) {
  UI.modal = { submit: submitName, data: data || {} };
  $('#mt').textContent = title; $('#mb').innerHTML = '<form id="mf" class="form grid2" novalidate>' + body + '<div class="full row end"><button type="button" class="btn" data-act="closeModal">إلغاء</button>' + (submitName ? '<button class="btn primary">حفظ</button>' : '') + '</div></form>';
  $('#modal').hidden = false; document.body.classList.add('modal-open');
  const f = $('#mf'); f.onsubmit = async e => { e.preventDefault(); if (!f.checkValidity()) { f.reportValidity(); return; } const vals = Object.fromEntries(new FormData(f).entries()); f.querySelectorAll('input[type=checkbox]').forEach(c => { vals[c.name] = c.checked; }); try { const r = await SUBMIT[submitName](vals, UI.modal.data, f); if (r !== false) closeModal(); } catch (err) { console.error(err); toast(err.message, 'err'); } };
  const first = f.querySelector('input:not([type=hidden]),select'); if (first && window.innerWidth > 700) first.focus();
}
function closeModal() { $('#modal').hidden = true; document.body.classList.remove('modal-open'); UI.modal = null; }
const hid = (n, v) => '<input type="hidden" name="' + n + '" value="' + esc(v) + '">';
const FORMS = {
  income: d => txnForm('income', 'تسجيل إيراد', d), expense: d => txnForm('expense', 'تسجيل مصروف', d),
  refund: d => {
    const e = d.e || defaultEntity(); const recent = S.txns.filter(t => t.kind === 'income' && visIds().includes(t.entityId) && !t.voided).slice(-60).reverse();
    modal('رد مبلغ لمريض / عكس دفعة', hid('tid', C.uid('t')) + field('entityId', 'الفرع', 'select', { options: entOpts(), value: e }) + field('date', 'التاريخ', 'date', { value: C.today(), req: 1 }) + field('linkId', 'الحركة الأصلية', 'select', { options: [['', '— اختر —']].concat(recent.map(t => [t.id, fdate(t.date) + ' • ' + en(t.entityId) + ' • ' + fmt(C.lineTotal(t)) + (t.ref ? ' • ' + t.ref : '')])) }) + '<div class="full"><b class="small">خرج المبلغ من:</b>' + linesEditor(e) + '</div>' + field('note', 'السبب', 'textarea'), 'txn', { kind: 'refund' });
  },
  transfer: d => {
    const accs = accOpts(a => a.type !== 'pos');
    modal('تحويل بين حسابين', hid('tid', C.uid('t')) + field('entityId', 'الجهة المسؤولة (لتحميل الرسوم)', 'select', { options: entOpts(), value: d.e || defaultEntity() }) + field('date', 'التاريخ', 'date', { value: C.today(), req: 1 }) + field('fromAccountId', 'من حساب', 'select', { options: accs }) + field('toAccountId', 'إلى حساب', 'select', { options: accs, value: (accs[1] || [])[0] }) + field('amount', 'المبلغ', 'number', { req: 1 }) + field('fee', 'رسوم التحويل (تُسجل كمصروف مستقل)', 'number') + field('finSub', 'طبيعة التحويل', 'select', { options: [['', 'تحويل عادي (مثل الخزنة ← البنك)'], ['owner_funding', 'تمويل من المالك للفرع/الشركة'], ['owner_drawing', 'سحوبات المالك الشخصية'], ['loan_in', 'قرض بين جهات']] }) + field('ref', 'رقم المرجع', 'text') + field('note', 'ملاحظات', 'textarea'), 'transfer');
  },
  settlement: d => {
    const pos = accOpts(a => a.type === 'pos'); const a0 = S.accounts.find(a => a.id === (d.acc || (pos[0] || [])[0]));
    if (!a0) return toast('لا توجد ماكينات POS', 'err');
    const pend = C.accountLedger(S, a0.id).book;
    modal('تسوية ماكينة POS', hid('tid', C.uid('t')) + field('posAccountId', 'الماكينة', 'select', { options: pos, value: a0.id }) + field('bankAccountId', 'الحساب البنكي المستلم', 'select', { options: accOpts(a => a.type === 'bank'), value: a0.linkedBankId }) + field('date', 'تاريخ الوصول', 'date', { value: C.today(), req: 1 }) + field('gross', 'المبلغ الإجمالي المسوّى (المعلق ' + fmt(pend) + ')', 'number', { value: C.r2(pend), req: 1 }) + field('fee', 'رسوم الماكينة', 'number', { value: C.r2(pend * (+a0.feePct || 0) / 100) }) + field('ref', 'رقم التسوية', 'text') + '<p class="full small muted">التسوية تنقل القيمة من الماكينة إلى البنك دون إنشاء إيراد جديد. الصافي = الإجمالي − الرسوم.</p>', 'settlement', { entityId: a0.entityId });
  },
  claim: d => modal('مطالبة تأمين / إيراد آجل', field('entityId', 'الفرع', 'select', { options: entOpts(), value: d.e || defaultEntity() }) + field('payer', 'الجهة الدافعة (شركة التأمين/المريض)', 'text', { req: 1 }) + field('amount', 'القيمة', 'number', { req: 1 }) + field('date', 'تاريخ المطالبة', 'date', { value: C.today(), req: 1 }) + field('expectedDate', 'موعد التحصيل المتوقع', 'date', { value: C.addDays(C.today(), 45), req: 1 }) + field('collectAccountId', 'الحساب المتوقع للتحصيل', 'select', { options: accOpts(a => a.type !== 'pos') }) + field('categoryId', 'التصنيف', 'select', { options: S.categories.income.map(c => [c.id, c.name]) }) + field('note', 'ملاحظات', 'textarea'), 'claim'),
  claimpay: d => { const c = S.claims.find(x => x.id === d.id); const o = C.claimStatus(S, c).outstanding; modal('تحصيل: ' + c.payer, hid('tid', C.uid('t')) + '<p class="full">المتبقي: <b>' + fmt(o) + '</b> — يمكن التحصيل الجزئي.</p>' + field('date', 'التاريخ', 'date', { value: C.today(), req: 1 }) + '<div class="full">' + linesEditor(c.entityId, [{ methodId: (S.methods.find(m => m.kind === 'bank') || S.methods[0]).id, accountId: c.collectAccountId || defaultAccount(c.entityId, 'm_bank'), amount: o }]) + '</div>' + field('ref', 'رقم المرجع', 'text'), 'txn', { kind: 'claim_payment', linkId: c.id, entityId: c.entityId }); },
  payable: d => modal('مصروف مستحق (يُدفع لاحقًا)', field('entityId', 'يُحمّل على', 'select', { options: entOpts(), value: d.e || defaultEntity() }) + field('payee', 'المورد / الجهة', 'text', { req: 1 }) + field('amount', 'القيمة', 'number', { req: 1 }) + field('date', 'تاريخ الاستحقاق المحاسبي', 'date', { value: C.today() }) + field('dueDate', 'موعد الدفع', 'date', { value: C.addDays(C.today(), 30), req: 1 }) + field('categoryId', 'التصنيف', 'select', { options: S.categories.expense.map(c => [c.id, c.name]) }) + field('class', 'الأولوية', 'select', { options: [['mandatory', 'إلزامي'], ['deferrable', 'قابل للتأجيل'], ['optional', 'اختياري']] }) + field('payAccountId', 'الحساب المتوقع للدفع', 'select', { options: accOpts(a => a.type !== 'pos') }) + field('note', 'ملاحظات', 'textarea'), 'payable'),
  paypay: d => { const p = S.payables.find(x => x.id === d.id); const o = C.payableStatus(S, p).outstanding; modal('سداد: ' + p.payee, hid('tid', C.uid('t')) + '<p class="full">المتبقي: <b>' + fmt(o) + '</b></p>' + field('date', 'التاريخ', 'date', { value: C.today(), req: 1 }) + '<div class="full">' + linesEditor(p.entityId, [{ methodId: (S.methods.find(m => m.kind === 'bank') || S.methods[0]).id, accountId: p.payAccountId || defaultAccount(p.entityId, 'm_bank'), amount: o }]) + '</div>', 'txn', { kind: 'payable_payment', linkId: p.id, entityId: p.entityId, categoryId: p.categoryId }); },
  liabpay: d => { const L = S.liabilities.find(x => x.id === d.id); const sc = C.liabilitySchedule(S, L); const sp = C.splitInstallment(L, sc.outstandingOrig); modal('سداد قسط: ' + L.name, hid('tid', C.uid('t')) + field('date', 'التاريخ', 'date', { value: C.today(), req: 1 }) + '<div class="full">' + linesEditor(L.entityId, [{ methodId: (S.methods.find(m => m.kind === 'bank') || S.methods[0]).id, accountId: L.payAccountId || defaultAccount(L.entityId, 'm_bank'), amount: sc.schedule[0] ? sc.schedule[0].amount : L.installment }]) + '</div>' + field('principal', 'منه أصل القسط', 'number', { value: C.r2(sp.principal * sc.rate) }) + field('interest', 'منه فائدة', 'number', { value: C.r2(sp.interest * sc.rate) }), 'txn', { kind: 'liability_payment', linkId: L.id, entityId: L.entityId, categoryId: (S.categories.expense.find(c => c.name === 'أقساط') || {}).id }); },
  financing: d => modal('حركة تمويلية', hid('tid', C.uid('t')) + field('entityId', 'الجهة', 'select', { options: entOpts(), value: d.e || defaultEntity() }) + field('sub', 'النوع', 'select', { options: Object.keys(C.FIN_LABELS).map(k => [k, C.FIN_LABELS[k]]) }) + field('date', 'التاريخ', 'date', { value: C.today(), req: 1 }) + '<div class="full">' + linesEditor(d.e || defaultEntity()) + '</div>' + field('note', 'ملاحظات', 'textarea') + '<p class="full small muted">القروض وتمويل المالك والسحوبات تؤثر على الأرصدة والتدفق النقدي، ولا تدخل في مبيعات العيادة أو مصروفات تشغيلها.</p>', 'txn', { kind: 'financing' }),
  verify: d => { const a = S.accounts.find(x => x.id === d.acc); const L = C.accountLedger(S, a.id); modal('مطابقة رصيد: ' + a.name, field('amount', 'الرصيد الفعلي (كشف الحساب / العد / شاشة المحفظة)', 'number', { value: C.r2(L.book), req: 1 }) + field('date', 'تاريخ المطابقة', 'date', { value: C.today(), req: 1 }) + '<p class="full small">رصيد الدفاتر الآن: <b>' + fmt(L.book) + '</b></p>' + field('note', 'سبب الفرق إن وجد', 'textarea'), 'verify', { id: a.id }); },
  closeday: d => {
    if (!can('close')) return toast('اعتماد الإقفال يحتاج إذنًا من المالك', 'err');
    const e = d.e || defaultEntity(); const date = d.date || C.today();
    const sum = C.daySummary(S, e, date);
    modal('إقفال اليوم', '<div class="full row">' + field('entityId', 'الجهة', 'select', { options: entOpts(x => x.type !== 'owner'), value: e, attr: ' data-act-change="closeReload"' }) + field('date', 'اليوم', 'date', { value: date, req: 1, attr: ' data-act-change="closeReload"' }) + '</div>'
      + (C.isDayLocked(S, e, date) ? '<div class="full alert warn">هذا اليوم مقفل بالفعل</div>' : '')
      + '<div class="full"><p><b>' + sum.count + '</b> حركة</p>' + methodTableHtml(sum.table, { compact: true }) + '</div>'
      + '<div class="full"><h4>عد النقد ومطابقة الأرصدة</h4><table class="t"><thead><tr><th>الحساب</th><th>المتوقع</th><th>الفعلي</th><th>السبب</th></tr></thead><tbody>' + sum.expected.filter(x => x.account.type !== 'pos').map(x => '<tr><td>' + esc(x.account.name) + '</td><td>' + money(x.expected) + '</td><td><input type="number" step="any" name="cnt_' + x.account.id + '" value="' + C.r2(x.expected) + '" class="inp-s" data-act-change="closeDiff" data-exp="' + x.expected + '"><div class="small diff"></div></td><td><input name="why_' + x.account.id + '" class="inp-s" placeholder="زيادة/عجز بسبب…"></td></tr>').join('') + '</tbody></table></div>'
      + (sum.posPending.length ? '<div class="full"><h4>تسويات POS المعلقة</h4>' + sum.posPending.map(p => '<div class="alert warn">' + esc(p.account.name) + ': ' + fmt(p.pending) + ' بانتظار الوصول للبنك</div>').join('') + '</div>' : '')
      + field('note', 'ملاحظات الإقفال', 'textarea'), 'closeday');
  },
  asset: d => {
    const a = d.id ? S.assets.find(x => x.id === d.id) : { type: 'deposit', currency: 'EGP', basis: 'estimate', valDate: C.today(), liquidationDays: 0, owner: U.name };
    modal(d.id ? 'تعديل أصل' : 'أصل جديد', field('name', 'الاسم', 'text', { value: a.name, req: 1 }) + field('type', 'النوع', 'select', { options: Object.keys(C.ASSET_TYPES).map(k => [k, C.ASSET_TYPES[k]]), value: a.type }) + field('owner', 'المالك', 'text', { value: a.owner }) + field('currency', 'العملة', 'select', { options: [['EGP', 'جنيه مصري'], ['USD', 'دولار'], ['EUR', 'يورو'], ['SAR', 'ريال سعودي'], ['AED', 'درهم إماراتي'], ['GBP', 'جنيه إسترليني']], value: a.currency }) + field('quantity', 'الكمية/الوزن (اختياري)', 'number', { value: a.quantity }) + field('unit', 'الوحدة', 'text', { value: a.unit }) + field('karat', 'العيار (للذهب)', 'number', { value: a.karat }) + field('valueOrig', 'القيمة السوقية بالعملة الأصلية', 'number', { value: a.valueOrig, req: 1 }) + field('netSaleOrig', 'صافي قيمة البيع المتاح لك (اختياري)', 'number', { value: a.netSaleOrig }) + field('breakCostPct', 'تكلفة البيع/الكسر % (لو صافي البيع غير محدد)', 'number', { value: a.breakCostPct }) + field('fxRate', 'سعر الصرف للجنيه', 'number', { value: a.fxRate }) + field('fxDate', 'تاريخ سعر الصرف', 'date', { value: a.fxDate }) + field('fxSource', 'مصدر سعر الصرف', 'text', { value: a.fxSource }) + field('liquidationDays', 'المدة المتوقعة للتحويل لنقد (يوم)', 'number', { value: a.liquidationDays }) + field('valDate', 'تاريخ التقييم', 'date', { value: a.valDate }) + field('valSource', 'مصدر التقييم', 'text', { value: a.valSource }) + field('basis', 'طبيعة الرقم', 'select', { options: Object.keys(C.BASIS).map(k => [k, C.BASIS[k]]), value: a.basis }) + field('expectedReturnAnnual', 'العائد/النمو السنوي المتوقع %', 'number', { value: a.expectedReturnAnnual }) + field('pledged', 'مرهون أو محجوز', 'checkbox', { value: a.pledged }) + field('pledgedNote', 'تفاصيل الرهن', 'text', { value: a.pledgedNote }) + field('note', 'ملاحظات', 'textarea', { value: a.note }) + (d.id ? '<div class="full"><button type="button" class="btn danger sm" data-act="delAsset" data-id="' + a.id + '">حذف الأصل</button></div>' : ''), 'asset', { id: d.id });
  },
  liability: d => {
    const L = d.id ? S.liabilities.find(x => x.id === d.id) : { currency: 'EGP', frequencyMonths: 1, class: 'mandatory', balanceDate: C.today(), firstDueDate: C.addDays(C.today(), 30) };
    modal(d.id ? 'تعديل التزام' : 'التزام جديد', field('name', 'الاسم', 'text', { value: L.name, req: 1 }) + field('entityId', 'على', 'select', { options: entOpts(), value: L.entityId || defaultEntity() }) + field('lender', 'الجهة الدائنة', 'text', { value: L.lender }) + field('currency', 'العملة', 'select', { options: [['EGP', 'جنيه'], ['USD', 'دولار'], ['EUR', 'يورو'], ['SAR', 'ريال'], ['AED', 'درهم']], value: L.currency }) + field('fxRate', 'سعر الصرف', 'number', { value: L.fxRate }) + field('fxDate', 'تاريخ السعر', 'date', { value: L.fxDate }) + field('fxSource', 'مصدر السعر', 'text', { value: L.fxSource }) + field('principal', 'المتبقي من الأصل', 'number', { value: L.principal }) + field('balanceDate', 'بتاريخ', 'date', { value: L.balanceDate }) + field('installment', 'قيمة القسط', 'number', { value: L.installment, req: 1 }) + field('frequencyMonths', 'الدورية', 'select', { options: [[1, 'شهري'], [3, 'ربع سنوي'], [6, 'نصف سنوي'], [12, 'سنوي']], value: L.frequencyMonths }) + field('firstDueDate', 'تاريخ القسط القادم', 'date', { value: L.firstDueDate, req: 1 }) + field('count', 'عدد الأقساط المتبقية', 'number', { value: L.count, req: 1 }) + field('interestRate', 'الفائدة السنوية %', 'number', { value: L.interestRate }) + field('earlyPenaltyPct', 'غرامة السداد المبكر %', 'number', { value: L.earlyPenaltyPct }) + field('deferPenaltyPct', 'غرامة التأجيل % من القسط', 'number', { value: L.deferPenaltyPct }) + field('class', 'التصنيف', 'select', { options: [['mandatory', 'إلزامي'], ['deferrable', 'قابل للتأجيل'], ['optional', 'اختياري']], value: L.class }) + field('payAccountId', 'حساب السداد', 'select', { options: [['', '—']].concat(accOpts(a => a.type !== 'pos')), value: L.payAccountId }) + field('internal', 'التزام داخلي (مثلاً قرض من المالك للشركة) — يُحذف من المجمّع', 'checkbox', { value: L.internal }) + field('earlyTerms', 'شروط السداد المبكر', 'textarea', { value: L.earlyTerms }), 'liability', { id: d.id });
  },
  project: d => {
    const p = d.id ? S.projects.find(x => x.id === d.id) : { status: 'study', type: 'new', entityId: 'owner', setup: [{ monthOffset: 0, amount: '' }], rampMonths: 6, pilotScale: 0.3, phases: 2, phaseGapMonths: 6, opexStartOffset: 0, firstRevenueOffset: 3 };
    const setupTxt = (p.setup || []).map(s => s.monthOffset + ':' + s.amount).join(', ');
    modal(d.id ? 'تعديل مشروع' : 'مشروع / فرصة جديدة', field('name', 'الاسم', 'text', { value: p.name, req: 1 }) + field('type', 'النوع', 'select', { options: [['farm', 'مزرعة / زراعي / دواجن'], ['new', 'نشاط جديد'], ['expansion', 'توسعة فرع قائم'], ['device', 'جهاز'], ['branch', 'فرع جديد'], ['realestate', 'عقار']], value: p.type }) + field('status', 'الحالة', 'select', { options: [['study', 'قيد الدراسة'], ['contracted', 'متعاقد عليه'], ['active', 'قائم / شغال'], ['rejected', 'مرفوض']], value: p.status }) + field('entityId', 'يموَّل من', 'select', { options: entOpts(), value: p.entityId }) + field('startDate', 'تاريخ البدء (للقائم)', 'date', { value: p.startDate || C.today() })
      + field('setupTxt', 'دفعات التأسيس "شهر:مبلغ" مفصولة بفواصل (مثال 0:500000, 2:200000)', 'text', { value: setupTxt, cls: 'full' }) + field('workingCapital', 'رأس المال العامل', 'number', { value: p.workingCapital }) + field('monthlyOpex', 'المصروف الشهري', 'number', { value: p.monthlyOpex }) + field('opexStartOffset', 'يبدأ المصروف من الشهر', 'number', { value: p.opexStartOffset }) + field('firstRevenueOffset', 'أول إيراد في الشهر', 'number', { value: p.firstRevenueOffset }) + field('collectionLagMonths', 'تأخر التحصيل عن البيع (شهر)', 'number', { value: p.collectionLagMonths }) + field('steadyRevenue', 'الإيراد الشهري المستقر', 'number', { value: p.steadyRevenue }) + field('rampMonths', 'شهور الوصول للإنتاج المتوقع', 'number', { value: p.rampMonths }) + field('seasonTxt', 'الموسمية: 12 معامل (اختياري) مثل 1,1,0.8…', 'text', { value: (p.seasonality || []).join(','), cls: 'full' })
      + field('residualValue', 'القيمة المتبقية بعد 10 سنوات', 'number', { value: p.residualValue }) + field('landValue', 'قيمة الأرض (منفصلة عن النشاط)', 'number', { value: p.landValue }) + field('landAppreciationAnnual', 'ارتفاع قيمة الأرض سنويًا %', 'number', { value: p.landAppreciationAnnual }) + field('mgmtHoursWeek', 'وقت إدارتك (ساعة/أسبوع)', 'number', { value: p.mgmtHoursWeek }) + field('ownerDependent', 'التشغيل يعتمد على وجودي', 'checkbox', { value: p.ownerDependent }) + field('pilotScale', 'حجم التجربة المصغرة (0.3 = 30%)', 'number', { value: p.pilotScale }) + field('phases', 'عدد المراحل للتنفيذ المرحلي', 'number', { value: p.phases }) + field('phaseGapMonths', 'الفاصل بين المراحل (شهر)', 'number', { value: p.phaseGapMonths }) + field('exitCost', 'تكلفة الخروج', 'number', { value: p.exitCost }) + field('note', 'ملاحظات (المساحة، المحصول، المياه، العمالة…)', 'textarea', { value: p.note }), 'project', { id: d.id });
  },
  scenario: () => modal('سيناريو جديد', field('name', 'اسم السيناريو', 'text', { req: 1, value: 'سيناريو ' + (S.scenarios.length + 1) }) + field('assumeSet', 'الافتراضات الافتراضية', 'select', { options: [['base', 'أساسي'], ['conservative', 'متحفظ'], ['optimistic', 'متفائل']] }) + '<p class="full small muted">سيتم حفظ نسخة مؤرخة من البيانات الحالية داخل السيناريو.</p>', 'scenario'),
  change: d => {
    const type = d.type || 'buy_device';
    const sel = '<label class="full">نوع التغيير<select name="type" data-act-change="changeType">' + Object.keys(C.CHANGE_TYPES).map(k => opt(k, C.CHANGE_TYPES[k], k === type)).join('') + '</select></label>';
    const F = { date: field('date', 'التاريخ', 'date', { value: C.today() }), ent: field('entityId', 'الجهة', 'select', { options: entOpts() }), label: field('label', 'الوصف', 'text'), amount: field('amount', 'المبلغ', 'number') };
    const body = {
      buy_device: F.ent + F.label + F.date + field('downPayment', 'الدفعة المقدمة', 'number', { req: 1 }) + field('installments', 'عدد الأقساط', 'number') + field('installmentAmount', 'قيمة القسط', 'number') + field('frequencyMonths', 'كل كم شهر', 'number', { value: 1 }) + field('monthlyRevenue', 'إيراد شهري إضافي متوقع', 'number') + field('monthlyCost', 'تكلفة تشغيل شهرية', 'number') + field('rampMonths', 'شهور الوصول للإيراد الكامل', 'number', { value: 3 }),
      farm_injection: field('entityId', 'من', 'select', { options: entOpts(), value: 'owner' }) + F.label + F.date + F.amount + field('monthlyReturn', 'عائد شهري متوقع', 'number') + field('returnStartMonth', 'يبدأ العائد بعد (شهر)', 'number', { value: 6 }),
      open_branch: field('entityId', 'يموَّل من', 'select', { options: entOpts(), value: 'admin' }) + F.label + F.date + field('amount', 'تكلفة التأسيس', 'number', { req: 1 }) + field('workingCapital', 'رأس المال العامل', 'number') + field('monthlyCost', 'مصروف شهري', 'number') + field('monthlyRevenue', 'إيراد شهري مستقر', 'number') + field('rampStart', 'أول إيراد بعد (شهر)', 'number', { value: 2 }) + field('rampMonths', 'شهور الوصول للإيراد الكامل', 'number', { value: 6 }),
      start_project: field('projectId', 'المشروع', 'select', { options: S.projects.filter(p => p.status !== 'active').map(p => [p.id, p.name]) }) + F.date + field('mode', 'طريقة التنفيذ', 'select', { options: [['full', 'كامل'], ['pilot', 'تجربة مصغرة'], ['phased', 'مرحلي']] }) + field('scale', 'معامل الحجم', 'number', { value: 1 }),
      sell_asset: field('assetId', 'الأصل', 'select', { options: S.assets.map(a => [a.id, a.name]) }) + field('pct', 'النسبة المباعة %', 'number', { value: 50 }) + F.date,
      prepay: field('liabilityId', 'الالتزام', 'select', { options: S.liabilities.filter(L => visIds().includes(L.entityId)).map(L => [L.id, L.name]) }) + field('pct', 'نسبة السداد %', 'number', { value: 100 }) + F.date,
      defer_payment: field('liabilityId', 'التزام (اختياري)', 'select', { options: [['', '—']].concat(S.liabilities.map(L => [L.id, L.name])) }) + field('payableId', 'أو مستحق (اختياري)', 'select', { options: [['', '—']].concat(S.payables.map(p => [p.id, p.payee])) }) + field('months', 'مدة التأجيل (شهر)', 'number', { value: 1 }),
      claims_delay: field('days', 'أيام التأخير الإضافية', 'number', { value: 30 }),
      expense_up: field('entityId', 'الجهة (فارغ = الكل)', 'select', { options: [['', 'كل الجهات']].concat(entOpts()) }) + field('pct', 'نسبة الزيادة %', 'number', { value: 10 }),
      branch_drop: field('entityId', 'الفرع', 'select', { options: entOpts(e => e.type === 'branch') }) + field('pct', 'نسبة الانخفاض %', 'number', { value: 20 }),
      one_off: field('entityId', 'الجهة', 'select', { options: entOpts() }) + F.label + F.date + field('amount', 'المبلغ (+ تحصيل / − دفعة)', 'number', { req: 1 })
    }[type];
    modal('إضافة تغيير للسيناريو', sel + body, 'change', { s: d.s });
  },
  entity: d => { const e = d.id ? S.entities.find(x => x.id === d.id) : { type: 'branch', active: true, assume: { mode: 'auto' } }; modal(d.id ? 'تعديل جهة' : 'فرع جديد', field('name', 'الاسم', 'text', { value: e.name, req: 1 }) + (e.type === 'branch' ? field('active', 'نشط', 'checkbox', { value: e.active !== false }) : '') + field('mode', 'أساس التوقع', 'select', { options: [['auto', 'نمط الحركات الفعلية (افتراض عند نقص البيانات)'], ['manual', 'افتراض يدوي']], value: e.assume.mode }) + field('monthlyIn', 'تحصيل شهري (افتراض)', 'number', { value: e.assume.monthlyIn }) + field('monthlyOut', 'صرف شهري (افتراض)', 'number', { value: e.assume.monthlyOut }) + field('monthlyNewClaims', 'مطالبات تأمين جديدة شهريًا', 'number', { value: e.assume.monthlyNewClaims }) + field('claimLagDays', 'متوسط أيام تحصيل التأمين', 'number', { value: e.assume.claimLagDays }) + field('depreciationMonthly', 'الإهلاك الشهري (غير نقدي)', 'number', { value: e.depreciationMonthly }) + field('reserve', 'حد أدنى خاص بهذه الجهة (اختياري)', 'number', { value: S.settings.reserve.byEntity[e.id] }), 'entity', { id: d.id }); },
  account: d => { const a = d.id ? S.accounts.find(x => x.id === d.id) : { type: 'cash', entityId: d.ent || defaultEntity(), openingDate: C.today(), opening: 0, settleDays: 2, feePct: 1.5 }; modal(d.id ? 'تعديل حساب' : 'حساب جديد', field('name', 'الاسم', 'text', { value: a.name, req: 1 }) + field('type', 'النوع', 'select', { options: Object.keys(C.ACCOUNT_TYPES).map(k => [k, C.ACCOUNT_TYPES[k]]), value: a.type }) + field('entityId', 'مالك الحساب (حيث يظهر الرصيد)', 'select', { options: entOpts(), value: a.entityId }) + field('opening', 'الرصيد الافتتاحي', 'number', { value: a.opening }) + field('openingDate', 'تاريخ الرصيد الافتتاحي', 'date', { value: a.openingDate }) + field('linkedBankId', 'لماكينة POS: الحساب البنكي المستلم', 'select', { options: [['', '—']].concat(accOpts(x => x.type === 'bank')), value: a.linkedBankId }) + field('settleDays', 'أيام التسوية', 'number', { value: a.settleDays }) + field('feePct', 'نسبة رسوم الماكينة %', 'number', { value: a.feePct }) + (d.id ? field('active', 'نشط', 'checkbox', { value: a.active !== false }) : ''), 'account', { id: d.id }); },
  user: d => { const u = d.id ? S.users.find(x => x.id === d.id) : { role: 'cashier', entityIds: [], active: true }; modal(d.id ? 'تعديل مستخدم' : 'مستخدم جديد', field('name', 'الاسم', 'text', { value: u.name, req: 1 }) + (u.role === 'owner' ? hid('role', 'owner') : field('role', 'الدور', 'select', { options: Object.keys(C.ROLES).filter(r => r !== 'owner').map(r => [r, C.ROLES[r]]), value: u.role })) + (u.role === 'owner' ? '' : '<fieldset class="full"><legend>الجهات المصرح بها</legend>' + S.entities.filter(e => e.id !== 'owner').map(e => '<label class="chk"><input type="checkbox" name="ent_' + e.id + '" ' + ((u.entityIds || []).includes(e.id) ? 'checked' : '') + '> ' + esc(e.name) + '</label>').join('') + '</fieldset>' + field('approveClose', 'يمكنه اعتماد الإقفال (لمدير الفرع)', 'checkbox', { value: u.approveClose }) + field('active', 'نشط', 'checkbox', { value: u.active !== false })) + (u.role === 'owner' ? '<p class="full small muted">كلمة مرور المالك تتغير من «المساحة والتخزين»</p>' : field('pin', d.id ? 'رقم سري جديد (اتركه فارغًا للإبقاء)' : 'الرقم السري (4 أرقام على الأقل)', 'password', d.id ? {} : { req: 1 })), 'user', { id: d.id }); }
};
function txnForm(kind, title, d) {
  const e = d.e || defaultEntity();
  const cats = (kind === 'income' ? S.categories.income : S.categories.expense).map(c => [c.id, c.name]);
  modal(title, hid('tid', C.uid('t')) + field('entityId', kind === 'expense' ? 'يُحمّل على' : 'الفرع', 'select', { options: entOpts(), value: e, attr: ' data-act-change="entityLines"' }) + field('categoryId', kind === 'income' ? 'التخصص / الخدمة / جهة التحصيل' : 'التصنيف', 'select', { options: cats }) + field('date', 'التاريخ', 'date', { value: C.today(), req: 1 }) + field('time', 'الوقت', 'time', { value: C.nowStamp().slice(11) }) + '<div class="full">' + linesEditor(e) + '</div>' + field('ref', 'رقم المرجع / الفاتورة', 'text') + (e !== 'owner' ? field('att', 'مرفق (صورة/PDF ≤ 300KB)', 'file', { attr: ' accept="image/*,application/pdf"' }) : '') + field('note', 'ملاحظات', 'textarea') + (kind === 'expense' ? '<p class="full small muted">لو الإدارة دفعت مصروفًا يخص فرعًا: اختر الفرع في «يُحمّل على» وحساب الإدارة في سطر الدفع — يُحمّل على الفرع ويُخصم من نقد الإدارة مرة واحدة.</p>' : ''), 'txn', { kind });
}
async function readFileAsDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
const SUBMIT = {
  async txn(v, d, f) {
    const lines = readLines(); const entityId = d.entityId || v.entityId;
    const t = { id: v.tid, kind: d.kind, date: v.date, time: v.time || C.nowStamp().slice(11), entityId, categoryId: d.categoryId || v.categoryId || null, lines, ref: v.ref || '', note: v.note || '', linkId: d.linkId || v.linkId || null };
    if (d.kind === 'financing') t.sub = v.sub;
    if (d.kind === 'liability_payment') { t.principal = +v.principal || 0; t.interest = +v.interest || 0; }
    if (d.kind === 'claim_payment') { const c = S.claims.find(x => x.id === d.linkId); const o = C.claimStatus(S, c).outstanding; if (C.lineTotal(t) > o + 0.01) { toast('المبلغ أكبر من المتبقي (' + fmt(o) + ')', 'err'); return false; } }
    const file = f.querySelector('input[name=att]'); if (file && file.files[0]) { if (file.files[0].size > 300000) { toast('المرفق أكبر من 300KB', 'err'); return false; } const id = C.uid('att'); RAW['att-' + id] = await readFileAsDataURL(file.files[0]); ST.put(WS, 'att-' + id, RAW['att-' + id]); t.attId = id; }
    if (ST.mode === 'cloud' && navigator.onLine === false) t.sync = 'pending';
    const r = C.addTxn(S, t, U);
    if (!r.ok) { toast(r.errors.join(' • '), 'err'); return false; }
    if (r.dup) { toast('هذه الحركة مسجلة بالفعل — لم تتكرر', 'warn'); return; }
    commit('تم تسجيل ' + C.KIND_LABELS[d.kind] + ' بمبلغ ' + fmt(C.lineTotal(t)));
  },
  transfer(v) {
    const r = C.addTransfer(S, { id: v.tid, date: v.date, time: C.nowStamp().slice(11), entityId: v.entityId, fromAccountId: v.fromAccountId, toAccountId: v.toAccountId, amount: +v.amount, fee: +v.fee || 0, note: v.note, ref: v.ref, finSub: v.finSub || null }, U);
    if (!r.ok) { toast(r.errors.join(' • '), 'err'); return false; } if (r.dup) return toast('مسجل بالفعل', 'warn');
    commit('تم التحويل');
  },
  settlement(v, d) {
    const r = C.settlePOS(S, { id: v.tid, date: v.date, entityId: d.entityId, posAccountId: v.posAccountId, bankAccountId: v.bankAccountId, gross: +v.gross, fee: +v.fee || 0, ref: v.ref }, U);
    if (!r.ok) { toast(r.errors.join(' • '), 'err'); return false; } commit('تمت التسوية: صافي ' + fmt(+v.gross - (+v.fee || 0)) + ' للبنك');
  },
  claim(v) { if (!C.canSeeEntity(S, U, v.entityId)) return false; const c = { id: C.uid('cl'), entityId: v.entityId, payer: v.payer, amount: +v.amount, date: v.date, expectedDate: v.expectedDate, collectAccountId: v.collectAccountId, categoryId: v.categoryId, note: v.note }; S.claims.push(c); C.audit(S, U, 'create', 'claim', c.id, null, c); commit('تم تسجيل المطالبة'); },
  payable(v) { const p = { id: C.uid('py'), entityId: v.entityId, payee: v.payee, amount: +v.amount, date: v.date || C.today(), dueDate: v.dueDate, categoryId: v.categoryId, class: v.class, payAccountId: v.payAccountId, note: v.note }; S.payables.push(p); C.audit(S, U, 'create', 'payable', p.id, null, p); commit('تم تسجيل المستحق'); },
  verify(v, d) { const a = S.accounts.find(x => x.id === d.id); const before = a.verified || null; a.verified = { amount: +v.amount, date: v.date, by: U.name, note: v.note }; C.audit(S, U, 'verify', 'account', a.id, before, a.verified, v.note); commit('تمت المطابقة'); },
  closeday(v) {
    const counted = {}; for (const k in v) { if (k.startsWith('cnt_')) { const id = k.slice(4); counted[id] = { amount: v[k], reason: v['why_' + id] }; } }
    const r = C.closeDay(S, { entityId: v.entityId, date: v.date, counted, note: v.note }, U);
    if (!r.ok) { toast(r.errors.join(' • '), 'err'); return false; } commit('تم إقفال اليوم');
  },
  asset(v, d) {
    const fields = ['name', 'type', 'owner', 'currency', 'unit', 'fxSource', 'valSource', 'basis', 'pledgedNote', 'note', 'fxDate', 'valDate']; const nums = ['quantity', 'karat', 'valueOrig', 'netSaleOrig', 'breakCostPct', 'fxRate', 'liquidationDays', 'expectedReturnAnnual'];
    let a = d.id ? S.assets.find(x => x.id === d.id) : { id: C.uid('as'), entityId: 'owner' }; const before = d.id ? C.clone(a) : null;
    fields.forEach(k => { a[k] = v[k]; }); nums.forEach(k => { a[k] = v[k] === '' ? '' : +v[k]; }); a.pledged = !!v.pledged;
    if (!d.id) S.assets.push(a); C.audit(S, U, d.id ? 'update' : 'create', 'vault:asset', a.id, before, C.clone(a)); commit('تم حفظ الأصل');
  },
  liability(v, d) {
    let L = d.id ? S.liabilities.find(x => x.id === d.id) : { id: C.uid('lb') }; const before = d.id ? C.clone(L) : null;
    ['name', 'entityId', 'lender', 'currency', 'fxDate', 'fxSource', 'balanceDate', 'firstDueDate', 'class', 'payAccountId', 'earlyTerms'].forEach(k => { L[k] = v[k]; });
    ['fxRate', 'principal', 'installment', 'frequencyMonths', 'count', 'interestRate', 'earlyPenaltyPct', 'deferPenaltyPct'].forEach(k => { L[k] = +v[k] || 0; }); L.internal = !!v.internal;
    if (!d.id) S.liabilities.push(L); C.audit(S, U, d.id ? 'update' : 'create', L.entityId === 'owner' ? 'vault:liability' : 'liability', L.id, before, C.clone(L)); commit('تم حفظ الالتزام');
  },
  project(v, d) {
    let p = d.id ? S.projects.find(x => x.id === d.id) : { id: C.uid('pr') }; const before = d.id ? C.clone(p) : null;
    ['name', 'type', 'status', 'entityId', 'startDate', 'note'].forEach(k => { p[k] = v[k]; });
    ['workingCapital', 'monthlyOpex', 'opexStartOffset', 'firstRevenueOffset', 'collectionLagMonths', 'steadyRevenue', 'rampMonths', 'residualValue', 'landValue', 'landAppreciationAnnual', 'mgmtHoursWeek', 'pilotScale', 'phases', 'phaseGapMonths', 'exitCost'].forEach(k => { p[k] = +v[k] || 0; });
    p.ownerDependent = !!v.ownerDependent;
    p.setup = (v.setupTxt || '').split(/[,،]/).map(x => x.trim()).filter(Boolean).map(x => { const [m, a] = x.split(':'); return { monthOffset: +m || 0, amount: +a || 0 }; });
    const ss = (v.seasonTxt || '').split(/[,،]/).map(x => +x.trim()).filter(x => !isNaN(x) && x > 0); p.seasonality = ss.length === 12 ? ss : [];
    if (!d.id) S.projects.push(p); C.audit(S, U, d.id ? 'update' : 'create', 'vault:project', p.id, before, C.clone(p)); commit('تم حفظ المشروع');
  },
  scenario(v) { const sc = { id: C.uid('sc'), name: v.name, assumeSet: v.assumeSet, snapshotAt: C.nowStamp(), snapshot: C.snapshotForScenario(S), changes: [] }; S.scenarios.push(sc); UI.whatif.sel.push(sc.id); C.audit(S, U, 'create', 'vault:scenario', sc.id, null, { name: sc.name }); commit('تم إنشاء السيناريو'); },
  change(v, d) { const sc = S.scenarios.find(x => x.id === d.s); const c = {}; for (const k in v) if (v[k] !== '' && v[k] != null) c[k] = isNaN(+v[k]) || k === 'date' || /Id$/.test(k) || k === 'label' || k === 'type' || k === 'mode' ? v[k] : +v[k]; sc.changes.push(c); commit('تمت إضافة التغيير'); },
  entity(v, d) {
    let e = d.id ? S.entities.find(x => x.id === d.id) : { id: C.uid('b'), type: 'branch', assume: {} }; const before = d.id ? C.clone(e) : null;
    e.name = v.name; if (e.type === 'branch') e.active = d.id ? !!v.active : true;
    e.assume = { mode: v.mode, monthlyIn: +v.monthlyIn || 0, monthlyOut: +v.monthlyOut || 0, monthlyNewClaims: +v.monthlyNewClaims || 0, claimLagDays: +v.claimLagDays || 60 }; e.depreciationMonthly = +v.depreciationMonthly || 0;
    if (v.reserve !== '') S.settings.reserve.byEntity[e.id] = +v.reserve; else delete S.settings.reserve.byEntity[e.id];
    if (!d.id) { S.entities.splice(S.entities.length - 1, 0, e); if (U.role !== 'owner') U.entityIds.push(e.id); }
    C.audit(S, U, d.id ? 'update' : 'create', e.id === 'owner' ? 'vault:entity' : 'entity', e.id, before, C.clone(e)); commit('تم الحفظ'); if (!d.id) renderShell(), render();
  },
  account(v, d) {
    let a = d.id ? S.accounts.find(x => x.id === d.id) : { id: C.uid('a'), active: true }; const before = d.id ? C.clone(a) : null;
    a.name = v.name; a.type = v.type; a.entityId = v.entityId; a.opening = +v.opening || 0; a.openingDate = v.openingDate || C.today(); a.linkedBankId = v.linkedBankId || null; a.settleDays = +v.settleDays || 1; a.feePct = +v.feePct || 0; if (d.id) a.active = !!v.active;
    if (!d.id) S.accounts.push(a); C.audit(S, U, d.id ? 'update' : 'create', a.entityId === 'owner' ? 'vault:account' : 'account', a.id, before, C.clone(a)); commit('تم حفظ الحساب');
  },
  async user(v, d) {
    let u = d.id ? S.users.find(x => x.id === d.id) : { id: C.uid('u') };
    u.name = v.name; u.role = v.role || u.role;
    if (u.role !== 'owner') { u.entityIds = S.entities.filter(e => v['ent_' + e.id]).map(e => e.id); u.approveClose = !!v.approveClose; u.active = !!v.active; if (!d.id) u.active = true; }
    if (v.pin) { if (v.pin.length < 4) { toast('الرقم السري 4 خانات على الأقل', 'err'); return false; } u.salt = CR.newSalt(); u.hash = await CR.pinHash(v.pin, u.salt); }
    if (!d.id) S.users.push(u); C.audit(S, U, d.id ? 'update' : 'create', 'user', u.id, null, { name: u.name, role: u.role, entityIds: u.entityIds }); commit('تم حفظ المستخدم');
  }
};

/* ---------- الإجراءات ---------- */
const ACT = {
  startDemo: async () => { await createDemo(); loginScreen(); },
  startReal: () => setupReal(), welcome: () => welcome(),
  switchWs: async () => { const to = WS === 'demo' ? 'real' : 'demo'; if (U) await save(); setWs(to); U = null; if (!(await loadWorkspace(to))) { if (to === 'demo') { await createDemo(); return loginScreen(); } return setupReal(); } loginScreen(); },
  resetDemo: async () => { if (!confirmInline('resetDemo', 'تأكيد: سيتم مسح البيانات التجريبية الحالية وتوليدها من جديد')) return; await ST.wipe('demo'); await createDemo(); U = null; loginScreen(); },
  toggleSide: () => document.body.classList.toggle('side-open'),
  userMenu: () => modal(U.name, '<div class="full"><p>' + C.ROLES[U.role] + (U.role !== 'owner' ? ' — ' + (U.entityIds || []).map(en).map(esc).join('، ') : '') + '</p><p class="small muted">المساحة: ' + (WS === 'demo' ? 'تجريبية' : 'فعلية') + ' • الحفظ: ' + ST.mode + '</p><button type="button" class="btn danger" data-act="logout">تسجيل الخروج وقفل الخزنة</button></div>'),
  logout: () => { closeModal(); logout(); },
  quick: () => {
    const items = [['income', 'إيراد'], ['expense', 'مصروف'], ['transfer', 'تحويل بين حسابات'], ['refund', 'استرداد / رد مبلغ'], ['closeday', 'إقفال اليوم'], ['claim', 'مطالبة تأمين / آجل'], ['settlement', 'تسوية POS'], ['payable', 'مصروف مستحق'], ['financing', 'حركة تمويلية']].filter(([k]) => k !== 'closeday' || can('close')).filter(([k]) => U.role !== 'cashier' || ['income', 'expense', 'refund', 'transfer'].includes(k));
    modal('تسجيل سريع', '<div class="full quick-grid">' + items.map(([k, t]) => '<button type="button" class="qbtn q-' + k + '" data-act="form" data-f="' + k + '">' + t + '</button>').join('') + '</div>');
  },
  form: el => { const f = el.dataset.f; if (UI.modal) closeModal(); FORMS[f](Object.assign({}, el.dataset)); },
  closeModal: () => closeModal(),
  addLine: () => { const e = ($('#mf [name=entityId]') || {}).value; const used = readLines().reduce((s, l) => s + l.amount, 0); void used; $('#lines').insertAdjacentHTML('beforeend', lineRow({ methodId: S.methods[1] ? S.methods[1].id : S.methods[0].id, accountId: defaultAccount(e || (UI.modal.data.entityId), S.methods[1] ? S.methods[1].id : S.methods[0].id), amount: '' })); },
  rmLine: el => { if (document.querySelectorAll('#lines .line').length > 1) el.closest('.line').remove(); },
  reverse: el => { const t = S.txns.find(x => x.id === el.dataset.id); modal('قيد تصحيح', '<p class="full">سيتم إنشاء قيد عكسي بتاريخ اليوم للحركة: ' + C.KIND_LABELS[t.kind] + ' ' + fmt(txnAmount(t)) + ' بتاريخ ' + fdate(t.date) + '. الحركة الأصلية تبقى في السجل.</p>' + field('reason', 'سبب التصحيح', 'textarea'), 'reverseSubmit', { id: t.id }); },
  reopen: el => modal('إعادة فتح يوم مقفل', field('reason', 'السبب (يُسجل في التدقيق)', 'textarea'), 'reopenSubmit', { id: el.dataset.id }),
  toggleRow: el => { const r = document.getElementById('r_' + el.dataset.r); if (r) r.hidden = !r.hidden; },
  radarGran: el => { UI.radar.gran = el.dataset.g; render(); },
  vaultTab: el => { UI.vaultTab = el.dataset.k; render(); },
  setTab: el => { UI.settingsTab = el.dataset.k; render(); },
  decObj: el => { UI.decideObj = el.dataset.k; render(); },
  runDecide: el => { const back = el.dataset.back; $('#main').insertAdjacentHTML('afterbegin', '<div class="busy-bar">جارٍ تقييم البدائل…</div>'); setTimeout(() => { try { UI.decide = C.decide(S, { reserveMult: UI.reserveMult || 1 }); } catch (e) { console.error(e); toast(e.message, 'err'); } if (back) go(back); else render(); }, 30); },
  selScen: el => { const id = el.dataset.id; UI.whatif.sel = el.checked ? UI.whatif.sel.concat([id]) : UI.whatif.sel.filter(x => x !== id); render(); },
  whatifSet: el => { UI.whatif.set = el.dataset.k; render(); },
  delChange: el => { const sc = S.scenarios.find(x => x.id === el.dataset.s); sc.changes.splice(+el.dataset.i, 1); commit(); },
  refreshScen: el => { const sc = S.scenarios.find(x => x.id === el.dataset.id); sc.snapshot = C.snapshotForScenario(S); sc.snapshotAt = C.nowStamp(); commit('تم تحديث نسخة البيانات'); },
  delScen: el => { if (!confirmInline('del' + el.dataset.id, 'اضغط مرة أخرى لتأكيد حذف السيناريو')) return; S.scenarios = S.scenarios.filter(x => x.id !== el.dataset.id); C.audit(S, U, 'delete', 'vault:scenario', el.dataset.id); commit('تم الحذف'); },
  delAsset: el => { if (!confirmInline('da' + el.dataset.id, 'اضغط مرة أخرى لتأكيد الحذف')) return; const a = S.assets.find(x => x.id === el.dataset.id); a.voided = true; C.audit(S, U, 'delete', 'vault:asset', a.id, C.clone(a), null); closeModal(); commit('تم حذف الأصل'); },
  sens: () => { const sel = S.scenarios.filter(s => UI.whatif.sel.includes(s.id)); const r = C.sensitivity(S, [{ id: 'base', changes: [] }].concat(sel), 'min'); const nm = id => id === 'base' ? 'الوضع الحالي' : (S.scenarios.find(s => s.id === id) || {}).name; const ord = o => o.split('>').map(nm).join(' ← '); $('#sens').innerHTML = '<p class="small"><b>الترتيب الحالي حسب أقل رصيد:</b> ' + esc(ord(r.base)) + '</p>' + (r.flips.length ? '<ul class="small">' + r.flips.map(f => '<li>' + esc(f.label) + ' = ' + f.value + ' ← ' + esc(ord(f.order)) + '</li>').join('') + '</ul>' : '<p class="small">الترتيب ثابت في كل الاختبارات (التحصيل 0.8–1.1، المصروفات 0.95–1.2، تأخير التأمين 0–60 يوم، إيراد المشاريع 0.6–1.2).</p>'); },
  viewAtt: el => { const d = RAW['att-' + el.dataset.id]; if (!d) return toast('المرفق غير متاح', 'err'); modal('المرفق', /^data:image/.test(d) ? '<img class="full att" src="' + d + '" alt="مرفق">' : '<p class="full">ملف PDF مرفق</p>'); },
  impTemplate: async () => { const type = $('#impType').value; await loadScript(LIB.xlsx); const T = IMPORT_TYPES[type]; const ws = XLSX.utils.aoa_to_sheet([T.fields.map(f => f[1].replace(' *', ''))]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'قالب'); wb.Workbook = { Views: [{ RTL: true }] }; await ST.download('قالب_' + type + '.xlsx', new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); },
  impValidate: () => { document.querySelectorAll('[data-map]').forEach(s => { UI.importState.map[s.dataset.map] = s.value === '' ? null : +s.value; }); validateImport(); render(); },
  impCommit: () => commitImport(),
  impUndo: el => { if (!confirmInline('iu' + el.dataset.id, 'اضغط مرة أخرى لتأكيد إلغاء الدفعة (الحركات تُعلَّم ملغاة مع أثر مراجعة)')) return; const n = C.voidBatch(S, el.dataset.id, U, 'طلب المستخدم'); commit('تم إلغاء ' + n + ' سجل'); },
  exportReport: () => exportReport(), exportAnalysis: () => exportAnalysis(),
  pdf: el => exportPDF(el.dataset.el, el.dataset.name)
};
const confirmState = {};
function confirmInline(key, msg) { if (confirmState[key] && Date.now() - confirmState[key] < 5000) { delete confirmState[key]; return true; } confirmState[key] = Date.now(); toast(msg, 'warn'); return false; }
SUBMIT.reverseSubmit = (v, d) => { const r = C.reverseTxn(S, d.id, U, v.reason); if (!r.ok) { toast(r.errors.join(' • '), 'err'); return false; } commit('تم إنشاء قيد التصحيح'); };
SUBMIT.reopenSubmit = (v, d) => { const r = C.reopenDay(S, d.id, U, v.reason); if (!r.ok) { toast(r.errors.join(' • '), 'err'); return false; } commit('أعيد فتح اليوم'); };

document.addEventListener('click', e => {
  if (e.target.id === 'modal') return closeModal();
  const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'checkbox')) return;
  if (el.tagName === 'INPUT' && el.type === 'checkbox' && !ACT[el.dataset.act]) return;
  const fn = ACT[el.dataset.act]; if (fn) { if (el.tagName !== 'INPUT') e.preventDefault(); fn(el, e); }
  if (e.target.id === 'modal') closeModal();
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.change) { const k = el.dataset.change; const v = el.value; if (k === 'dayDate') UI.dayDate = v; else if (k === 'discount') { S.settings.discountRate = (+v || 0) / 100; S.settings.discountBasis = 'actual'; UI.decide = null; commitQuiet(); } else if (k === 'reserveMult') { UI.reserveMult = +v; UI.decide = null; } else { const [a, b] = k.split('.'); UI[a][b] = v; if (a === 'radar') { /* */ } } render(); return; }
  if (el.dataset.set) { setSetting(el.dataset.set, el.type === 'checkbox' ? el.checked : el.value); return; }
  const ac = el.dataset.actChange;
  if (ac === 'lineMethod') { const row = el.closest('.line'); const ent = ($('#mf [name=entityId]') || {}).value || (UI.modal && UI.modal.data.entityId); row.querySelector('.l-a').value = defaultAccount(ent, el.value) || row.querySelector('.l-a').value; }
  if (ac === 'entityLines') { document.querySelectorAll('#lines .line').forEach(r => { r.querySelector('.l-a').value = defaultAccount(el.value, r.querySelector('.l-m').value) || r.querySelector('.l-a').value; }); }
  if (ac === 'closeReload') { const f = $('#mf'); FORMS.closeday({ e: f.entityId.value, date: f.date.value }); }
  if (ac === 'changeType') { const s = UI.modal.data.s; FORMS.change({ s, type: el.value }); }
});
document.addEventListener('input', e => {
  if (e.target.dataset.actChange === 'closeDiff') { const d = (+e.target.value || 0) - (+e.target.dataset.exp); const el = e.target.parentElement.querySelector('.diff'); el.textContent = Math.abs(d) < 0.01 ? 'مطابق' : (d > 0 ? 'زيادة ' : 'عجز ') + fmt(Math.abs(d), 2); el.className = 'small diff ' + (Math.abs(d) < 0.01 ? 'pos' : 'neg'); }
  if (e.target.classList.contains('l-v')) { const t = readLines().reduce((s, l) => s + l.amount, 0); const el = $('#linesTotal'); if (el) el.textContent = document.querySelectorAll('#lines .line').length > 1 ? 'إجمالي الحركة: ' + fmt(t, 2) + ' (تظهر مرة واحدة موزعة على الطرق)' : ''; }
});
document.addEventListener('submit', async e => {
  const f = e.target; const k = f.dataset.inline; if (!k) return; e.preventDefault(); const v = Object.fromEntries(new FormData(f).entries());
  if (k === 'method') { S.methods.push({ id: C.uid('m'), name: v.name, kind: v.kind, active: true }); commit('تمت الإضافة'); }
  else if (k.startsWith('cat_')) { S.categories[k.slice(4)].push({ id: C.uid('c'), name: v.name }); commit('تمت الإضافة'); }
  else if (k === 'ownerpass') { if (v.n1 !== v.n2) return toast('غير متطابقتين', 'err'); if ((await CR.pinHash(v.old, U.salt)) !== U.hash) return toast('كلمة المرور الحالية غير صحيحة', 'err'); U.salt = CR.newSalt(); U.hash = await CR.pinHash(v.n1, U.salt); S.settings.vaultSalt = CR.newSalt(); VKEY = await CR.key(v.n1, S.settings.vaultSalt); lastVaultPlain = null; C.audit(S, U, 'update', 'vault:key', U.id, null, null, 'تغيير كلمة مرور المالك'); commit('تم التغيير وإعادة تشفير الخزنة'); f.reset(); }
  else if (k === 'backup') { if (v.p1 !== v.p2) return toast('غير متطابقتين', 'err'); await doBackup(v.p1); }
  else if (k === 'restore') { await previewRestore(f.querySelector('[name=f]').files[0], v.p); }
});
function setSetting(path, val) {
  const s = S.settings;
  if (path === 'discountRatePct') { s.discountRate = (+val || 0) / 100; UI.decide = null; }
  else { const parts = path.split('.'); let o = s; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]; const last = parts[parts.length - 1]; o[last] = typeof val === 'boolean' ? val : (isNaN(+val) || val === '' ? val : +val); }
  C.audit(S, U, 'update', 'settings', path, null, { value: val }); UI.decide = null; commit('تم الحفظ');
}

/* ---------- الاستيراد ---------- */
async function readImport(file, type) {
  if (!file) return; try { await loadScript(LIB.xlsx); } catch (e) { return toast('تحميل مكتبة Excel يحتاج اتصالًا', 'err'); }
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' }).filter(r => r.some(c => String(c).trim() !== ''));
  if (rows.length < 2) return toast('الملف فارغ', 'err');
  const headers = rows[0].map(String); const map = {};
  for (const [k, l] of IMPORT_TYPES[type].fields) { const label = l.replace(' *', '').split(' (')[0]; const i = headers.findIndex(h => h.trim() && (h.includes(label) || label.includes(h.trim()))); map[k] = i >= 0 ? i : null; }
  UI.importState = { type, fileName: file.name, headers, rows: rows.slice(1), map, checked: null }; render();
}
function normDate(x) { if (!x) return ''; const s = String(x).trim(); let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'); m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); } return ''; }
const findBy = (arr, name) => { const n = String(name || '').trim(); return n ? arr.find(x => x.name.trim() === n) || arr.find(x => x.name.includes(n)) : null; };
function validateImport() {
  const st = UI.importState; const T = IMPORT_TYPES[st.type]; const seen = new Set();
  st.checked = st.rows.map((row, i) => {
    const v = {}; for (const [k] of T.fields) v[k] = st.map[k] == null ? '' : String(row[st.map[k]] == null ? '' : row[st.map[k]]).trim();
    const err = []; for (const [k, l] of T.fields) if (l.includes('*') && !v[k]) err.push('ناقص: ' + l.replace(' *', ''));
    let key = '';
    if (st.type === 'txns') {
      v.date = normDate(v.date); if (!v.date) err.push('تاريخ غير مفهوم'); v.amount = +String(v.amount).replace(/[,،\s]/g, ''); if (!(v.amount > 0)) err.push('مبلغ غير صالح');
      const e = findBy(S.entities, v.entity); if (!e) err.push('جهة غير معروفة'); else if (!C.canSeeEntity(S, U, e.id)) err.push('جهة غير مصرح بها'); v._e = e && e.id;
      const m = findBy(S.methods, v.method) || S.methods[0]; v._m = m.id;
      const a = findBy(S.accounts, v.account) || (e ? S.accounts.find(x => x.id === defaultAccount(e.id, m.id)) : null); if (!a) err.push('حساب غير معروف'); v._a = a && a.id;
      v._k = /مصروف|expense/i.test(v.kind) ? 'expense' : /استرداد|مرتجع|refund/i.test(v.kind) ? 'refund' : 'income';
      const cats = v._k === 'income' ? S.categories.income : S.categories.expense; const c = findBy(cats, v.category); v._c = c ? c.id : null;
      key = [v.date, v._e, v.amount, v.ref, v._k].join('|');
      const exists = S.txns.some(t => !t.voided && t.date === v.date && t.entityId === v._e && Math.abs(C.lineTotal(t) - v.amount) < 0.01 && (t.ref || '') === (v.ref || '') && t.kind === v._k);
      if (exists) return { i, v, err, dup: true };
    } else if (st.type === 'accounts') { const e = findBy(S.entities, v.entity); if (!e) err.push('جهة غير معروفة'); v._e = e && e.id; v._t = /بنك/.test(v.type) ? 'bank' : /محفظ|فودافون|wallet/i.test(v.type) ? 'wallet' : /pos|ماكين/i.test(v.type) ? 'pos' : 'cash'; key = v.name; if (findBy(S.accounts, v.name) && findBy(S.accounts, v.name).name === v.name) return { i, v, err, dup: true }; }
    else if (st.type === 'branches') { key = v.name; if (S.entities.some(e => e.name === v.name)) return { i, v, err, dup: true }; }
    else if (st.type === 'liabilities') { const e = findBy(S.entities, v.entity); if (!e) err.push('جهة غير معروفة'); v._e = e && e.id; v.firstDue = normDate(v.firstDue); if (!v.firstDue) err.push('تاريخ غير مفهوم'); key = v.name + '|' + v._e; if (S.liabilities.some(L => !L.voided && L.name === v.name && L.entityId === v._e)) return { i, v, err, dup: true }; }
    const dup = seen.has(key); seen.add(key);
    return { i, v, err, dup };
  });
}
function commitImport() {
  const st = UI.importState; const batch = C.uid('imp'); let n = 0;
  for (const r of st.checked) {
    if (r.err.length || r.dup) continue; const v = r.v;
    if (st.type === 'txns') { const res = C.addTxn(S, { id: batch + '_' + r.i, kind: v._k, date: v.date, time: '', entityId: v._e, categoryId: v._c, lines: [{ methodId: v._m, accountId: v._a, amount: v.amount }], ref: v.ref, note: v.note, batchId: batch }, U); if (res.ok) n++; }
    else if (st.type === 'accounts') { S.accounts.push({ id: C.uid('a'), name: v.name, entityId: v._e, type: v._t, opening: +String(v.opening).replace(/[,،]/g, '') || 0, openingDate: normDate(v.openingDate) || C.today(), active: true, batchId: batch, settleDays: 2, feePct: 0 }); n++; }
    else if (st.type === 'branches') { S.entities.splice(S.entities.length - 1, 0, { id: C.uid('b'), name: v.name, type: 'branch', active: true, assume: { mode: 'auto', monthlyIn: 0, monthlyOut: 0, monthlyNewClaims: 0, claimLagDays: 60 }, depreciationMonthly: 0, batchId: batch }); n++; }
    else if (st.type === 'liabilities') { S.liabilities.push({ id: C.uid('lb'), name: v.name, entityId: v._e, lender: v.lender, installment: +v.installment || 0, frequencyMonths: +v.frequency || 1, firstDueDate: v.firstDue, count: +v.count || 0, principal: +v.principal || 0, balanceDate: C.today(), interestRate: +v.interest || 0, class: /تأجيل/.test(v.class) ? 'deferrable' : /اختيار/.test(v.class) ? 'optional' : 'mandatory', currency: v.currency || 'EGP', batchId: batch }); n++; }
  }
  S.imports.push({ id: batch, at: C.nowStamp(), by: U.name, source: st.fileName, type: st.type, count: n });
  C.audit(S, U, 'import', 'batch', batch, null, { source: st.fileName, type: st.type, count: n });
  UI.importState = null; commit('تم استيراد ' + n + ' سجل في دفعة مستقلة');
}

/* ---------- التصدير ---------- */
async function xlsxBook(sheets, filename) {
  try { await loadScript(LIB.xlsx); } catch (e) { return toast('تحميل مكتبة Excel يحتاج اتصالًا', 'err'); }
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) { const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = (aoa[0] || []).map(() => ({ wch: 18 })); XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); }
  wb.Workbook = { Views: [{ RTL: true }] };
  const ok = await ST.download(filename, new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  toast(ok ? 'تم تجهيز الملف' : 'تعذر التنزيل', ok ? 'ok' : 'err');
  C.audit(S, U, 'export', 'file', filename, null, null); commitQuiet();
}
function exportReport() {
  if (!can('export')) return; const [from, to] = repRange(); const ids = efIds(); const r = UI.rep;
  const tbl = C.methodTable(S, { entityIds: ids, from, to, methodId: r.methodId || null, accountId: r.accountId || null, categoryId: r.categoryId || null });
  const stamp = ['تاريخ التصدير', C.nowStamp(), 'الفترة', from + ' → ' + to, 'بواسطة', U.name];
  const txns = S.txns.filter(t => ids.includes(t.entityId) && t.date >= from && t.date <= to && (!r.categoryId || t.categoryId === r.categoryId));
  const rows = [['التاريخ', 'الوقت', 'النوع', 'الجهة', 'التصنيف', 'طريقة الدفع', 'الحساب', 'المبلغ', 'المرجع', 'ملاحظات', 'المستخدم', 'الحالة', 'المعرف']];
  for (const t of txns) { if (t.kind === 'transfer' || t.kind === 'settlement') rows.push([t.date, t.time || '', C.KIND_LABELS[t.kind], en(t.entityId), '', '', an(t.fromAccountId) + ' → ' + an(t.toAccountId), t.amount, t.ref || '', t.note || '', t.userName || '', t.voided ? 'ملغاة' : t.reversedBy ? 'معكوسة' : '', t.id]); else for (const l of t.lines) { if (r.methodId && l.methodId !== r.methodId) continue; if (r.accountId && l.accountId !== r.accountId) continue; rows.push([t.date, t.time || '', t.kind === 'financing' ? C.FIN_LABELS[t.sub] : C.KIND_LABELS[t.kind], en(t.entityId), cn(t.categoryId), mn(l.methodId), an(l.accountId), l.amount, t.ref || '', t.note || '', t.userName || '', t.voided ? 'ملغاة' : t.reversedBy ? 'معكوسة' : '', t.id]); } }
  const p = C.pnl(S, ids, from, to);
  xlsxBook([['ملخص طرق الدفع', [stamp, [], ['طريقة الدفع', 'الإيرادات', 'المصروفات', 'المردودات', 'صافي الحركة']].concat(tbl.rows.map(x => [mn(x.methodId), x.rev, x.exp, x.ref, x.net])).concat([['الإجمالي', tbl.total.rev, tbl.total.exp, tbl.total.ref, tbl.total.net]])], ['الحركات', rows], ['الربح والنقد', [['البند', 'القيمة']].concat([['صافي الإيراد', p.netRevenue], ['مصروفات التشغيل', p.opex], ['الإهلاك', p.depreciation], ['الربح التشغيلي', p.operatingProfit], ['الفوائد', p.interest], ['صافي الربح', p.netProfit], [], ['المصالحة', '']]).concat(p.recon.map(x => [x.label, x.amount]))]], 'تقرير_' + from + '_' + to + '.xlsx');
}
function exportAnalysis() {
  const T = C.today(); const P = C.positions(S, U); const stamp = [['Smart Care | التحليل المالي', '', 'تاريخ', C.nowStamp(), 'المساحة', WS === 'demo' ? 'تجريبية' : 'فعلية']];
  const inputs = stamp.concat([[], ['المدخل', 'القيمة', 'المصدر/الطبيعة', 'تاريخ التحديث']], [['احتياطي تشغيل الشركة', S.settings.reserve.ops, 'إعداد', ''], ['احتياطي كل فرع', S.settings.reserve.branchDefault, 'إعداد', ''], ['احتياطي شخصي', S.settings.reserve.owner, 'إعداد', ''], ['معدل الخصم', S.settings.discountRate, C.BASIS[S.settings.discountBasis], ''], ['وقت الإدارة المتاح (س/أسبوع)', S.settings.ownerHoursPerWeek, 'إعداد', ''], ['سحب المالك الشهري', S.settings.transfers.monthlyDrawing, 'إعداد', '']], Object.keys(S.settings.scen.conservative).map(k => ['افتراض ' + k + ' (متحفظ/أساسي/متفائل)', S.settings.scen.conservative[k] + ' / ' + S.settings.scen.base[k] + ' / ' + S.settings.scen.optimistic[k], 'افتراض قابل للتعديل', '']));
  const liq = [['الحساب/الأصل', 'النوع', 'الجهة/المالك', 'العملة', 'القيمة الأصلية', 'سعر الصرف', 'تاريخ ومصدر السعر', 'القيمة ج.م', 'صافي البيع ج.م', 'مدة التسييل (يوم)', 'مرهون', 'الطبيعة', 'تاريخ التقييم']];
  for (const a of S.accounts.filter(x => visIds().includes(x.entityId))) { const L = C.accountLedger(S, a.id); liq.push([a.name, C.ACCOUNT_TYPES[a.type], en(a.entityId), 'EGP', L.approved, 1, '', L.approved, L.approved, a.type === 'pos' ? a.settleDays : 0, 'لا', a.verified ? 'فعلي (مطابقة)' : 'دفاتر', a.verified ? a.verified.date : '']); }
  if (S._vaultOpen) for (const a of S.assets.filter(x => !x.voided)) { const v = C.assetValues(a); liq.push([a.name, C.ASSET_TYPES[a.type], a.owner || 'المالك', a.currency || 'EGP', a.valueOrig, C.fx(a), (a.fxDate || '') + ' ' + (a.fxSource || ''), v.value, v.net, a.liquidationDays, a.pledged ? 'نعم' : 'لا', C.BASIS[a.basis] || '', a.valDate]); }
  const from30 = C.addDays(T, -29);
  const clinics = [['الجهة', 'صافي الإيراد 30 يوم', 'مصروفات التشغيل', 'الإهلاك', 'الربح التشغيلي', 'النقد الذي ولّده', 'مستحق لنا', 'التزامات 90 يوم']].concat(S.entities.filter(e => e.type !== 'owner' && visIds().includes(e.id)).map(e => { const p = C.pnl(S, [e.id], from30, T); return [e.name, p.netRevenue, p.opex, p.depreciation, p.operatingProfit, p.operatingCash, S.claims.filter(c => !c.voided && c.entityId === e.id).reduce((s, c) => s + Math.max(0, C.claimStatus(S, c).outstanding), 0), C.obligationsWithin(S, [e.id], 90).total]; }));
  const farm = [['المشروع', 'الحالة', 'الشهر', 'تأسيس', 'مصروف', 'تحصيل', 'صافي', 'تراكمي']];
  if (S._vaultOpen) for (const p of S.projects.filter(x => !x.voided && x.type === 'farm')) { let cum = 0; C.projectMonthly(p, { months: 36 }).forEach(x => { cum += x.in - x.out - x.lump; farm.push([p.name, p.status, x.m + 1, Math.round(x.lump), Math.round(x.out), Math.round(x.in), Math.round(x.in - x.out - x.lump), Math.round(cum)]); }); }
  const liab = [['الالتزام', 'الجهة', 'الدائن', 'العملة', 'تاريخ الاستحقاق', 'المبلغ ج.م', 'التصنيف', 'الفائدة %', 'شروط السداد المبكر']];
  for (const L of S.liabilities.filter(x => !x.voided && visIds().includes(x.entityId))) for (const s of C.liabilitySchedule(S, L).schedule) liab.push([L.name, en(L.entityId), L.lender || '', L.currency || 'EGP', s.due, s.amount, L.class, L.interestRate || 0, L.earlyTerms || '']);
  for (const p of S.payables.filter(x => !x.voided && visIds().includes(x.entityId))) { const o = C.payableStatus(S, p).outstanding; if (o > 0) liab.push([p.payee + ' (مستحق)', en(p.entityId), p.payee, 'EGP', p.dueDate, o, p.class, 0, '']); }
  const opps = [['الفرصة', 'الحالة', 'الدفعة الأولى', 'التمويل حتى أول تحصيل', 'أقصى مبلغ مربوط', 'أول تحصيل (شهر)', 'التعادل النقدي (شهر)', 'الاسترداد (شهر)', 'ساعات/أسبوع']];
  if (S._vaultOpen) for (const p of S.projects.filter(x => !x.voided)) { const st = C.projectStats(p, {}); opps.push([p.name, p.status, st.initial, st.fundingToFirstRevenue, st.maxTied, st.firstRevenueMonth, st.cashBreakevenMonth, st.paybackMonth, p.mgmtHoursWeek || 0]); }
  const fc = C.forecast(S, {}); const fcc = C.forecast(S, { assume: S.settings.scen.conservative }); const gid = fc.groups.total ? 'total' : 'company';
  const cf = [['الفترة', 'من', 'إلى', 'افتتاح', 'متحصلات', 'مدفوعات', 'إقفال', 'أقل رصيد', 'إقفال (متحفظ)']];
  const wc = C.weeklyRows(fcc, gid, 13); C.weeklyRows(fc, gid, 13).forEach((r, i) => cf.push(['أسبوع ' + r.w, r.from, r.to, r.open, r.in, r.out, r.close, r.min, wc[i].close]));
  const mc = C.monthlyRows(fcc, gid, 24); C.monthlyRows(fc, gid, 24).forEach((r, i) => cf.push(['شهر ' + r.month, r.from, r.to, r.open, r.in, r.out, r.close, r.min, mc[i] ? mc[i].close : '']));
  const scen = [['السيناريو', 'أقل رصيد', 'تاريخه', 'أول نزول تحت الاحتياطي', 'الرصيد بعد 30', 'بعد 90']];
  for (const [k, l] of [['base', 'أساسي'], ['conservative', 'متحفظ'], ['optimistic', 'متفائل']]) { const st = C.seriesStats(C.forecast(S, { assume: S.settings.scen[k] }), gid); scen.push([l, st.min, st.minDate, st.firstBelowDate || 'لا يوجد', st.b30, st.b90]); }
  for (const sc of S.scenarios) { const st = C.seriesStats(C.runScenario(S, sc, 'base'), gid); scen.push([sc.name, st.min, st.minDate, st.firstBelowDate || 'لا يوجد', st.b30, st.b90]); }
  const plans = [['الخطة', 'NPV', 'أقل رصيد متحفظ', 'تاريخه', 'العجز', 'المطلوب الآن', 'أقصى مربوط', 'الاسترداد (شهر)', 'الإجراءات']];
  const D = UI.decide || C.decide(S, {});
  for (const [k, l] of [['profit', 'تعظيم الربحية'], ['liquidity', 'تعظيم السيولة'], ['balanced', 'متوازن']]) { const r = D.best[k]; if (r) plans.push([l, r.npv, r.minCons, r.minConsDate, r.deficit, r.upfront, r.tied, r.paybackMonths, r.actions.map(a => a.label).join('، ') || 'الوضع الحالي']); }
  plans.push([]); plans.push(['سقف الاستثمار الآمن', 'موعد البدء', 'متحفظ', 'أساسي']); D.caps.forEach(c => plans.push(['', c.date, c.lumpCapCons, c.lumpCapBase]));
  const pos = [['البند', 'شخصي', 'النشاط', 'مجمّع']]; const pk = ['personal', 'business', 'consolidated']; const g = (x, f) => P[x] ? f(P[x]) : '';
  [['السيولة الفورية', p => p.tiers.now], ['خلال 7 أيام', p => p.tiers.cum7], ['خلال 30 يوم', p => p.tiers.cum30], ['خلال 90 يوم', p => p.tiers.cum90], ['صافي الثروة', p => p.netWorth], ['التزامات 30 يوم', p => p.obl30], ['التزامات 90 يوم', p => p.obl90], ['التزامات 365 يوم', p => p.obl365]].forEach(([l, f]) => pos.push([l].concat(pk.map(x => g(x, f)))));
  xlsxBook([['المدخلات', inputs], ['السيولة والأصول', pos.concat([[]]).concat(liq)], ['العيادات', clinics], ['المزرعة', farm], ['الالتزامات', liab], ['الفرص الجديدة', opps], ['التدفق النقدي', cf], ['السيناريوهات', scen], ['مقارنة الخطط', plans]], 'التحليل_المالي_' + T + '.xlsx');
}
async function exportPDF(sel, name) {
  const el = $(sel); if (!el) return;
  try { await Promise.all([loadScript(LIB.h2c), loadScript(LIB.jspdf)]); } catch (e) { return toast('تصدير PDF يحتاج اتصالًا لأول مرة', 'err'); }
  toast('جارٍ تجهيز PDF…');
  const wrap = document.createElement('div'); wrap.className = 'pdf-wrap'; wrap.innerHTML = '<div class="pdf-head"><b>Smart Care | ' + esc(name) + '</b><span>' + C.nowStamp() + ' • ' + esc(U.name) + (WS === 'demo' ? ' • بيانات تجريبية' : '') + '</span></div>' + el.innerHTML; document.body.appendChild(wrap);
  wrap.querySelectorAll('canvas').forEach((c, i) => { const src = el.querySelectorAll('canvas')[i]; if (src) { const img = document.createElement('img'); img.src = src.toDataURL(); img.style.width = '100%'; c.replaceWith(img); } });
  try {
    const canvas = await html2canvas(wrap, { scale: 2, backgroundColor: '#ffffff' });
    const { jsPDF } = window.jspdf; const pdf = new jsPDF({ unit: 'pt', format: 'a4' }); const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
    const ratio = W / canvas.width; const pageH = H / ratio; let y = 0, page = 0;
    while (y < canvas.height) { const part = document.createElement('canvas'); part.width = canvas.width; part.height = Math.min(pageH, canvas.height - y); part.getContext('2d').drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height); if (page) pdf.addPage(); pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, part.height * ratio); y += pageH; page++; }
    const ok = await ST.download(name + '_' + C.today() + '.pdf', pdf.output('blob')); toast(ok ? 'تم تجهيز PDF' : 'تعذر التنزيل', ok ? 'ok' : 'err');
  } finally { wrap.remove(); }
}
/* ---------- النسخ الاحتياطي ---------- */
async function doBackup(pass) {
  await save(); await ST.flush();
  const chunks = {}; for (const k in ST.cache) if (k.startsWith(WS + '|') && ST.cache[k] != null) chunks[k.slice(WS.length + 1)] = ST.cache[k];
  const plain = JSON.stringify({ app: 'smartcare-finance', version: APP_VERSION, ws: WS, createdAt: C.nowStamp(), createdBy: U.name, chunks });
  const sha = await CR.sha256(plain); const salt = CR.newSalt(); const key = await CR.key(pass, salt);
  const file = JSON.stringify({ format: 'scfbackup', v: 1, ws: WS, createdAt: C.nowStamp(), salt, sha256: sha, data: await CR.encrypt(key, plain) });
  const ok = await ST.download('smartcare-' + WS + '-' + C.today() + '.scfbackup', new Blob([file], { type: 'application/json' }));
  C.audit(S, U, 'export', 'backup', WS, null, { sha256: sha }); commitQuiet();
  toast(ok ? 'تم تصدير النسخة — البصمة ' + sha.slice(0, 12) : 'تعذر التنزيل', ok ? 'ok' : 'err');
}
async function previewRestore(file, pass) {
  if (!file) return;
  try {
    const o = JSON.parse(await file.text()); if (o.format !== 'scfbackup') throw new Error('ملف غير صالح');
    const plain = await CR.decrypt(await CR.key(pass, o.salt), o.data);
    const sha = await CR.sha256(plain); if (sha !== o.sha256) throw new Error('البصمة لا تطابق — الملف تالف أو معدّل');
    const B = JSON.parse(plain); const ops = JSON.parse(B.chunks.ops);
    const ntx = Object.keys(B.chunks).filter(k => k.startsWith('tx-')).reduce((s, k) => s + JSON.parse(B.chunks[k]).length, 0);
    $('#restorePreview').innerHTML = '<div class="alert ok">النسخة سليمة ✓ البصمة مطابقة (' + sha.slice(0, 16) + '…)</div><table class="t"><tbody><tr><td>المساحة</td><td>' + (B.ws === 'demo' ? 'تجريبية' : 'فعلية') + '</td></tr><tr><td>تاريخ النسخة</td><td>' + esc(B.createdAt) + ' بواسطة ' + esc(B.createdBy) + '</td></tr><tr><td>الجهات</td><td>' + ops.entities.length + '</td></tr><tr><td>الحسابات</td><td>' + ops.accounts.length + '</td></tr><tr><td>الحركات (بدون الشخصية)</td><td>' + ntx + '</td></tr><tr><td>الإقفالات</td><td>' + ops.closings.length + '</td></tr><tr><td>الخزنة الشخصية</td><td>' + (B.chunks.vault ? 'موجودة (مشفرة بكلمة مرور المالك وقت النسخ)' : 'غير موجودة') + '</td></tr></tbody></table><button class="btn danger" id="doRestore">استبدال بيانات المساحة «' + (B.ws === 'demo' ? 'التجريبية' : 'الفعلية') + '» بهذه النسخة</button>';
    $('#doRestore').onclick = async () => { if (!confirmInline('restore', 'اضغط مرة أخرى للتأكيد — سيتم استبدال البيانات الحالية')) return; await ST.wipe(B.ws); for (const k in B.chunks) await ST.put(B.ws, k, B.chunks[k]); await ST.flush(); setWs(B.ws); toast('تمت الاستعادة — سجّل الدخول مرة أخرى', 'ok'); U = null; await loadWorkspace(B.ws); C.audit(S, null, 'restore', 'backup', B.ws, null, { sha256: sha }); loginScreen(); };
  } catch (e) { $('#restorePreview').innerHTML = '<div class="alert bad">' + esc(e.message === 'The operation failed for operation-specific reason' || /decrypt|operation/i.test(e.message) ? 'كلمة مرور النسخة غير صحيحة' : e.message) + '</div>'; }
}

/* ---------- PWA ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.claude && document.querySelector('link[rel=manifest]')) { navigator.serviceWorker.register('sw.js').catch(() => { /* غير متاح */ }); }
window.__SCF = { get S() { return S; }, get U() { return U; }, ACT, FORMS, go, C };
boot();
})();
