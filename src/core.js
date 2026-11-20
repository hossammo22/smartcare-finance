/* Smart Care | الإدارة المالية والسيولة — محرك الحسابات (بدون واجهة) */
(function (root) {
'use strict';

/* ============ أدوات التاريخ (توقيت القاهرة) ============ */
const TZ = 'Africa/Cairo';
let TODAY_OVERRIDE = null;
function cairoParts(d) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const p = {}; f.formatToParts(d || new Date()).forEach(x => { p[x.type] = x.value; });
  if (p.hour === '24') p.hour = '00';
  return p;
}
function today() { if (TODAY_OVERRIDE) return TODAY_OVERRIDE; const p = cairoParts(); return p.year + '-' + p.month + '-' + p.day; }
function nowStamp() { const p = cairoParts(); return today() + ' ' + p.hour + ':' + p.minute; }
function setToday(d) { TODAY_OVERRIDE = d; }
const toD = s => new Date(s + 'T00:00:00Z');
const fromD = d => d.toISOString().slice(0, 10);
function addDays(s, n) { const d = toD(s); d.setUTCDate(d.getUTCDate() + n); return fromD(d); }
function diffDays(a, b) { return Math.round((toD(b) - toD(a)) / 864e5); }
function addMonths(s, n) {
  const d = toD(s); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return fromD(d);
}
const monthStart = s => s.slice(0, 8) + '01';
function monthEnd(s) { const d = toD(monthStart(s)); return fromD(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))); }
const r2 = x => Math.round((+x || 0) * 100) / 100;
function uid(p) {
  const c = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  return (p ? p + '_' : '') + c.replace(/-/g, '').slice(0, 16);
}
const clone = o => JSON.parse(JSON.stringify(o));

/* ============ الحالة الافتراضية ============ */
const METHOD_KINDS = { cash: 'نقدي', wallet: 'محفظة', instapay: 'إنستاباي', pos: 'ماكينة POS', bank: 'تحويل بنكي', other: 'أخرى' };
const ACCOUNT_TYPES = { cash: 'خزنة', wallet: 'محفظة إلكترونية', bank: 'حساب بنكي', pos: 'ماكينة POS (قيد التسوية)' };
const FIN_IN = ['owner_funding', 'loan_in', 'capital_in', 'asset_sale', 'other_in'];
const FIN_OUT = ['owner_drawing', 'loan_out', 'asset_purchase', 'other_out'];
const FIN_LABELS = { owner_funding: 'تمويل من المالك', loan_in: 'قرض مستلم', capital_in: 'زيادة رأس مال', asset_sale: 'بيع أصل', other_in: 'تمويل وارد آخر', owner_drawing: 'سحوبات شخصية للمالك', loan_out: 'سداد/إقراض', asset_purchase: 'شراء أصل رأسمالي', other_out: 'تمويل صادر آخر' };
const KIND_LABELS = { income: 'إيراد', expense: 'مصروف', refund: 'استرداد للمريض', transfer: 'تحويل بين حسابات', settlement: 'تسوية POS', claim_payment: 'تحصيل مطالبة/آجل', payable_payment: 'سداد مستحق', liability_payment: 'قسط التزام', financing: 'حركة تمويلية' };
const ROLES = { owner: 'المالك', manager: 'مدير فرع', accountant: 'محاسب', cashier: 'استقبال / كاشير' };
const ASSET_TYPES = { cash: 'نقدية خارج الحسابات', deposit: 'وديعة / شهادة', gold: 'ذهب', silver: 'فضة', fx: 'عملة أجنبية', stock: 'أسهم', fund: 'صناديق استثمار', broker_cash: 'سيولة لدى السمسرة', realestate: 'عقار', land: 'أرض', farm: 'مزرعة', loan_to_company: 'قرض للشركة (داخلي)', other: 'أخرى' };
const BASIS = { actual: 'فعلي', estimate: 'تقديري', assumption: 'افتراض للاختبار' };

function defaultCategories() {
  return {
    income: ['كشف', 'أسنان', 'تقويم', 'جلدية', 'أشعة', 'تحاليل', 'تأمين / شركات', 'أخرى'].map(n => ({ id: uid('ci'), name: n })),
    expense: ['رواتب', 'نسب الأطباء', 'إيجار', 'معمل', 'مستلزمات', 'إعلانات', 'صيانة', 'ضرائب', 'أقساط', 'مرافق', 'رسوم ماكينة/تحويل', 'أخرى'].map(n => ({ id: uid('ce'), name: n }))
  };
}
function emptyState(ws) {
  const cats = defaultCategories();
  return {
    meta: { version: 1, workspace: ws || 'real', createdAt: nowStamp() },
    settings: {
      currency: 'EGP', discountRate: 0.22, discountBasis: 'assumption', cashYield: 0.18,
      reserve: { ops: 0, owner: 0, branchDefault: 0, byEntity: {} },
      transfers: { ownerCoversCompany: true, poolBranches: true, monthlyDrawing: 0, maxOwnerFunding: 0 },
      financingLimit: 0, ownerHoursPerWeek: 10,
      scen: {
        conservative: { collectionMult: 0.93, expenseMult: 1.05, claimDelayDays: 30, fxMult: 0.95, assetMult: 0.9, projectDelayMonths: 3, projectRevenueMult: 0.8 },
        base: { collectionMult: 1, expenseMult: 1, claimDelayDays: 0, fxMult: 1, assetMult: 1, projectDelayMonths: 0, projectRevenueMult: 1 },
        optimistic: { collectionMult: 1.08, expenseMult: 0.97, claimDelayDays: 0, fxMult: 1.03, assetMult: 1.05, projectDelayMonths: 0, projectRevenueMult: 1.1 }
      },
      historyDays: 90
    },
    entities: [
      { id: 'admin', name: 'الإدارة العامة (Smart Care)', type: 'admin', active: true, assume: { mode: 'auto', monthlyIn: 0, monthlyOut: 0, monthlyNewClaims: 0, claimLagDays: 60 }, depreciationMonthly: 0 },
      { id: 'owner', name: 'المالك (شخصي)', type: 'owner', active: true, assume: { mode: 'manual', monthlyIn: 0, monthlyOut: 0, monthlyNewClaims: 0, claimLagDays: 0 }, depreciationMonthly: 0 }
    ],
    methods: [
      { id: 'm_cash', name: 'نقدي', kind: 'cash', active: true },
      { id: 'm_vf', name: 'فودافون كاش', kind: 'wallet', active: true },
      { id: 'm_ip', name: 'إنستاباي', kind: 'instapay', active: true },
      { id: 'm_pos', name: 'ماكينة POS', kind: 'pos', active: true },
      { id: 'm_bank', name: 'تحويل بنكي', kind: 'bank', active: true }
    ],
    accounts: [], categories: cats, users: [],
    txns: [], claims: [], payables: [], closings: [],
    assets: [], liabilities: [], projects: [], scenarios: [],
    audit: [], imports: []
  };
}

/* ============ الصلاحيات ============ */
const PERMS = {
  owner: ['view', 'record', 'review', 'export', 'close', 'reopen', 'settings', 'vault', 'users', 'import', 'forecast', 'scenario', 'decide', 'audit'],
  manager: ['view', 'record', 'review', 'export', 'forecast'],
  accountant: ['view', 'record', 'review', 'export', 'import', 'forecast'],
  cashier: ['record', 'viewToday']
};
function userCan(user, perm) {
  if (!user) return false;
  if (perm === 'close' && user.role === 'manager' && user.approveClose) return true;
  return (PERMS[user.role] || []).includes(perm);
}
function visibleEntityIds(S, user) {
  if (!user) return [];
  if (user.role === 'owner') return S.entities.map(e => e.id).filter(id => id !== 'owner' || S._vaultOpen);
  return (user.entityIds || []).filter(id => id !== 'owner');
}
function canSeeEntity(S, user, id) { return visibleEntityIds(S, user).includes(id); }

/* ============ سجل التدقيق ============ */
function audit(S, user, action, type, id, before, after, note) {
  S.audit.push({ id: uid('au'), at: nowStamp(), userId: user ? user.id : 'system', userName: user ? user.name : 'النظام', action, type, recordId: id, before: before === undefined ? null : before, after: after === undefined ? null : after, note: note || '' });
}

/* ============ الحسابات والأرصدة ============ */
function acc(S, id) { return S.accounts.find(a => a.id === id); }
function ent(S, id) { return S.entities.find(e => e.id === id); }
function txnEffects(t) {
  if (!t || t.voided) return [];
  const L = (sign, flow) => (t.lines || []).map(l => ({ accountId: l.accountId, methodId: l.methodId, amount: sign * (+l.amount || 0), flow }));
  switch (t.kind) {
    case 'income': case 'claim_payment': return L(1, 'in');
    case 'expense': case 'payable_payment': case 'refund': case 'liability_payment': return L(-1, 'out');
    case 'financing': return FIN_IN.includes(t.sub) ? L(1, 'in') : L(-1, 'out');
    case 'transfer': case 'settlement':
      return [{ accountId: t.fromAccountId, methodId: null, amount: -(+t.amount || 0), flow: 'tout' }, { accountId: t.toAccountId, methodId: null, amount: +t.amount || 0, flow: 'tin' }];
    default: return [];
  }
}
function accountLedger(S, accountId, asOf) {
  if (!asOf && S._rev != null) {
    if (!S._lc || S._lc.rev !== S._rev) S._lc = { rev: S._rev, m: {} };
    if (S._lc.m[accountId]) return S._lc.m[accountId];
    const v = accountLedgerRaw(S, accountId); S._lc.m[accountId] = v; return v;
  }
  return accountLedgerRaw(S, accountId, asOf);
}
function accountLedgerRaw(S, accountId, asOf) {
  const a = acc(S, accountId);
  const res = { opening: +(a && a.opening) || 0, openingDate: (a && a.openingDate) || '0000-01-01', in: 0, out: 0, tin: 0, tout: 0, book: 0, verified: a && a.verified ? a.verified : null, approved: 0, sinceVerified: 0 };
  for (const t of S.txns) {
    if (t.voided) continue;
    if (t.date < res.openingDate) continue;
    if (asOf && t.date > asOf) continue;
    for (const e of txnEffects(t)) {
      if (e.accountId !== accountId) continue;
      res[e.flow] += e.amount;
      if (res.verified && t.date > res.verified.date) res.sinceVerified += e.amount;
    }
  }
  res.book = r2(res.opening + res.in + res.out + res.tin + res.tout);
  res.approved = res.verified ? r2(+res.verified.amount + res.sinceVerified) : res.book;
  return res;
}
function entityCash(S, entityId) {
  let cash = 0, pending = 0;
  for (const a of S.accounts) {
    if (a.entityId !== entityId || a.active === false) continue;
    const b = accountLedger(S, a.id).approved;
    if (a.type === 'pos') pending += b; else cash += b;
  }
  return { cash: r2(cash), posPending: r2(pending) };
}
function posPendingList(S, entityIds) {
  const out = [];
  for (const a of S.accounts) {
    if (a.type !== 'pos' || (entityIds && !entityIds.includes(a.entityId))) continue;
    const bal = accountLedger(S, a.id).approved;
    if (Math.abs(bal) < 0.005) continue;
    const items = S.txns.filter(t => !t.voided && (t.kind === 'income' || t.kind === 'claim_payment') && t.lines.some(l => l.accountId === a.id)).slice(-30);
    out.push({ account: a, pending: bal, items });
  }
  return out;
}

