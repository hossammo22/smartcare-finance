/* بيانات تجريبية واضحة — كل الأرقام هنا افتراضية للتجربة فقط */
(function (root) {
'use strict';
const C = root.SCCore;
function prng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function build() {
  const R = prng(20261120);
  const rnd = (a, b) => a + R() * (b - a); const pick = arr => arr[Math.floor(R() * arr.length)];
  const round = (x, s) => Math.round(x / (s || 10)) * (s || 10);
  const S = C.emptyState('demo');
  const T = C.today();
  const st = S.settings;
  st.reserve = { ops: 300000, owner: 200000, branchDefault: 50000, byEntity: {} };
  st.transfers.monthlyDrawing = 100000; st.ownerHoursPerWeek = 10; st.discountRate = 0.22; st.discountBasis = 'assumption';
  const branches = [
    { id: 'b_oct', name: 'فرع تجريبي – أكتوبر', scale: 1.2 },
    { id: 'b_fsl', name: 'فرع تجريبي – فيصل', scale: 0.9 },
    { id: 'b_hsr', name: 'فرع تجريبي – الحصري', scale: 1.0 }
  ];
  for (const b of branches) S.entities.push({ id: b.id, name: b.name, type: 'branch', active: true, assume: { mode: 'auto', monthlyIn: 0, monthlyOut: 0, monthlyNewClaims: b.id === 'b_oct' ? 40000 : 15000, claimLagDays: 60 }, depreciationMonthly: round(15000 * b.scale, 100) });
  S.entities.find(e => e.id === 'owner').assume = { mode: 'manual', monthlyIn: 0, monthlyOut: 60000, monthlyNewClaims: 0, claimLagDays: 0 };
  S.entities.find(e => e.id === 'admin').assume = { mode: 'auto', monthlyIn: 0, monthlyOut: 0, monthlyNewClaims: 0, claimLagDays: 60 };
  const opening = C.addDays(T, -121);
  const A = (id, name, entityId, type, openingAmt, extra) => S.accounts.push(Object.assign({ id, name, entityId, type, opening: openingAmt, openingDate: opening, active: true }, extra || {}));
  A('a_bank_c', 'البنك المركزي (إنستاباي لكل الفروع)', 'admin', 'bank', 450000);
  A('a_cash_adm', 'خزنة الإدارة', 'admin', 'cash', 20000);
  for (const b of branches) {
    A('a_cash_' + b.id, 'خزنة ' + b.name, b.id, 'cash', 15000);
    A('a_vf_' + b.id, 'فودافون كاش ' + b.name, b.id, 'wallet', 5000);
    A('a_pos_' + b.id, 'ماكينة POS ' + b.name, b.id, 'pos', 0, { linkedBankId: b.id === 'b_hsr' ? 'a_bank_hsr' : 'a_bank_c', settleDays: 2, feePct: 1.5 });
  }
  A('a_bank_hsr', 'حساب بنكي فرع الحصري', 'b_hsr', 'bank', 60000);
  A('a_own_bank', 'حسابي البنكي الشخصي', 'owner', 'bank', 350000);
  A('a_own_cash', 'نقدية شخصية', 'owner', 'cash', 40000);
  const sys = { id: 'u_owner', name: 'المالك (تجريبي)', role: 'owner' };
  S._vaultOpen = true;
  const cat = n => (S.categories.income.find(c => c.name === n) || S.categories.expense.find(c => c.name === n)).id;
  const incCats = ['كشف', 'أسنان', 'تقويم', 'جلدية', 'أشعة', 'تحاليل'];
  const add = t => { t._allowLocked = true; const r = C.addTxn(S, t, sys); if (!r.ok) console.warn('demo txn', r.errors, t); return r; };
  // الحركات اليومية
  for (let d = -120; d <= 0; d++) {
    const date = C.addDays(T, d); const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    const fri = dow === 5 ? 0.5 : 1; // الجمعة نصف يوم
    for (const b of branches) {
      const n = Math.round(rnd(7, 11) * b.scale * fri * (d === 0 ? 0.4 : 1));
      for (let i = 0; i < n; i++) {
        const amount = round(rnd(250, 2200) * (R() < 0.08 ? 4 : 1), 50);
        const roll = R(); let lines;
        const cashL = a => ({ methodId: 'm_cash', accountId: 'a_cash_' + b.id, amount: a });
        if (roll < 0.42) lines = [cashL(amount)];
        else if (roll < 0.56) lines = [{ methodId: 'm_vf', accountId: 'a_vf_' + b.id, amount }];
        else if (roll < 0.72) lines = [{ methodId: 'm_ip', accountId: b.id === 'b_hsr' ? 'a_bank_hsr' : 'a_bank_c', amount }];
        else if (roll < 0.94) lines = [{ methodId: 'm_pos', accountId: 'a_pos_' + b.id, amount }];
        else { const c = round(amount * 0.6, 50); lines = [cashL(c), { methodId: 'm_vf', accountId: 'a_vf_' + b.id, amount: amount - c }]; }
        const h = String(10 + Math.floor(R() * 11)).padStart(2, '0') + ':' + String(Math.floor(R() * 60)).padStart(2, '0');
        add({ id: 'dm_' + b.id + '_' + date + '_' + i, kind: 'income', date, time: h, entityId: b.id, categoryId: cat(pick(incCats)), lines, ref: 'INV-' + Math.floor(R() * 90000 + 10000) });
      }
      // مصروفات يومية صغيرة
      if (R() < 0.7) add({ id: 'dm_sup_' + b.id + date, kind: 'expense', date, entityId: b.id, categoryId: cat('مستلزمات'), lines: [{ methodId: 'm_cash', accountId: 'a_cash_' + b.id, amount: round(rnd(200, 1500) * b.scale, 10) }] });
      if (dow === 2) add({ id: 'dm_lab_' + b.id + date, kind: 'expense', date, entityId: b.id, categoryId: cat('معمل'), lines: [{ methodId: 'm_vf', accountId: 'a_vf_' + b.id, amount: round(rnd(3000, 7000) * b.scale, 50) }] });
      if (dow === 4) add({ id: 'dm_doc_' + b.id + date, kind: 'expense', date, entityId: b.id, categoryId: cat('نسب الأطباء'), lines: [{ methodId: 'm_cash', accountId: 'a_cash_' + b.id, amount: round(rnd(12000, 20000) * b.scale, 100) }] });
      // ترحيل النقدية للبنك أسبوعيًا
      if (dow === 0) { const bal = C.accountLedger(S, 'a_cash_' + b.id, date).book; if (bal > 25000) C.addTransfer(S, { id: 'dm_tr_' + b.id + date, date, entityId: b.id, fromAccountId: 'a_cash_' + b.id, toAccountId: b.id === 'b_hsr' ? 'a_bank_hsr' : 'a_bank_c', amount: round(bal - 15000, 100), note: 'إيداع أسبوعي' }, sys); }
      if (dow === 0) { const vb = C.accountLedger(S, 'a_vf_' + b.id, date).book; if (vb > 15000) C.addTransfer(S, { id: 'dm_vfb_' + b.id + date, date, entityId: b.id, fromAccountId: 'a_vf_' + b.id, toAccountId: 'a_bank_c', amount: round(vb - 8000, 100), fee: 0, note: 'ترحيل المحفظة للبنك المركزي' }, sys); }
      if (dow === 1 && b.id === 'b_hsr') { const hb = C.accountLedger(S, 'a_bank_hsr', date).book; if (hb > 80000) C.addTransfer(S, { id: 'dm_hb_' + date, date, entityId: 'b_hsr', fromAccountId: 'a_bank_hsr', toAccountId: 'a_bank_c', amount: round(hb - 50000, 1000), note: 'ترحيل للبنك المركزي' }, sys); }
      // تسوية POS كل يومين
      if (d < -1 && d % 2 === 0) { const pend = C.accountLedger(S, 'a_pos_' + b.id, C.addDays(date, -1)).book; if (pend > 0) { const fee = C.r2(pend * 0.015); C.settlePOS(S, { id: 'dm_st_' + b.id + date, date, entityId: b.id, posAccountId: 'a_pos_' + b.id, bankAccountId: b.id === 'b_hsr' ? 'a_bank_hsr' : 'a_bank_c', gross: pend, fee }, sys); } }
      // فودافون → خزنة أحيانًا
      if (dow === 3 && R() < 0.5) C.addTransfer(S, { id: 'dm_vfw_' + b.id + date, date, entityId: b.id, fromAccountId: 'a_vf_' + b.id, toAccountId: 'a_cash_' + b.id, amount: 3000, fee: 15, note: 'سحب من المحفظة' }, sys);
      // استرداد نادر
      if (R() < 0.03) { const orig = S.txns.filter(t => t.entityId === b.id && t.kind === 'income' && t.date === date)[0]; if (orig) add({ id: 'dm_ref_' + b.id + date, kind: 'refund', date, entityId: b.id, linkId: orig.id, categoryId: orig.categoryId, lines: [{ methodId: 'm_cash', accountId: 'a_cash_' + b.id, amount: Math.min(500, orig.lines[0].amount) }], note: 'رد مبلغ لمريض' }); }
    }
    // شهرية
    const dom = +date.slice(8, 10);
    if (dom === 1) for (const b of branches) add({ id: 'dm_rent_' + b.id + date, kind: 'expense', date, entityId: b.id, categoryId: cat('إيجار'), lines: [{ methodId: 'm_bank', accountId: 'a_bank_c', amount: round(45000 * b.scale, 1000) }], note: 'دفعته الإدارة نيابة عن الفرع' });
    if (dom === 28) {
      for (const b of branches) add({ id: 'dm_sal_' + b.id + date, kind: 'expense', date, entityId: b.id, categoryId: cat('رواتب'), lines: [{ methodId: 'm_bank', accountId: 'a_bank_c', amount: round(95000 * b.scale, 1000) }] });
      add({ id: 'dm_sal_adm' + date, kind: 'expense', date, entityId: 'admin', categoryId: cat('رواتب'), lines: [{ methodId: 'm_bank', accountId: 'a_bank_c', amount: 70000 }] });
    }
    if (dom === 5) { add({ id: 'dm_ads' + date, kind: 'expense', date, entityId: 'admin', categoryId: cat('إعلانات'), lines: [{ methodId: 'm_bank', accountId: 'a_bank_c', amount: 30000 }] }); add({ id: 'dm_util' + date, kind: 'expense', date, entityId: 'admin', categoryId: cat('مرافق'), lines: [{ methodId: 'm_bank', accountId: 'a_bank_c', amount: 8000 }] }); }
    if (dom === 2) add({ id: 'dm_draw' + date, kind: 'transfer', date, entityId: 'admin', fromAccountId: 'a_bank_c', toAccountId: 'a_own_bank', amount: 100000, finSub: 'owner_drawing', note: 'سحب شهري للمالك' });
    if (dom === 3) add({ id: 'dm_pers' + date, kind: 'expense', date, entityId: 'owner', categoryId: cat('أخرى'), lines: [{ methodId: 'm_bank', accountId: 'a_own_bank', amount: 60000 }], note: 'مصروفات شخصية' });
  }
  // مطالبات تأمين
  const payers = ['شركة تأمين (أ) – تجريبي', 'شركة تأمين (ب) – تجريبي', 'تعاقد شركة (ج) – تجريبي'];
  for (let m = 4; m >= 0; m--) for (const b of branches) {
    const date = C.addDays(T, -m * 30 - 5); const amount = round(rnd(15000, 45000) * b.scale, 500);
    const c = { id: 'dm_cl_' + b.id + m, entityId: b.id, payer: pick(payers), amount, date, expectedDate: C.addDays(date, 60), collectAccountId: 'a_bank_c', categoryId: cat('تأمين / شركات'), note: 'مطالبة شهرية' };
    S.claims.push(c);
    if (m >= 2) add({ id: 'dm_clp_' + c.id, kind: 'claim_payment', linkId: c.id, date: C.addDays(date, 55 + Math.floor(R() * 10)), entityId: b.id, lines: [{ methodId: 'm_bank', accountId: 'a_bank_c', amount: m === 2 ? round(amount * 0.4, 100) : amount }] });
  }
  // مستحقات للموردين
  S.payables.push({ id: 'dm_pay1', entityId: 'b_oct', payee: 'مورد مستلزمات – تجريبي', amount: 38000, date: C.addDays(T, -10), dueDate: C.addDays(T, 20), categoryId: cat('مستلزمات'), class: 'mandatory', payAccountId: 'a_bank_c' });
  S.payables.push({ id: 'dm_pay2', entityId: 'admin', payee: 'ضرائب ربع سنوية – تجريبي', amount: 120000, date: C.addDays(T, -5), dueDate: C.addDays(T, 40), categoryId: cat('ضرائب'), class: 'mandatory', payAccountId: 'a_bank_c' });
  S.payables.push({ id: 'dm_pay3', entityId: 'b_fsl', payee: 'صيانة أجهزة – تجريبي', amount: 22000, date: C.addDays(T, -3), dueDate: C.addDays(T, 12), categoryId: cat('صيانة'), class: 'deferrable', payAccountId: 'a_bank_c' });
  // الالتزامات
  S.liabilities.push({ id: 'dm_l_xray', entityId: 'b_oct', name: 'قسط جهاز أشعة – تجريبي', lender: 'مورد الجهاز', currency: 'EGP', principal: 480000, balanceDate: C.addDays(T, -30), installment: 90000, frequencyMonths: 3, firstDueDate: C.addDays(T, 25), count: 6, interestRate: 18, earlyPenaltyPct: 2, class: 'mandatory', payAccountId: 'a_bank_c', earlyTerms: 'سداد مبكر بغرامة 2%' });
  S.liabilities.push({ id: 'dm_l_bank', entityId: 'admin', name: 'قرض بنكي تشغيلي – تجريبي', lender: 'بنك تجريبي', currency: 'EGP', principal: 400000, balanceDate: C.addDays(T, -15), installment: 25000, frequencyMonths: 1, firstDueDate: C.addDays(T, 10), count: 18, interestRate: 26, earlyPenaltyPct: 1, class: 'mandatory', payAccountId: 'a_bank_c' });
  S.liabilities.push({ id: 'dm_l_land', entityId: 'owner', name: 'قسط أرض – تجريبي', lender: 'مطور تجريبي', currency: 'EGP', principal: 1200000, balanceDate: C.addDays(T, -20), installment: 150000, frequencyMonths: 3, firstDueDate: C.addDays(T, 45), count: 8, interestRate: 0, class: 'mandatory', payAccountId: 'a_own_bank' });
  S.liabilities.push({ id: 'dm_l_usd', entityId: 'owner', name: 'التزام بالدولار – تجريبي', lender: 'مورد خارجي', currency: 'USD', fxRate: 49.5, fxDate: T, fxSource: 'افتراض للتجربة', principal: 6000, balanceDate: T, installment: 1000, frequencyMonths: 1, firstDueDate: C.addDays(T, 18), count: 6, interestRate: 0, class: 'deferrable', deferPenaltyPct: 1, payAccountId: 'a_own_bank' });
  // الأصول (الخزنة الشخصية)
  const asset = a => S.assets.push(Object.assign({ id: C.uid('as'), owner: 'المالك', entityId: 'owner', currency: 'EGP', valDate: T, valSource: 'افتراض للتجربة', basis: 'assumption', pledged: false, expectedReturnAnnual: 0 }, a));
  asset({ name: 'شهادة بنكية 3 سنوات – تجريبي', type: 'deposit', valueOrig: 1000000, breakCostPct: 3, liquidationDays: 3, expectedReturnAnnual: 20 });
  asset({ name: 'ذهب عيار 21 – 250 جم', type: 'gold', quantity: 250, unit: 'جم', karat: 21, valueOrig: 975000, netSaleOrig: 950000, liquidationDays: 1, expectedReturnAnnual: 15 });
  asset({ name: 'دولار نقدي – تجريبي', type: 'fx', currency: 'USD', valueOrig: 10000, fxRate: 49.5, fxDate: T, fxSource: 'افتراض للتجربة', liquidationDays: 2, expectedReturnAnnual: 8 });
  asset({ name: 'محفظة أسهم – تجريبي', type: 'stock', valueOrig: 600000, breakCostPct: 0.6, liquidationDays: 2, expectedReturnAnnual: 18 });
  asset({ name: 'أرض – تجريبي', type: 'land', valueOrig: 4000000, breakCostPct: 3, liquidationDays: 180, expectedReturnAnnual: 12, pledged: false });
  asset({ name: 'شقة مرهونة – تجريبي', type: 'realestate', valueOrig: 2500000, breakCostPct: 3, liquidationDays: 120, pledged: true, pledgedNote: 'ضمان قرض' });
  // المشاريع
  S.projects.push({ id: 'dm_farm', name: 'مزرعة دواجن – تجريبي', type: 'farm', status: 'active', entityId: 'owner', startDate: C.addMonths(T, -10), setup: [], monthlyOpex: 140000, opexStartOffset: 0, firstRevenueOffset: 0, steadyRevenue: 175000, rampMonths: 1, seasonality: [1.1, 1.1, 1, 0.9, 0.8, 0.7, 0.7, 0.8, 1, 1.1, 1.2, 1.2], landValue: 3000000, landAppreciationAnnual: 12, mgmtHoursWeek: 4, note: 'دورات تربية ~45 يوم — الإيراد متوسط شهري' });
  S.projects.push({ id: 'dm_new', name: 'مشروع جديد مقترح – تجريبي', type: 'new', status: 'study', entityId: 'owner', setup: [{ monthOffset: 0, amount: 1200000, label: 'تأسيس' }, { monthOffset: 2, amount: 300000, label: 'تجهيزات' }], workingCapital: 200000, monthlyOpex: 90000, opexStartOffset: 1, firstRevenueOffset: 3, steadyRevenue: 200000, rampMonths: 6, residualValue: 600000, mgmtHoursWeek: 6, pilotScale: 0.35, phases: 2, phaseGapMonths: 6, exitCost: 150000 });
  S.projects.push({ id: 'dm_apt', name: 'شقة أكتوبر بالتقسيط – تجريبي', type: 'realestate', status: 'study', entityId: 'owner', setup: [{ monthOffset: 0, amount: 700000, label: 'مقدم' }], monthlyOpex: 30000, opexStartOffset: 1, firstRevenueOffset: 30, steadyRevenue: 0, rampMonths: 1, residualValue: 3200000, mgmtHoursWeek: 1, pilotScale: 1, phases: 1 });
  S.projects.push({ id: 'dm_exp', name: 'توسعة فرع أكتوبر (جهاز ليزر) – تجريبي', type: 'expansion', status: 'study', entityId: 'b_oct', setup: [{ monthOffset: 0, amount: 650000 }], monthlyOpex: 15000, opexStartOffset: 0, firstRevenueOffset: 1, steadyRevenue: 70000, rampMonths: 4, residualValue: 200000, mgmtHoursWeek: 1, pilotScale: 1, phases: 1 });
  // إقفال الأيام السابقة (كل يوم قبل أمس) — حساب الأرصدة اليومية مرة واحدة
  const daily = {}; const sorted = S.txns.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const running = {}; for (const a of S.accounts) running[a.id] = +a.opening || 0;
  let idx = 0;
  for (let d = -121; d <= 0; d++) {
    const date = C.addDays(T, d);
    while (idx < sorted.length && sorted[idx].date <= date) { for (const e of C.txnEffects(sorted[idx])) running[e.accountId] += e.amount; idx++; }
    daily[date] = Object.assign({}, running);
  }
  for (let d = -120; d <= -2; d++) {
    const date = C.addDays(T, d);
    for (const b of branches) {
      const dayTx = S.txns.filter(t => t.entityId === b.id && t.date === date); if (!dayTx.length) continue;
      const counted = {};
      for (const a of S.accounts.filter(a => a.entityId === b.id)) {
        const exp = C.r2(daily[date][a.id]); let cnt = a.type === 'pos' ? null : exp, reason = '';
        if (d === -5 && a.type === 'cash') { cnt = C.r2(exp - 50); reason = 'عجز فكة'; }
        counted[a.id] = { expected: exp, counted: cnt, diff: cnt == null ? null : C.r2(cnt - exp), reason };
        if (cnt != null) a.verified = { amount: cnt, date, by: 'مدير الفرع (تجريبي)' };
      }
      const tbl = C.methodTable(S, { entityIds: [b.id], from: date, to: date });
      S.closings.push({ id: 'dm_cl_' + b.id + date, entityId: b.id, date, by: 'مدير الفرع (تجريبي)', byId: 'u_mgr', at: date + ' 22:30', status: 'closed', totals: tbl.total, count: dayTx.length, counted, note: '' });
    }
  }
  for (const a of S.accounts.filter(a => a.entityId === 'admin' || a.entityId === 'owner')) a.verified = { amount: C.r2(daily[C.addDays(T, -2)][a.id]), date: C.addDays(T, -2), by: 'المالك (تجريبي)' };
  S.audit = S.audit.slice(-300);
  delete S._vaultOpen;
  return S;
}
root.SCDemo = { build, users: [
  { name: 'المالك (تجريبي)', role: 'owner', pin: '123456', entityIds: [] },
  { name: 'مدير فرع أكتوبر (تجريبي)', role: 'manager', pin: '2222', entityIds: ['b_oct'], approveClose: true },
  { name: 'المحاسب (تجريبي)', role: 'accountant', pin: '3333', entityIds: ['b_oct', 'b_fsl'] },
  { name: 'كاشير الحصري (تجريبي)', role: 'cashier', pin: '4444', entityIds: ['b_hsr'] }
] };
})(typeof window !== 'undefined' ? window : globalThis);