/* ============ المطالبات والمستحقات والالتزامات ============ */
function linkedPaid(S, linkId, kind) {
  let s = 0;
  for (const t of S.txns) if (!t.voided && t.linkId === linkId && t.kind === kind) for (const l of t.lines) s += +l.amount || 0;
  return r2(s);
}
function claimStatus(S, c) { const paid = linkedPaid(S, c.id, 'claim_payment'); return { paid, outstanding: r2(c.amount - paid) }; }
function payableStatus(S, p) { const paid = linkedPaid(S, p.id, 'payable_payment'); return { paid, outstanding: r2(p.amount - paid) }; }
function fx(o) { return (!o.currency || o.currency === 'EGP') ? 1 : (+o.fxRate || 0); }
function liabilitySchedule(S, L) {
  const pays = S.txns.filter(t => !t.voided && t.kind === 'liability_payment' && t.linkId === L.id && t.date >= (L.balanceDate || '0000'));
  let paidCount = 0, principalPaid = 0;
  for (const t of pays) { const amt = t.lines.reduce((s, l) => s + (+l.amount || 0), 0); paidCount += amt >= 0 ? 1 : -1; principalPaid += +t.principal || 0; }
  const rate = fx(L);
  const sched = [];
  const n = Math.max(0, (+L.count || 0) - paidCount);
  for (let i = 0; i < n; i++) {
    const idx = paidCount + i;
    const due = addMonths(L.firstDueDate || today(), idx * (+L.frequencyMonths || 1));
    sched.push({ due, amountOrig: +L.installment || 0, amount: r2((+L.installment || 0) * rate), idx });
  }
  const outstandingOrig = Math.max(0, (+L.principal || 0) - principalPaid);
  return { paidCount, schedule: sched, outstandingOrig, outstanding: r2(outstandingOrig * rate), rate };
}
function splitInstallment(L, outstandingOrig) {
  const i = (+L.interestRate || 0) / 100 / 12 * (+L.frequencyMonths || 1);
  const interest = Math.min(+L.installment || 0, outstandingOrig * i);
  return { interest: r2(interest), principal: r2((+L.installment || 0) - interest) };
}

/* ============ تسجيل الحركات ============ */
function closingFor(S, entityId, date) { return S.closings.find(c => c.entityId === entityId && c.date === date && c.status === 'closed'); }
function isDayLocked(S, entityId, date) { return !!closingFor(S, entityId, date); }
function lineTotal(t) { return r2((t.lines || []).reduce((s, l) => s + (+l.amount || 0), 0)); }
function validateTxn(S, t, user) {
  const errs = [];
  if (!t.date) errs.push('التاريخ مطلوب');
  if (!t.entityId) errs.push('الجهة (الفرع/الإدارة/المالك) مطلوبة');
  if (user && !userCan(user, 'record')) errs.push('ليس لديك صلاحية التسجيل');
  if (user && t.entityId && !canSeeEntity(S, user, t.entityId)) errs.push('ليس لديك صلاحية على هذه الجهة');
  if (t.kind === 'transfer' || t.kind === 'settlement') {
    if (!t.fromAccountId || !t.toAccountId) errs.push('حدد الحسابين');
    if (t.fromAccountId === t.toAccountId) errs.push('الحسابان متطابقان');
    if (!(+t.amount > 0) && !t.reversalOf) errs.push('المبلغ يجب أن يكون أكبر من صفر');
  } else {
    if (!t.lines || !t.lines.length) errs.push('أضف طريقة دفع واحدة على الأقل');
    for (const l of t.lines || []) { if (!l.accountId) errs.push('كل سطر يحتاج حسابًا'); if (!l.methodId) errs.push('كل سطر يحتاج طريقة دفع'); if (!(+l.amount) ) errs.push('مبلغ غير صالح'); }
  }
  if (isDayLocked(S, t.entityId, t.date) && !t.reversalOf && !t._allowLocked) errs.push('هذا اليوم مقفل لهذه الجهة؛ استخدم قيد تصحيح بتاريخ اليوم أو اطلب إعادة فتح من المالك');
  return errs;
}
/** إضافة حركة مع منع التكرار: نفس المعرف لا يُسجل مرتين */
function addTxn(S, t, user) {
  if (S.txns.some(x => x.id === t.id)) return { ok: true, dup: true, txn: S.txns.find(x => x.id === t.id) };
  const errs = validateTxn(S, t, user);
  if (errs.length) return { ok: false, errors: errs };
  const rec = Object.assign({ id: t.id || uid('t'), createdAt: nowStamp(), userId: user ? user.id : 'system', userName: user ? user.name : 'النظام', sync: 'saved' }, t);
  delete rec._allowLocked;
  if (rec.lines) rec.lines = rec.lines.map(l => ({ methodId: l.methodId, accountId: l.accountId, amount: r2(l.amount) }));
  S.txns.push(rec);
  audit(S, user, 'create', 'txn', rec.id, null, summarizeTxn(rec));
  return { ok: true, txn: rec };
}
function summarizeTxn(t) { return { kind: t.kind, date: t.date, entityId: t.entityId, amount: t.amount || lineTotal(t), lines: t.lines, note: t.note || '' }; }
function addTransfer(S, { id, date, time, entityId, fromAccountId, toAccountId, amount, fee, feeMethodId, note, ref, finSub }, user) {
  const tr = { id: id || uid('t'), kind: 'transfer', date, time, entityId, fromAccountId, toAccountId, amount: r2(amount), note, ref, finSub: finSub || null };
  const r = addTxn(S, tr, user); if (!r.ok || r.dup) return r;
  if (+fee > 0) {
    const feeCat = (S.categories.expense.find(c => /رسوم/.test(c.name)) || S.categories.expense[0]).id;
    const from = acc(S, fromAccountId);
    addTxn(S, { id: tr.id + '_fee', kind: 'expense', date, time, entityId, categoryId: feeCat, lines: [{ methodId: feeMethodId || defaultMethodFor(S, from), accountId: fromAccountId, amount: r2(fee) }], linkId: tr.id, note: 'رسوم تحويل' }, user);
  }
  return r;
}
function defaultMethodFor(S, a) {
  if (!a) return S.methods[0].id;
  const map = { cash: 'cash', wallet: 'wallet', bank: 'bank', pos: 'pos' };
  const m = S.methods.find(m => m.kind === map[a.type]); return (m || S.methods[0]).id;
}
/** تسوية POS: المبلغ الإجمالي يغادر حساب الماكينة، الصافي يدخل البنك، الرسوم مصروف — دون إيراد جديد */
function settlePOS(S, { id, date, entityId, posAccountId, bankAccountId, gross, fee, note, ref }, user) {
  const net = r2(gross - (fee || 0));
  const sid = id || uid('t');
  if (S.txns.some(x => x.id === sid)) return { ok: true, dup: true };
  const r = addTxn(S, { id: sid, kind: 'settlement', date, entityId, fromAccountId: posAccountId, toAccountId: bankAccountId, amount: net, gross: r2(gross), fee: r2(fee || 0), note, ref }, user);
  if (!r.ok) return r;
  if (+fee > 0) {
    const feeCat = (S.categories.expense.find(c => /رسوم/.test(c.name)) || S.categories.expense[0]).id;
    const posM = (S.methods.find(m => m.kind === 'pos') || S.methods[0]).id;
    addTxn(S, { id: sid + '_fee', kind: 'expense', date, entityId, categoryId: feeCat, lines: [{ methodId: posM, accountId: posAccountId, amount: r2(fee) }], linkId: sid, note: 'رسوم ماكينة POS' }, user);
  }
  return r;
}
/** قيد تصحيح: يعكس الحركة الأصلية بتاريخ اليوم ويحافظ على أثر المراجعة */
function reverseTxn(S, id, user, reason, date) {
  const t = S.txns.find(x => x.id === id);
  if (!t) return { ok: false, errors: ['الحركة غير موجودة'] };
  if (t.reversedBy) return { ok: false, errors: ['تم عكس هذه الحركة من قبل'] };
  const rev = clone(t);
  rev.id = id + '_rev'; rev.reversalOf = id; rev.date = date || today(); rev.note = 'قيد تصحيح: ' + (reason || '');
  delete rev.reversedBy; delete rev.createdAt; delete rev.sync;
  if (rev.kind === 'transfer' || rev.kind === 'settlement') { const f = rev.fromAccountId; rev.fromAccountId = rev.toAccountId; rev.toAccountId = f; }
  else rev.lines = rev.lines.map(l => Object.assign({}, l, { amount: -l.amount }));
  if (rev.principal) rev.principal = -rev.principal; if (rev.interest) rev.interest = -rev.interest;
  const r = addTxn(S, rev, user);
  if (r.ok) { t.reversedBy = rev.id; audit(S, user, 'reverse', 'txn', id, summarizeTxn(t), summarizeTxn(rev), reason); }
  const fee = S.txns.find(x => x.id === id + '_fee' && !x.reversedBy);
  if (r.ok && fee) reverseTxn(S, fee.id, user, reason, date);
  return r;
}
function voidBatch(S, batchId, user, reason) {
  let n = 0;
  for (const t of S.txns) if (t.batchId === batchId && !t.voided) { t.voided = true; n++; audit(S, user, 'void', 'txn', t.id, summarizeTxn(t), null, 'إلغاء دفعة استيراد: ' + (reason || '')); }
  for (const coll of ['liabilities', 'claims', 'payables']) for (const x of S[coll]) if (x.batchId === batchId && !x.voided) { x.voided = true; n++; }
  const imp = S.imports.find(i => i.id === batchId); if (imp) { imp.reverted = true; imp.revertedAt = nowStamp(); imp.revertedBy = user && user.name; }
  return n;
}

/* ============ الإقفال اليومي ============ */
function daySummary(S, entityId, date) {
  const txns = S.txns.filter(t => !t.voided && t.entityId === entityId && t.date === date);
  const table = methodTable(S, { entityIds: [entityId], from: date, to: date });
  const cashAccounts = S.accounts.filter(a => a.entityId === entityId && a.active !== false);
  const expected = cashAccounts.map(a => ({ account: a, expected: accountLedger(S, a.id, date).book }));
  return { count: txns.length, table, expected, posPending: posPendingList(S, [entityId]) };
}
function closeDay(S, { entityId, date, counted, recon, note }, user) {
  if (!userCan(user, 'close')) return { ok: false, errors: ['اعتماد الإقفال يحتاج صلاحية من المالك'] };
  if (closingFor(S, entityId, date)) return { ok: false, errors: ['اليوم مقفل بالفعل'] };
  const sum = daySummary(S, entityId, date);
  const c = { id: uid('cl'), entityId, date, by: user.name, byId: user.id, at: nowStamp(), status: 'closed', totals: sum.table.total, count: sum.count, counted: {}, note: note || '' };
  for (const e of sum.expected) {
    const k = e.account.id; const cnt = counted && counted[k] && counted[k].amount !== '' && counted[k].amount != null ? +counted[k].amount : null;
    c.counted[k] = { expected: e.expected, counted: cnt, diff: cnt == null ? null : r2(cnt - e.expected), reason: counted && counted[k] ? counted[k].reason || '' : '' };
    if (cnt != null && e.account.type !== 'pos') { const a = acc(S, k); a.verified = { amount: cnt, date, by: user.name }; }
  }
  if (recon) c.recon = recon;
  S.closings.push(c);
  audit(S, user, 'close', 'day', c.id, null, { entityId, date, totals: c.totals });
  return { ok: true, closing: c };
}
function reopenDay(S, closingId, user, reason) {
  if (!userCan(user, 'reopen')) return { ok: false, errors: ['إعادة الفتح للمالك فقط'] };
  const c = S.closings.find(x => x.id === closingId); if (!c) return { ok: false, errors: ['غير موجود'] };
  c.status = 'reopened'; c.reopenedBy = user.name; c.reopenedAt = nowStamp(); c.reopenReason = reason || '';
  audit(S, user, 'reopen', 'day', c.id, { status: 'closed' }, { status: 'reopened' }, reason);
  return { ok: true };
}

/* ============ جدول طرق الدفع والربحية ============ */
function inRange(t, f) { return (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to); }
function methodTable(S, f) {
  const rows = {}; const fin = { in: 0, out: 0, transfers: 0 };
  const ensure = m => rows[m] || (rows[m] = { methodId: m, rev: 0, exp: 0, ref: 0, net: 0 });
  for (const t of S.txns) {
    if (t.voided || !inRange(t, f)) continue;
    if (f.entityIds && !f.entityIds.includes(t.entityId)) continue;
    if (f.categoryId && t.categoryId !== f.categoryId) continue;
    if (t.kind === 'transfer' || t.kind === 'settlement') { fin.transfers += +t.amount || 0; continue; }
    if (t.kind === 'financing') { const s = lineTotal(t); if (FIN_IN.includes(t.sub)) fin.in += s; else fin.out += s; continue; }
    for (const l of t.lines || []) {
      if (f.methodId && l.methodId !== f.methodId) continue;
      if (f.accountId && l.accountId !== f.accountId) continue;
      const r = ensure(l.methodId); const a = +l.amount || 0;
      if (t.kind === 'income' || t.kind === 'claim_payment') r.rev += a;
      else if (t.kind === 'refund') r.ref += a;
      else r.exp += a;
    }
  }
  const list = S.methods.map(m => rows[m.id] || { methodId: m.id, rev: 0, exp: 0, ref: 0, net: 0 }).concat(Object.values(rows).filter(r => !S.methods.find(m => m.id === r.methodId)));
  const total = { rev: 0, exp: 0, ref: 0, net: 0 };
  for (const r of list) { r.rev = r2(r.rev); r.exp = r2(r.exp); r.ref = r2(r.ref); r.net = r2(r.rev - r.exp - r.ref); total.rev += r.rev; total.exp += r.exp; total.ref += r.ref; }
  total.rev = r2(total.rev); total.exp = r2(total.exp); total.ref = r2(total.ref); total.net = r2(total.rev - total.exp - total.ref);
  return { rows: list, total, fin };
}
/** ربح التشغيل (أساس الاستحقاق) مقابل التدفق النقدي — مع بنود المصالحة */
function pnl(S, entityIds, from, to) {
  const res = { revenueCash: 0, claimsAccrued: 0, refunds: 0, opexCash: 0, payablesAccrued: 0, interest: 0, principal: 0, depreciation: 0, claimCollected: 0, payablePaid: 0, liabilityPaid: 0, finIn: 0, finOut: 0, byCategory: {} };
  for (const t of S.txns) {
    if (t.voided || !inRange(t, { from, to }) || !entityIds.includes(t.entityId)) continue;
    const s = lineTotal(t);
    switch (t.kind) {
      case 'income': res.revenueCash += s; res.byCategory[t.categoryId] = (res.byCategory[t.categoryId] || 0) + s; break;
      case 'refund': res.refunds += s; break;
      case 'expense': res.opexCash += s; res.byCategory[t.categoryId] = (res.byCategory[t.categoryId] || 0) - s; break;
      case 'claim_payment': res.claimCollected += s; break;
      case 'payable_payment': res.payablePaid += s; break;
      case 'liability_payment': res.liabilityPaid += s; res.interest += +t.interest || 0; res.principal += (+t.principal || (s - (+t.interest || 0))); break;
      case 'financing': if (FIN_IN.includes(t.sub)) res.finIn += s; else res.finOut += s; break;
    }
  }
  for (const c of S.claims) if (!c.voided && entityIds.includes(c.entityId) && inRange(c, { from, to })) res.claimsAccrued += +c.amount || 0;
  for (const p of S.payables) if (!p.voided && entityIds.includes(p.entityId) && inRange(p, { from, to })) res.payablesAccrued += +p.amount || 0;
  const days = Math.max(1, diffDays(from, to) + 1);
  for (const id of entityIds) { const e = ent(S, id); if (e && e.depreciationMonthly) res.depreciation += e.depreciationMonthly * days / 30.4; }
  for (const k in res) if (typeof res[k] === 'number') res[k] = r2(res[k]);
  res.netRevenue = r2(res.revenueCash + res.claimsAccrued - res.refunds);
  res.opex = r2(res.opexCash + res.payablesAccrued);
  res.operatingProfit = r2(res.netRevenue - res.opex - res.depreciation);
  res.netProfit = r2(res.operatingProfit - res.interest);
  res.cashIn = r2(res.revenueCash + res.claimCollected);
  res.cashOut = r2(res.opexCash + res.payablePaid + res.liabilityPaid + res.refunds);
  res.operatingCash = r2(res.cashIn - res.cashOut);
  res.recon = [
    { label: 'ربح التشغيل', amount: res.operatingProfit },
    { label: '+ الإهلاك (مصروف غير نقدي)', amount: res.depreciation },
    { label: '− إيراد آجل/تأمين لم يُحصّل بعد (صافي)', amount: r2(res.claimCollected - res.claimsAccrued) },
    { label: '+ مصروفات مستحقة لم تُدفع بعد (صافي)', amount: r2(res.payablesAccrued - res.payablePaid) },
    { label: '− أقساط الالتزامات (أصل + فائدة)', amount: r2(-res.liabilityPaid) },
    { label: '= صافي النقد من التشغيل', amount: res.operatingCash }
  ];
  return res;
}

/* ============ الأصول والسيولة وصافي الثروة ============ */
function assetValues(a, mult) {
  const rate = fx(a) * (a.currency && a.currency !== 'EGP' ? (mult && mult.fx || 1) : 1);
  const am = (mult && mult.asset) || 1;
  const value = r2((+a.valueOrig || 0) * rate * am);
  let net = a.netSaleOrig !== '' && a.netSaleOrig != null && !isNaN(+a.netSaleOrig) && +a.netSaleOrig > 0 ? (+a.netSaleOrig) * rate * am : value * (1 - (+a.breakCostPct || 0) / 100);
  return { value, net: r2(net) };
}
function liquidityTiers(S, entityIds, mult) {
  const tiers = { now: 0, d7: 0, d30: 0, d90: 0, later: 0, pledged: 0, posPending: 0, cash: 0 };
  for (const id of entityIds) { const c = entityCash(S, id); tiers.cash += c.cash; tiers.posPending += c.posPending; }
  tiers.now = tiers.cash;
  const posRows = S.accounts.filter(a => a.type === 'pos' && entityIds.includes(a.entityId));
  let pos7 = 0; for (const a of posRows) { const b = accountLedger(S, a.id).approved * (1 - (+a.feePct || 0) / 100); if ((+a.settleDays || 1) <= 7) pos7 += b; else tiers.d30 += b; }
  tiers.d7 += pos7;
  const assetRows = [];
  if (entityIds.includes('owner')) for (const a of S.assets) {
    if (a.voided) continue;
    const v = assetValues(a, mult);
    if (a.pledged) { tiers.pledged += v.net; assetRows.push({ a, v, tier: 'pledged' }); continue; }
    const d = +a.liquidationDays || 0; let tier;
    if (a.type === 'loan_to_company') tier = 'internal';
    else if (d <= 0) { tiers.now += v.net; tier = 'now'; }
    else if (d <= 7) { tiers.d7 += v.net; tier = 'd7'; }
    else if (d <= 30) { tiers.d30 += v.net; tier = 'd30'; }
    else if (d <= 90) { tiers.d90 += v.net; tier = 'd90'; }
    else { tiers.later += v.net; tier = 'later'; }
    assetRows.push({ a, v, tier });
  }
  tiers.cum7 = r2(tiers.now + tiers.d7); tiers.cum30 = r2(tiers.cum7 + tiers.d30); tiers.cum90 = r2(tiers.cum30 + tiers.d90);
  for (const k in tiers) tiers[k] = r2(tiers[k]);
  return { tiers, assetRows };
}
function obligationsWithin(S, entityIds, days) {
  const T = today(), end = addDays(T, days); let total = 0; const items = [];
  for (const L of S.liabilities) {
    if (L.voided || !entityIds.includes(L.entityId)) continue;
    for (const s of liabilitySchedule(S, L).schedule) if (s.due <= end) { total += s.amount; items.push({ date: s.due < T ? T : s.due, overdue: s.due < T, label: L.name + ' — ' + (L.lender || ''), amount: s.amount, cls: L.class, ref: { type: 'liability', id: L.id } }); }
  }
  for (const p of S.payables) {
    if (p.voided || !entityIds.includes(p.entityId)) continue;
    const o = payableStatus(S, p).outstanding; if (o > 0.005 && p.dueDate <= end) { total += o; items.push({ date: p.dueDate < T ? T : p.dueDate, overdue: p.dueDate < T, label: p.payee + ' (مستحق)', amount: o, cls: p.class || 'mandatory', ref: { type: 'payable', id: p.id } }); }
  }
  items.sort((a, b) => a.date < b.date ? -1 : 1);
  return { total: r2(total), items };
}
function position(S, entityIds) {
  const lt = liquidityTiers(S, entityIds);
  let receivables = 0, payables = 0, liabilities = 0, internalAssets = 0, internalLiab = 0, assetsNet = 0;
  for (const c of S.claims) if (!c.voided && entityIds.includes(c.entityId)) receivables += Math.max(0, claimStatus(S, c).outstanding);
  for (const p of S.payables) if (!p.voided && entityIds.includes(p.entityId)) payables += Math.max(0, payableStatus(S, p).outstanding);
  for (const L of S.liabilities) if (!L.voided && entityIds.includes(L.entityId)) { const o = liabilitySchedule(S, L).outstanding; liabilities += o; if (L.internal) internalLiab += o; }
  for (const r of lt.assetRows) { assetsNet += r.v.net; if (r.a.type === 'loan_to_company') internalAssets += r.v.net; }
  const gross = lt.tiers.cash + lt.tiers.posPending + receivables + assetsNet;
  const res = {
    cash: lt.tiers.cash, posPending: lt.tiers.posPending, receivables: r2(receivables), assetsNet: r2(assetsNet), payables: r2(payables), liabilities: r2(liabilities),
    internalAssets: r2(internalAssets), internalLiab: r2(internalLiab), tiers: lt.tiers, assetRows: lt.assetRows,
    netWorth: r2(gross - payables - liabilities),
    obl30: obligationsWithin(S, entityIds, 30).total, obl90: obligationsWithin(S, entityIds, 90).total, obl365: obligationsWithin(S, entityIds, 365).total
  };
  return res;
}
/** مركز شخصي + مركز النشاط + مجمّع مع حذف المعاملات الداخلية */
function positions(S, user) {
  const vis = visibleEntityIds(S, user);
  const biz = vis.filter(id => id !== 'owner');
  const P = { business: position(S, biz) };
  if (vis.includes('owner')) {
    P.personal = position(S, ['owner']);
    const all = position(S, vis);
    const elim = Math.min(all.internalAssets, all.internalLiab) || Math.max(all.internalAssets, all.internalLiab);
    all.eliminated = r2(elim);
    all.netWorth = r2(all.netWorth - all.internalAssets + all.internalLiab);
    all.assetsNet = r2(all.assetsNet - all.internalAssets); all.liabilities = r2(all.liabilities - all.internalLiab);
    P.consolidated = all;
  }
  return P;
}

/* ============ مشاريع واستثمارات (تدفقات شهرية) ============ */
/** يرجع مصفوفة شهرية نسبية لموعد البدء: كل عنصر {m, out, in, label} */
function projectMonthly(p, o) {
  o = o || {};
  const scale = o.scale == null ? 1 : o.scale; const mode = o.mode || 'full';
  const revMult = (o.revenueMult == null ? 1 : o.revenueMult); const costMult = o.costMult == null ? 1 : o.costMult;
  const delay = o.revenueDelay || 0; const H = o.months || 120;
  const pilot = mode === 'pilot' ? (+p.pilotScale || 0.3) : 1;
  const phases = mode === 'phased' ? Math.max(2, +p.phases || 2) : 1;
  const phaseGap = +p.phaseGapMonths || 6;
  const arr = Array.from({ length: H }, (_, m) => ({ m, lump: 0, out: 0, in: 0 }));
  const k0 = scale * pilot * costMult / phases;
  for (let ph = 0; ph < phases; ph++) {
    const off = ph * phaseGap;
    for (const s of (p.setup || [])) { const m = off + (+s.monthOffset || 0); if (m < H) arr[m].lump += (+s.amount || 0) * k0; }
    if (+p.workingCapital && off < H) arr[off].lump += (+p.workingCapital) * k0;
    for (let m = off + (+p.opexStartOffset || 0); m < H; m++) arr[m].out += (+p.monthlyOpex || 0) * k0;
    const fr = off + (+p.firstRevenueOffset || 0) + delay + (+p.collectionLagMonths || 0); const ramp = Math.max(1, +p.rampMonths || 1);
    for (let m = fr; m < H; m++) {
      const k = Math.min(1, (m - fr + 1) / ramp);
      const season = p.seasonality && p.seasonality.length === 12 ? (+p.seasonality[m % 12] || 1) : 1;
      arr[m].in += (+p.steadyRevenue || 0) * k * season * scale * pilot / phases * revMult;
    }
  }
  return arr;
}
function projectStats(p, o) {
  const arr = projectMonthly(p, Object.assign({ months: 120 }, o));
  let cum = 0, minCum = 0, minM = 0, firstRev = -1, breakeven = -1, payback = -1, toFirst = 0;
  for (const x of arr) {
    const before = cum;
    cum += x.in - x.out - x.lump;
    if (cum < minCum) { minCum = cum; minM = x.m; }
    if (firstRev < 0 && x.in > 0) { firstRev = x.m; toFirst = -Math.min(0, before - x.out - x.lump); }
    if (breakeven < 0 && x.in > 0 && x.in >= x.out) breakeven = x.m;
    if (payback < 0 && minCum < 0 && cum >= 0) payback = x.m;
  }
  const initial = arr[0].lump;
  const monthlyNeed = (+p.monthlyOpex || 0);
  return { initial: r2(initial), fundingToFirstRevenue: r2(toFirst), maxTied: r2(-minCum), maxTiedMonth: minM, firstRevenueMonth: firstRev, cashBreakevenMonth: breakeven, paybackMonth: payback, breakevenMonthlySales: r2(monthlyNeed) };
}

/* ============ رادار السيولة: التوقع ============ */
function reserveFor(S, id) {
  const R = S.settings.reserve;
  if (R.byEntity && R.byEntity[id] != null && R.byEntity[id] !== '') return +R.byEntity[id];
  if (id === 'owner') return +R.owner || 0;
  const e = ent(S, id); if (e && e.type === 'admin') return 0;
  return +R.branchDefault || 0;
}
function historyPattern(S, entityId, histDays) {
  // نمط يومي من الحركات الفعلية مجمعة حسب صاحب الحساب (مكان النقد)
  const T = today(); const from = addDays(T, -histDays);
  let firstDate = null, inn = 0, out = 0;
  for (const t of S.txns) {
    if (t.voided || t.date < from || t.date >= T) continue;
    if (!['income', 'expense', 'refund'].includes(t.kind)) continue;
    if (t.linkId && t.kind === 'expense') continue; // رسوم ماكينة/تحويل مرتبطة: تُحتسب ضمن صافي POS
    for (const l of t.lines) {
      const a = acc(S, l.accountId); if (!a) continue;
      let ownerEnt = a.entityId, amt = +l.amount || 0;
      if (a.type === 'pos') { const b = acc(S, a.linkedBankId); ownerEnt = b ? b.entityId : a.entityId; if (t.kind === 'income') amt *= (1 - (+a.feePct || 0) / 100); }
      if (ownerEnt !== entityId) continue;
      if (!firstDate || t.date < firstDate) firstDate = t.date;
      if (t.kind === 'income') inn += amt; else out += amt;
    }
  }
  const span = firstDate ? Math.max(1, diffDays(firstDate, T)) : 0;
  return { days: span, dailyIn: span ? inn / span : 0, dailyOut: span ? out / span : 0 };
}
function forecast(S, opt) {
  opt = opt || {};
  const A = Object.assign({}, S.settings.scen.base, opt.assume || {});
  const T = today(); const H = opt.days || 730;
  const ids = S.entities.filter(e => e.active !== false && (e.id !== 'owner' || S._vaultOpen)).map(e => e.id);
  const E = {}; for (const id of ids) E[id] = { id, name: ent(S, id).name, open: 0, inA: new Float64Array(H), outA: new Float64Array(H), pattern: null };
  const events = [];
  const put = (id, d, amt, label, src, ref) => {
    if (!E[id] || d >= H) return; d = Math.max(0, d);
    if (amt >= 0) E[id].inA[d] += amt; else E[id].outA[d] += -amt;
    events.push({ d, date: addDays(T, d), entityId: id, amount: r2(amt), label, src, ref: ref || null });
  };
  // أرصدة الافتتاح (المعتمدة)
  for (const a of S.accounts) {
    if (a.active === false || !E[a.entityId]) continue;
    const b = accountLedger(S, a.id).approved;
    if (a.type === 'pos') {
      if (b > 0.005) { const bank = acc(S, a.linkedBankId); const tgt = bank ? bank.entityId : a.entityId; put(tgt, +a.settleDays || 1, b * (1 - (+a.feePct || 0) / 100), 'تسوية POS معلقة — ' + a.name, 'scheduled', { type: 'account', id: a.id }); }
    } else E[a.entityId].open += b;
  }
  // المطالبات والآجل
  for (const c of S.claims) {
    if (c.voided) continue; const o = claimStatus(S, c).outstanding; if (o <= 0.005) continue;
    const a = acc(S, c.collectAccountId); const tgt = a ? a.entityId : c.entityId;
    const base = c.expectedDate && c.expectedDate > T ? c.expectedDate : addDays(T, 7);
    put(tgt, diffDays(T, base) + (A.claimDelayDays || 0) + (c._extraDelay || 0), o, 'تحصيل متبقي مطالبة: ' + (c.payer || ''), 'scheduled', { type: 'claim', id: c.id });
  }
  // المستحقات
  for (const p of S.payables) {
    if (p.voided) continue; const o = payableStatus(S, p).outstanding; if (o <= 0.005) continue;
    const a = acc(S, p.payAccountId); const tgt = a ? a.entityId : p.entityId;
    const due = (p._deferDays ? addDays(p.dueDate, p._deferDays) : p.dueDate);
    put(tgt, Math.max(0, diffDays(T, due)), -o * A.expenseMult, 'مستحق: ' + (p.payee || ''), 'scheduled', { type: 'payable', id: p.id });
  }
  // الالتزامات
  for (const L of S.liabilities) {
    if (L.voided) continue; const a = acc(S, L.payAccountId); const tgt = a ? a.entityId : L.entityId;
    const sc = liabilitySchedule(S, L);
    const fxm = (L.currency && L.currency !== 'EGP') ? (1 / (A.fxMult || 1)) : 1;
    for (const s of sc.schedule) {
      let due = s.due; if (L._deferMonths && s.idx === sc.paidCount) due = addMonths(due, L._deferMonths);
      put(tgt, Math.max(0, diffDays(T, due)), -(s.amount * fxm + (L._deferMonths && s.idx === sc.paidCount ? s.amount * (+L.deferPenaltyPct || 0) / 100 : 0)), 'قسط: ' + L.name + (due < T ? ' (متأخر)' : ''), 'scheduled', { type: 'liability', id: L.id });
    }
  }
  // النمط التشغيلي
  for (const id of ids) {
    const e = ent(S, id); const as = e.assume || {};
    let dIn, dOut, src;
    const h = historyPattern(S, id, S.settings.historyDays || 90);
    if (as.mode === 'manual' || h.days < 14) { dIn = (+as.monthlyIn || 0) / 30.4; dOut = (+as.monthlyOut || 0) / 30.4; src = 'assumption'; }
    else { dIn = h.dailyIn; dOut = h.dailyOut; src = 'pattern'; }
    const mods = (opt.entityMods && opt.entityMods[id]) || {};
    const cin = dIn * A.collectionMult * (mods.collectionMult || 1); const cout = dOut * A.expenseMult * (mods.expenseMult || 1);
    for (let d = 0; d < H; d++) { E[id].inA[d] += cin; E[id].outA[d] += cout; }
    if (as.monthlyNewClaims) { const lag = (+as.claimLagDays || 60) + (A.claimDelayDays || 0); const v = (+as.monthlyNewClaims) / 30.4 * A.collectionMult; for (let d = lag; d < H; d++) E[id].inA[d] += v; }
    E[id].pattern = { src, dailyIn: r2(cin), dailyOut: r2(cout), histDays: h.days, monthlyIn: r2(cin * 30.4), monthlyOut: r2(cout * 30.4) };
  }
  // سحوبات المالك الدورية (تحويل داخلي)
  const dr = +S.settings.transfers.monthlyDrawing || 0;
  if (dr > 0 && E.admin) for (let m = 0; m < 24; m++) { const d = diffDays(T, addMonths(monthStart(T), m + 1)); put('admin', d, -dr, 'سحب المالك الشهري (داخلي)', 'scheduled', { type: 'internal' }); if (E.owner) put('owner', d, dr, 'سحب المالك الشهري (داخلي)', 'scheduled', { type: 'internal' }); }
  // المشاريع
  const projs = (opt.projects || S.projects.filter(p => !p.voided && p.status === 'active').map(p => ({ project: p, startDate: p.startDate || T, mode: 'full', scale: 1 })));
  for (const pj of projs) {
    const p = pj.project; const tgt = E[p.entityId] ? p.entityId : (E.owner ? 'owner' : 'admin');
    const start = pj.startDate || T;
    const arr = projectMonthly(p, { scale: pj.scale, mode: pj.mode, revenueMult: A.projectRevenueMult, costMult: A.expenseMult, revenueDelay: (A.projectDelayMonths || 0), months: 40 });
    let firstIn = false;
    for (const x of arr) {
      const d0 = diffDays(T, addMonths(start, x.m));
      if (d0 >= H) break;
      if (x.lump > 0) put(tgt, Math.max(0, d0), -x.lump, 'تأسيس/رأس مال عامل: ' + p.name, 'project', { type: 'project', id: p.id });
      const pin = x.in / 30, pout = x.out / 30;
      for (let k = 0; k < 30; k++) { const d = d0 + k; if (d < 0) continue; if (d >= H) break; E[tgt].inA[d] += pin; E[tgt].outA[d] += pout; }
      if (x.in > 0 && !firstIn) { firstIn = true; events.push({ d: Math.max(0, d0), date: addDays(T, Math.max(0, d0)), entityId: tgt, amount: r2(x.in), label: 'أول تحصيل متوقع: ' + p.name, src: 'project', ref: { type: 'project', id: p.id } }); }
    }
  }
  // أحداث إضافية (سيناريو/قرار)
  for (const ev of (opt.extraEvents || [])) put(E[ev.entityId] ? ev.entityId : (E.owner ? 'owner' : 'admin'), ev.d != null ? ev.d : diffDays(T, ev.date), ev.amount, ev.label, ev.src || 'scenario', ev.ref);
  // الأرصدة اليومية
  const groups = {};
  for (const id of ids) {
    const x = E[id]; const bal = new Float64Array(H); let b = x.open;
    for (let d = 0; d < H; d++) { b += x.inA[d] - x.outA[d]; bal[d] = b; }
    x.bal = bal; x.reserve = reserveFor(S, id);
  }
  const companyIds = ids.filter(id => id !== 'owner');
  const mk = (gid, name, members, reserve) => {
    const bal = new Float64Array(H), inA = new Float64Array(H), outA = new Float64Array(H); let open = 0;
    for (const id of members) { open += E[id].open; for (let d = 0; d < H; d++) { bal[d] += E[id].bal[d]; inA[d] += E[id].inA[d]; outA[d] += E[id].outA[d]; } }
    groups[gid] = { id: gid, name, open, bal, inA, outA, reserve, members };
  };
  const opsReserve = (+S.settings.reserve.ops || 0) || companyIds.reduce((s, id) => s + reserveFor(S, id), 0);
  mk('company', 'الشركة (الفروع + الإدارة)', companyIds, opsReserve);
  if (E.owner) mk('total', 'الإجمالي (الشركة + المالك)', ids, opsReserve + reserveFor(S, 'owner'));
  // إزالة التحويلات الداخلية من المجموع الكلي
  if (groups.total) for (const ev of events) if (ev.ref && ev.ref.type === 'internal') { /* متعادلة بين الجهتين */ }
  const series = Object.assign({}, E, groups);
  return { T, H, assume: A, entities: E, groups, series, events, ids, companyIds };
}
function seriesStats(fc, sid, horizonDays, reserveOverride) {
  const s = fc.series[sid]; const H = Math.min(fc.H, horizonDays || fc.H);
  const R = reserveOverride != null ? reserveOverride : s.reserve;
  let min = Infinity, minD = 0, firstBelow = -1, firstNeg = -1;
  for (let d = 0; d < H; d++) { const b = s.bal[d]; if (b < min) { min = b; minD = d; } if (firstBelow < 0 && b < R - 0.5) firstBelow = d; if (firstNeg < 0 && b < -0.5) firstNeg = d; }
  const at = d => r2(s.bal[Math.min(d, fc.H - 1)]);
  let gap = 0; if (firstBelow >= 0) gap = r2(R - min);
  const evs = fc.events.filter(e => (s.members ? s.members.includes(e.entityId) : e.entityId === sid) && e.d <= minD && e.d >= minD - 30 && e.amount < 0 && !(e.ref && e.ref.type === 'internal')).sort((a, b) => a.amount - b.amount).slice(0, 5);
  return { min: r2(min), minDay: minD, minDate: addDays(fc.T, minD), firstBelowDay: firstBelow, firstBelowDate: firstBelow >= 0 ? addDays(fc.T, firstBelow) : null, firstNegDate: firstNeg >= 0 ? addDays(fc.T, firstNeg) : null, gap, reserve: R, b30: at(29), b90: at(89), b365: at(364), drivers: evs, headroom: r2(min - R) };
}
function weeklyRows(fc, sid, n) {
  const s = fc.series[sid]; const rows = []; n = n || 13;
  const members = s.members || [sid];
  for (let w = 0; w < n; w++) {
    const d0 = w * 7, d1 = Math.min(fc.H - 1, d0 + 6);
    let i = 0, o = 0, mn = Infinity; for (let d = d0; d <= d1; d++) { i += s.inA[d]; o += s.outA[d]; mn = Math.min(mn, s.bal[d]); }
    rows.push({ w: w + 1, from: addDays(fc.T, d0), to: addDays(fc.T, d1), open: r2(d0 ? s.bal[d0 - 1] : s.open), in: r2(i), out: r2(o), close: r2(s.bal[d1]), min: r2(mn), events: fc.events.filter(e => members.includes(e.entityId) && e.d >= d0 && e.d <= d1) });
  }
  return rows;
}
function monthlyRows(fc, sid, n) {
  const s = fc.series[sid]; const rows = []; n = n || 24; const members = s.members || [sid];
  for (let m = 0; m < n; m++) {
    const ms = m === 0 ? fc.T : addMonths(monthStart(fc.T), m);
    const me = monthEnd(ms); const d0 = diffDays(fc.T, ms), d1 = Math.min(fc.H - 1, diffDays(fc.T, me));
    if (d0 >= fc.H) break;
    let i = 0, o = 0, mn = Infinity; for (let d = d0; d <= d1; d++) { i += s.inA[d]; o += s.outA[d]; mn = Math.min(mn, s.bal[d]); }
    rows.push({ m: m + 1, month: ms.slice(0, 7), from: ms, to: me, open: r2(d0 ? s.bal[d0 - 1] : s.open), in: r2(i), out: r2(o), net: r2(i - o), close: r2(s.bal[d1]), min: r2(mn), events: fc.events.filter(e => members.includes(e.entityId) && e.d >= d0 && e.d <= d1) });
  }
  return rows;
}
/** أقصى مبلغ يمكن صرفه دفعة واحدة في يوم d مع بقاء الرصيد فوق الاحتياطي في كل الفترات التالية */
function safeLumpCap(fc, sid, d, reserve) {
  const s = fc.series[sid]; const R = reserve != null ? reserve : s.reserve; let mn = Infinity;
  for (let k = d; k < fc.H; k++) mn = Math.min(mn, s.bal[k]);
  return r2(Math.max(0, mn - R));
}

/* ============ محاكي «ماذا لو؟» ============ */
const CHANGE_TYPES = {
  buy_device: 'شراء جهاز', farm_injection: 'ضخ مبلغ في المزرعة/مشروع', open_branch: 'فتح فرع جديد', sell_asset: 'بيع جزء من أصل (ذهب/أسهم...)',
  prepay: 'سداد دين مبكر', defer_payment: 'تأجيل دفعة', claims_delay: 'تأخر تحصيل التأمين', expense_up: 'زيادة المصروفات', branch_drop: 'انخفاض تحصيل فرع', one_off: 'دفعة/تحصيل لمرة واحدة', start_project: 'بدء مشروع قيد الدراسة'
};
function snapshotForScenario(S) {
  const keep = ['settings', 'entities', 'methods', 'accounts', 'categories', 'txns', 'claims', 'payables', 'closings', 'assets', 'liabilities', 'projects'];
  const o = {}; for (const k of keep) o[k] = clone(S[k]); o._vaultOpen = !!S._vaultOpen; o.audit = []; o.users = []; o.scenarios = []; o.imports = []; o.meta = clone(S.meta);
  return o;
}
function applyScenario(baseState, sc) {
  const W = clone(baseState); W._vaultOpen = baseState._vaultOpen;
  const T = today(); const extra = []; const entityMods = {}; let assume = {};
  let projects = W.projects.filter(p => !p.voided && p.status === 'active').map(p => ({ project: p, startDate: p.startDate || T, mode: 'full', scale: 1 }));
  for (const c of sc.changes || []) {
    const date = c.date || T;
    switch (c.type) {
      case 'buy_device': {
        const down = +c.downPayment || (+c.amount || 0);
        extra.push({ entityId: c.entityId, date, amount: -down, label: 'دفعة جهاز: ' + (c.label || ''), src: 'scenario' });
        if (+c.installments > 0 && +c.installmentAmount > 0) for (let i = 1; i <= +c.installments; i++) extra.push({ entityId: c.entityId, date: addMonths(date, i * (+c.frequencyMonths || 1)), amount: -(+c.installmentAmount), label: 'قسط جهاز ' + i, src: 'scenario' });
        if (+c.monthlyRevenue || +c.monthlyCost) {
          const p = { id: uid('sp'), name: 'إيراد جهاز ' + (c.label || ''), entityId: c.entityId, setup: [], monthlyOpex: +c.monthlyCost || 0, opexStartOffset: 0, firstRevenueOffset: +c.rampStart || 1, steadyRevenue: +c.monthlyRevenue || 0, rampMonths: +c.rampMonths || 3 };
          projects.push({ project: p, startDate: date, mode: 'full', scale: 1 });
        }
        break;
      }
      case 'farm_injection': case 'one_off':
        extra.push({ entityId: c.entityId || 'owner', date, amount: c.type === 'one_off' ? +c.amount : -(+c.amount || 0), label: (CHANGE_TYPES[c.type]) + ': ' + (c.label || ''), src: 'scenario' });
        if (+c.monthlyReturn) for (let i = +c.returnStartMonth || 6; i < 24; i++) extra.push({ entityId: c.entityId || 'owner', date: addMonths(date, i), amount: +c.monthlyReturn, label: 'عائد ' + (c.label || ''), src: 'scenario' });
        break;
      case 'open_branch': case 'start_project': {
        const p = c.projectId ? W.projects.find(x => x.id === c.projectId) : { id: uid('sp'), name: c.label || 'فرع جديد', entityId: c.entityId || 'admin', setup: [{ monthOffset: 0, amount: +c.amount || 0 }], workingCapital: +c.workingCapital || 0, monthlyOpex: +c.monthlyCost || 0, opexStartOffset: 0, firstRevenueOffset: +c.rampStart || 1, steadyRevenue: +c.monthlyRevenue || 0, rampMonths: +c.rampMonths || 6 };
        if (p) projects.push({ project: p, startDate: date, mode: c.mode || 'full', scale: c.scale == null ? 1 : +c.scale });
        break;
      }
      case 'sell_asset': {
        const a = W.assets.find(x => x.id === c.assetId); if (!a) break;
        const pct = (+c.pct || 100) / 100; const v = assetValues(a).net * pct;
        extra.push({ entityId: 'owner', date: addDays(date, +a.liquidationDays || 0), amount: v, label: 'بيع ' + Math.round(pct * 100) + '% من ' + a.name, src: 'scenario' });
        a.valueOrig = (+a.valueOrig || 0) * (1 - pct); if (a.netSaleOrig) a.netSaleOrig = +a.netSaleOrig * (1 - pct);
        break;
      }
      case 'prepay': {
        const L = W.liabilities.find(x => x.id === c.liabilityId); if (!L) break;
        const sc0 = liabilitySchedule(W, L); const pct = (+c.pct || 100) / 100;
        const k = Math.round(sc0.schedule.length * pct);
        const amt = c.amount ? +c.amount : sc0.outstanding * pct * (1 + (+L.earlyPenaltyPct || 0) / 100);
        extra.push({ entityId: L.entityId, date, amount: -amt, label: 'سداد مبكر: ' + L.name, src: 'scenario' });
        L.count = (+L.count || 0) - k; L.principal = (+L.principal || 0) * (1 - pct);
        break;
      }
      case 'defer_payment': {
        if (c.liabilityId) { const L = W.liabilities.find(x => x.id === c.liabilityId); if (L) L._deferMonths = +c.months || 1; }
        if (c.payableId) { const P = W.payables.find(x => x.id === c.payableId); if (P) P._deferDays = (+c.months || 1) * 30; }
        break;
      }
      case 'claims_delay': assume.claimDelayDays = (assume.claimDelayDays || 0) + (+c.days || 30); break;
      case 'expense_up': if (c.entityId) { entityMods[c.entityId] = Object.assign({}, entityMods[c.entityId]); entityMods[c.entityId].expenseMult = 1 + (+c.pct || 10) / 100; } else assume.expenseMult = 1 + (+c.pct || 10) / 100; break;
      case 'branch_drop': entityMods[c.entityId] = Object.assign({}, entityMods[c.entityId]); entityMods[c.entityId].collectionMult = 1 - (+c.pct || 20) / 100; break;
    }
  }
  return { W, extra, entityMods, assume, projects };
}
function runScenario(S, sc, assumeSet) {
  const base = sc.snapshot || snapshotForScenario(S);
  const set = Object.assign({}, S.settings.scen[assumeSet || sc.assumeSet || 'base']);
  const ap = applyScenario(base, sc);
  const A = Object.assign({}, set);
  if (ap.assume.claimDelayDays) A.claimDelayDays = (A.claimDelayDays || 0) + ap.assume.claimDelayDays;
  if (ap.assume.expenseMult) A.expenseMult = (A.expenseMult || 1) * ap.assume.expenseMult;
  return forecast(ap.W, { assume: A, extraEvents: ap.extra, entityMods: ap.entityMods, projects: ap.projects });
}
function scenarioMetrics(S, fc, baseFc, gid) {
  gid = gid || (fc.groups.total ? 'total' : 'company');
  const st = seriesStats(fc, gid);
  const mrows = monthlyRows(fc, gid, 24);
  const profit = r2(mrows.reduce((s, r) => s + r.net, 0));
  let tied = 0, payback = null;
  if (baseFc) {
    const b = baseFc.series[gid].bal, x = fc.series[gid].bal; let mn = 0, minSeen = false;
    for (let d = 0; d < fc.H; d++) { const diff = x[d] - b[d]; if (diff < mn) { mn = diff; minSeen = true; } if (minSeen && mn < -1 && payback == null && diff >= 0 && d > 0) payback = addDays(fc.T, d); }
    tied = r2(-mn);
  }
  return { gid, profit24: profit, min: st.min, minDate: st.minDate, firstBelow: st.firstBelowDate, firstNeg: st.firstNegDate, gap: st.gap, b30: st.b30, b90: st.b90, maxTied: tied, payback, reserve: st.reserve };
}
/** أي افتراض يقلب ترتيب البدائل؟ */
function sensitivity(S, scenarios, metric) {
  metric = metric || 'min';
  const tests = [
    { key: 'collectionMult', label: 'نسبة التحصيل', vals: [0.8, 1.1] },
    { key: 'expenseMult', label: 'المصروفات', vals: [0.95, 1.2] },
    { key: 'claimDelayDays', label: 'تأخير التأمين (يوم)', vals: [0, 60] },
    { key: 'projectRevenueMult', label: 'إيراد المشاريع', vals: [0.6, 1.2] }
  ];
  const rank = assume => {
    const base = forecast(snapshotLike(S), { assume });
    const ms = scenarios.map(sc => { const fc = runScenarioWith(S, sc, assume); return { id: sc.id, v: scenarioMetrics(S, fc, base)[metric] }; });
    return ms.sort((a, b) => b.v - a.v).map(x => x.id).join('>');
  };
  const baseA = S.settings.scen.base; const base = rank(baseA); const flips = [];
  for (const t of tests) for (const v of t.vals) { const A = Object.assign({}, baseA, { [t.key]: v }); const r = rank(A); if (r !== base) flips.push({ label: t.label, value: v, order: r }); }
  return { base, flips };
}
function snapshotLike(S) { return S; }
function runScenarioWith(S, sc, assume) {
  const base = sc.snapshot || snapshotForScenario(S); const ap = applyScenario(base, sc);
  const A = Object.assign({}, assume); if (ap.assume.claimDelayDays) A.claimDelayDays = (A.claimDelayDays || 0) + ap.assume.claimDelayDays; if (ap.assume.expenseMult) A.expenseMult = (A.expenseMult || 1) * ap.assume.expenseMult;
  return forecast(ap.W, { assume: A, extraEvents: ap.extra, entityMods: ap.entityMods, projects: ap.projects });
}

/* ============ محرك القرار وتخصيص رأس المال ============ */
function npvMonthly(flows, annual) { const r = Math.pow(1 + annual, 1 / 12) - 1; let v = 0; flows.forEach((f, m) => { v += f / Math.pow(1 + r, m + 1); }); return v; }
function decide(S, opts) {
  opts = opts || {};
  const T = today(); const disc = opts.discountRate != null ? opts.discountRate : (+S.settings.discountRate || 0.2);
  const gid = S._vaultOpen ? 'total' : 'company';
  const cons = S.settings.scen.conservative, baseA = S.settings.scen.base;
  const baseFcB = forecast(S, { assume: baseA }); const baseFcC = forecast(S, { assume: cons });
  const R = baseFcC.series[gid].reserve * (opts.reserveMult == null ? 1 : opts.reserveMult);
  const hoursAvail = +S.settings.ownerHoursPerWeek || 0;
  const studies = S.projects.filter(p => !p.voided && p.status !== 'active' && p.status !== 'rejected').slice(0, 3);
  const costly = S.liabilities.filter(L => !L.voided && (+L.interestRate || 0) > 0).sort((a, b) => b.interestRate - a.interestRate).slice(0, 2);
  const deferrable = S.liabilities.filter(L => !L.voided && L.class === 'deferrable').slice(0, 2);
  const sellable = S._vaultOpen ? S.assets.filter(a => !a.voided && !a.pledged && ['gold', 'silver', 'stock', 'fund', 'fx', 'deposit', 'broker_cash'].includes(a.type)).sort((a, b) => assetValues(b).net - assetValues(a).net).slice(0, 3) : [];
  // خيارات كل مشروع
  const projOpts = studies.map(p => [{ p, k: 'skip' }, { p, k: 'now', start: 0, mode: 'full' }, { p, k: 'd3', start: 3, mode: 'full' }, { p, k: 'd6', start: 6, mode: 'full' }, { p, k: 'pilot', start: 0, mode: 'pilot' }, { p, k: 'phased', start: 0, mode: 'phased' }]);
  const preOpts = costly.map(L => [{ L, pct: 0 }, { L, pct: 50 }, { L, pct: 100 }]);
  const defOpts = deferrable.map(L => [{ L, m: 0 }, { L, m: 2 }]);
  const sellOpts = sellable.map(a => [{ a, pct: 0 }, { a, pct: 50 }, { a, pct: 100 }]);
  const dims = [].concat(projOpts, preOpts, defOpts, sellOpts);
  let combos = [[]];
  for (const d of dims) { const n = []; for (const c of combos) for (const o of d) n.push(c.concat([o])); combos = n; if (combos.length > 1500) break; }
  combos = combos.slice(0, 1500);
  const modeLabel = { now: 'ابدأ الآن', d3: 'أجّل 3 شهور', d6: 'أجّل 6 شهور', pilot: 'تجربة مصغرة', phased: 'تنفيذ مرحلي', skip: 'لا تبدأ' };
  // تقييم سريع: فرق يومي مضاف لسلسلة الأساس
  const baseBalB = baseFcB.series[gid].bal, baseBalC = baseFcC.series[gid].bal; const H = baseFcB.H;
  const evalCombo = combo => {
    const incB = new Float64Array(H), incC = new Float64Array(H); const monthlyInc = new Array(120).fill(0); const actions = []; let hours = 0, residual = 0, upfront = 0;
    const addLump = (arr, d, amt) => { if (d < H) arr[Math.max(0, d)] += amt; };
    for (const o of combo) {
      if (o.p && o.k !== 'skip') {
        const sd = addMonths(T, o.start);
        for (const [arr, A] of [[incB, baseA], [incC, cons]]) {
          const m = projectMonthly(o.p, { mode: o.mode, revenueMult: A.projectRevenueMult, costMult: A.expenseMult, revenueDelay: A.projectDelayMonths, months: 30 });
          for (const x of m) { const d0 = diffDays(T, addMonths(sd, x.m)); if (d0 >= H) break; addLump(arr, d0, -x.lump); const rest = x.out / 30, inn = x.in / 30; for (let k = 0; k < 30 && d0 + k < H; k++) arr[d0 + k] += inn - rest; }
        }
        const mm = projectMonthly(o.p, { mode: o.mode, months: 120 });
        mm.forEach((x, i) => { if (i + o.start < 120) monthlyInc[i + o.start] += x.in - x.out - x.lump; });
        upfront += mm[0].lump;
        residual += (+o.p.residualValue || 0) * (o.mode === 'pilot' ? (+o.p.pilotScale || 0.3) : 1);
        hours += (+o.p.mgmtHoursWeek || 0) * (o.mode === 'pilot' ? 0.6 : 1);
        actions.push({ type: 'project', id: o.p.id, label: o.p.name + ': ' + modeLabel[o.k], amount: r2(mm[0].lump), date: sd });
      }
      if (o.L && o.pct) {
        const sc0 = liabilitySchedule(S, o.L); const k = Math.round(sc0.schedule.length * o.pct / 100);
        const pay = sc0.outstanding * o.pct / 100 * (1 + (+o.L.earlyPenaltyPct || 0) / 100);
        addLump(incB, 0, -pay); addLump(incC, 0, -pay); monthlyInc[0] -= pay;
        // الأقساط الموفرة: آخر k أقساط
        const saved = sc0.schedule.slice(sc0.schedule.length - k);
        for (const s of saved) { const d = diffDays(T, s.due); addLump(incB, d, s.amount); addLump(incC, d, s.amount); const mi = Math.max(0, Math.floor(d / 30.4)); if (mi < 120) monthlyInc[mi] += s.amount; }
        actions.push({ type: 'prepay', id: o.L.id, label: 'سداد مبكر ' + o.pct + '% من ' + o.L.name, amount: r2(pay), date: T });
      }
      if (o.L && o.m) {
        const sc0 = liabilitySchedule(S, o.L); const s = sc0.schedule[0]; if (s) {
          const d = diffDays(T, s.due), d2 = diffDays(T, addMonths(s.due, o.m)); const pen = s.amount * (+o.L.deferPenaltyPct || 0) / 100;
          for (const arr of [incB, incC]) { addLump(arr, d, s.amount); addLump(arr, d2, -(s.amount + pen)); }
          const mi = Math.max(0, Math.floor(d / 30.4)), mj = Math.max(0, Math.floor(d2 / 30.4)); monthlyInc[mi] += s.amount; monthlyInc[mj] -= s.amount + pen;
          actions.push({ type: 'defer', id: o.L.id, label: 'تأجيل قسط ' + o.L.name + ' ' + o.m + ' شهر', amount: r2(pen), date: s.due });
        }
      }
      if (o.a && o.pct) {
        const v = assetValues(o.a).net * o.pct / 100; const vc = assetValues(o.a, { fx: cons.fxMult, asset: cons.assetMult }).net * o.pct / 100;
        const d = +o.a.liquidationDays || 0; addLump(incB, d, v); addLump(incC, d, vc); monthlyInc[Math.floor(d / 30.4)] += v;
        const g = +o.a.expectedReturnAnnual || 0; residual -= v * Math.pow(1 + g / 100, 10);
        actions.push({ type: 'sell', id: o.a.id, label: 'بيع ' + o.pct + '% من ' + o.a.name, amount: r2(v), date: addDays(T, d) });
      }
    }
    // المؤشرات
    let minC = Infinity, minCd = 0, minB = Infinity, cumB = 0, cumC = 0, minCum = 0, firstDef = -1;
    for (let d = 0; d < H; d++) {
      cumB += incB[d]; cumC += incC[d];
      const bc = baseBalC[d] + cumC; if (bc < minC) { minC = bc; minCd = d; } if (firstDef < 0 && bc < R - 0.5) firstDef = d;
      const bb = baseBalB[d] + cumB; if (bb < minB) minB = bb; if (cumB < minCum) minCum = cumB;
    }
    let pb = -1, cm = 0, wentNeg = false; for (let m = 0; m < 120; m++) { cm += monthlyInc[m]; if (cm < -1) wentNeg = true; if (wentNeg && pb < 0 && cm >= 0) pb = m; }
    const npv = npvMonthly(monthlyInc, disc) + residual / Math.pow(1 + disc, 10);
    return { combo, actions, monthlyInc, residual, npv: r2(npv), minCons: r2(minC), minConsDate: addDays(T, minCd), headroom: r2(minC - R), feasible: minC >= R - 0.5 && hours <= hoursAvail + 0.01, firstDeficit: firstDef >= 0 ? addDays(T, firstDef) : null, deficit: firstDef >= 0 ? r2(R - minC) : 0, minBase: r2(minB), tied: r2(-minCum), paybackMonths: pb, hours: r2(hours), upfront: r2(upfront) };
  };
  const results = combos.map(evalCombo);
  const feas = results.filter(r => r.feasible);
  const statusQuo = results[0];
  const bestBy = (arr, f) => arr.length ? arr.reduce((a, b) => f(b) > f(a) ? b : a) : null;
  const best = { profit: bestBy(feas, r => r.npv), liquidity: bestBy(feas.length ? feas : results, r => r.headroom) };
  // الخيار المتوازن: مجموع القيم المعيارية على منحنى المفاضلة
  const front = pareto(feas.length ? feas : results);
  const nMin = Math.min(...front.map(r => r.npv)), nMax = Math.max(...front.map(r => r.npv)), hMin = Math.min(...front.map(r => r.headroom)), hMax = Math.max(...front.map(r => r.headroom));
  best.balanced = bestBy(front, r => (nMax > nMin ? (r.npv - nMin) / (nMax - nMin) : 0.5) + (hMax > hMin ? (r.headroom - hMin) / (hMax - hMin) : 0.5));
  const frontier = pickSpread(front, 5);
  // سقف الاستثمار الآمن لكل موعد بدء
  const caps = [];
  for (const m of [0, 1, 2, 3, 6, 9, 12]) { const d = diffDays(T, addMonths(T, m)); caps.push({ month: m, date: addMonths(T, m), lumpCapCons: safeLumpCap(baseFcC, gid, d, R), lumpCapBase: safeLumpCap(baseFcB, gid, d, R) }); }
  const projectCaps = studies.map(p => {
    const st = projectStats(p, {});
    const rows = [0, 3, 6].map(start => {
      // بحث ثنائي على معامل الحجم في السيناريو المتحفظ
      let lo = 0, hi = 3;
      const ok = sc => { const r = evalCombo([{ p: Object.assign({}, p, scaleProject(p, sc)), k: 'now', start, mode: 'full' }]); return r.minCons >= R - 0.5; };
      if (!ok(1e-6)) return { start, scale: 0, cap: 0 };
      for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
      return { start, scale: r2(lo), cap: r2(lo * st.initial), fullFits: lo >= 1 };
    });
    const modes = ['now', 'd3', 'd6', 'pilot', 'phased'].map(k => { const o = { p, k, start: k === 'd3' ? 3 : k === 'd6' ? 6 : 0, mode: k === 'pilot' ? 'pilot' : k === 'phased' ? 'phased' : 'full' }; const r = evalCombo([o]); return Object.assign({ k, label: modeLabel[k] }, r); });
    return { project: p, stats: st, caps: rows, modes };
  });
  const binding = [];
  if (!feas.length) binding.push('لا يوجد بديل يحقق الاحتياطي في السيناريو المتحفظ؛ أقل تعديل مطلوب: خفض الاحتياطي أو تدبير ' + Math.round(R - statusQuo.minCons).toLocaleString('en-US') + ' ج.م قبل ' + statusQuo.minConsDate);
  if (best.profit && best.profit.headroom < R * 0.1 + 1) binding.push('قيد احتياطي السيولة هو الحاكم لخطة الربحية');
  if (results.some(r => r.hours > hoursAvail && r.npv > (best.profit ? best.profit.npv : -Infinity))) binding.push('قيد وقت الإدارة الأسبوعي منع بدائل أعلى ربحية');
  // حساسية معدل الخصم
  const discFlip = [Math.max(0.01, disc - 0.05), disc + 0.05].map(d2 => { const alt = bestBy(feas, r => npvMonthly(r.monthlyInc, d2) + r.residual / Math.pow(1 + d2, 10)); return { rate: r2(d2), same: alt === best.profit, alt: alt ? alt.actions.map(a => a.label).join('، ') || 'الوضع الحالي' : '' }; });
  return { gid, reserve: R, discountRate: disc, evaluated: results.length, feasibleCount: feas.length, statusQuo, best, frontier, caps, projectCaps, binding, discFlip, studies: studies.length, method: 'تعداد شامل لكل البدائل (' + results.length + ' بديل) مع تقييم يومي على 24 شهر — أفضل خيار ضمن البدائل المختبرة' };
}
function scaleProject(p, s) { return { setup: (p.setup || []).map(x => ({ monthOffset: x.monthOffset, amount: x.amount * s })), workingCapital: (+p.workingCapital || 0) * s, monthlyOpex: (+p.monthlyOpex || 0) * s, steadyRevenue: (+p.steadyRevenue || 0) * s }; }
function pareto(arr) {
  const sorted = arr.slice().sort((a, b) => b.npv - a.npv); const out = []; let bestH = -Infinity;
  for (const r of sorted) if (r.headroom > bestH + 0.5) { out.push(r); bestH = r.headroom; }
  return out;
}
function pickSpread(front, n) { if (front.length <= n) return front; const out = []; for (let i = 0; i < n; i++) out.push(front[Math.round(i * (front.length - 1) / (n - 1))]); return out; }

/* ============ البيانات الناقصة ============ */
function missingData(S) {
  const T = today(); const out = [];
  const add = (w, msg, link) => out.push({ weight: w, msg, link });
  const R = S.settings.reserve;
  if (!(+R.ops) && !(+R.branchDefault)) add(10, 'حد أدنى لسيولة تشغيل العيادات غير محدد — يحدد سقف الاستثمار مباشرة', 'settings');
  if (S._vaultOpen && !(+R.owner)) add(9, 'حد أدنى للسيولة الشخصية غير محدد', 'settings');
  for (const a of S.accounts) if (a.active !== false && a.type !== 'pos' && (!a.verified || diffDays(a.verified.date, T) > 30)) add(8, 'رصيد ' + a.name + ' لم تتم مطابقته منذ أكثر من 30 يومًا', 'balances');
  for (const e of S.entities) if (e.type === 'branch' && e.active !== false) { const h = historyPattern(S, e.id, 90); if (h.days < 14 && !(+(e.assume || {}).monthlyIn)) add(9, 'فرع ' + e.name + ': لا توجد حركات كافية (14 يوم) ولا افتراض شهري للتحصيل', 'settings'); }
  if (S._vaultOpen) {
    for (const a of S.assets) { if (a.voided) continue; if (!a.valDate || diffDays(a.valDate, T) > 90) add(6, 'تقييم ' + a.name + ' قديم أو بدون تاريخ', 'vault'); if (a.currency && a.currency !== 'EGP' && (!a.fxRate || !a.fxDate)) add(7, 'سعر صرف ' + a.name + ' أو تاريخه غير مسجل', 'vault'); }
    const om = ent(S, 'owner'); if (om && !(+om.assume.monthlyOut)) add(8, 'المصروفات الشخصية الشهرية غير مسجلة', 'settings');
  }
  for (const L of S.liabilities) if (!L.voided && (!L.firstDueDate || !L.installment)) add(7, 'الالتزام ' + L.name + ': تاريخ القسط القادم أو قيمته ناقصة', 'liabilities');
  for (const p of S.projects) if (!p.voided && p.status !== 'active' && (!p.steadyRevenue || !(p.setup || []).length)) add(6, 'المشروع ' + p.name + ': تكلفة البداية أو الإيراد المتوقع ناقص', 'projects');
  if (S.settings.discountBasis === 'assumption') add(4, 'معدل الخصم ' + Math.round(S.settings.discountRate * 100) + '% افتراضي — حدده (تكلفة اقتراضك أو عائد الشهادات المتاح لك)', 'settings');
  for (const c of S.claims) if (!c.voided && claimStatus(S, c).outstanding > 0 && c.expectedDate && c.expectedDate < T) add(5, 'مطالبة ' + c.payer + ' متأخرة عن موعدها ' + c.expectedDate, 'claims');
  return out.sort((a, b) => b.weight - a.weight);
}

/* ============ خطة التنفيذ 30/90 يوم ============ */
function actionPlan(S, dec) {
  const T = today(); const plan = []; const vis = S._vaultOpen ? S.entities.map(e => e.id) : S.entities.filter(e => e.id !== 'owner').map(e => e.id);
  plan.push({ when: 'فورًا', action: 'ثبّت احتياطي السيولة', amount: dec.reserve, kpi: 'أقل رصيد متوقع ≥ الاحتياطي' });
  const ob = obligationsWithin(S, vis, 30).items.filter(i => i.cls !== 'optional').slice(0, 6);
  for (const i of ob) plan.push({ when: i.date, action: 'سداد: ' + i.label + (i.overdue ? ' (متأخر)' : ''), amount: i.amount, kpi: 'لا متأخرات' });
  const late = S.claims.filter(c => !c.voided && claimStatus(S, c).outstanding > 0).sort((a, b) => (a.expectedDate || '') < (b.expectedDate || '') ? -1 : 1).slice(0, 4);
  for (const c of late) plan.push({ when: c.expectedDate && c.expectedDate < addDays(T, 30) ? c.expectedDate : 'خلال 30 يوم', action: 'متابعة تحصيل ' + c.payer, amount: claimStatus(S, c).outstanding, kpi: 'نسبة التحصيل / متوسط أيام التحصيل' });
  const chosen = dec.best.balanced || dec.best.profit;
  if (chosen) for (const a of chosen.actions) plan.push({ when: a.date, action: a.label, amount: a.amount, kpi: 'أقل رصيد متحفظ ' + Math.round(chosen.minCons).toLocaleString('en-US') + ' في ' + chosen.minConsDate });
  plan.push({ when: addDays(T, 30), action: 'مراجعة شهرية: تحديث الأرصدة والمطابقات وإعادة تشغيل محرك القرار', amount: null, kpi: 'دقة التوقع مقابل الفعلي' });
  plan.push({ when: addDays(T, 90), action: 'مراجعة ربع سنوية لسقف الاستثمار وموعد البدء', amount: dec.caps[3] ? dec.caps[3].lumpCapCons : null, kpi: 'سقف الاستثمار الآمن' });
  return plan;
}

/* ============ التصدير ============ */
const api = {
  TZ, today, nowStamp, setToday, addDays, diffDays, addMonths, monthStart, monthEnd, r2, uid, clone,
  METHOD_KINDS, ACCOUNT_TYPES, FIN_IN, FIN_OUT, FIN_LABELS, KIND_LABELS, ROLES, ASSET_TYPES, BASIS, CHANGE_TYPES, PERMS,
  emptyState, defaultCategories, userCan, visibleEntityIds, canSeeEntity, audit,
  acc, ent, txnEffects, accountLedger, entityCash, posPendingList, claimStatus, payableStatus, liabilitySchedule, splitInstallment, fx,
  isDayLocked, closingFor, validateTxn, addTxn, addTransfer, settlePOS, reverseTxn, voidBatch, defaultMethodFor, lineTotal,
  daySummary, closeDay, reopenDay, methodTable, pnl, assetValues, liquidityTiers, obligationsWithin, position, positions,
  projectMonthly, projectStats, forecast, seriesStats, weeklyRows, monthlyRows, safeLumpCap, reserveFor, historyPattern,
  snapshotForScenario, applyScenario, runScenario, scenarioMetrics, sensitivity, decide, npvMonthly, missingData, actionPlan
};
root.SCCore = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
