const C = require('../src/core.js');
const assert = require('assert');
C.setToday('2026-11-20');
let pass = 0; const t = (name, fn) => { try { fn(); pass++; console.log('✓', name); } catch (e) { console.log('✗', name, '\n   ', e.message); process.exitCode = 1; } };

function setup() {
  const S = C.emptyState('test');
  S.entities.push({ id: 'b1', name: 'فرع 1', type: 'branch', active: true, assume: { mode: 'auto' } }, { id: 'b2', name: 'فرع 2', type: 'branch', active: true, assume: { mode: 'auto' } });
  S.accounts.push(
    { id: 'cash1', name: 'خزنة فرع 1', entityId: 'b1', type: 'cash', opening: 0, openingDate: '2026-01-01' },
    { id: 'vf1', name: 'فودافون فرع 1', entityId: 'b1', type: 'wallet', opening: 0, openingDate: '2026-01-01' },
    { id: 'bank', name: 'البنك المركزي للإدارة', entityId: 'admin', type: 'bank', opening: 0, openingDate: '2026-01-01' },
    { id: 'pos1', name: 'ماكينة فرع 1', entityId: 'b1', type: 'pos', opening: 0, openingDate: '2026-01-01', linkedBankId: 'bank', settleDays: 2, feePct: 2 },
    { id: 'cash2', name: 'خزنة فرع 2', entityId: 'b2', type: 'cash', opening: 0, openingDate: '2026-01-01' });
  const owner = { id: 'u_o', name: 'المالك', role: 'owner' };
  const acct = { id: 'u_a', name: 'محاسب', role: 'accountant', entityIds: ['b1'] };
  S.users.push(owner, acct);
  return { S, owner, acct };
}
const D = '2026-11-20';
const inc = C.ent; void inc;

t('1) فاتورة 600 نقدي + 400 فودافون ثم مصروف 200 نقدي', () => {
  const { S, owner } = setup();
  const cat = S.categories.income[0].id, ecat = S.categories.expense[0].id;
  assert(C.addTxn(S, { id: 'x1', kind: 'income', date: D, entityId: 'b1', categoryId: cat, lines: [{ methodId: 'm_cash', accountId: 'cash1', amount: 600 }, { methodId: 'm_vf', accountId: 'vf1', amount: 400 }] }, owner).ok);
  assert(C.addTxn(S, { id: 'x2', kind: 'expense', date: D, entityId: 'b1', categoryId: ecat, lines: [{ methodId: 'm_cash', accountId: 'cash1', amount: 200 }] }, owner).ok);
  const m = C.methodTable(S, { entityIds: ['b1'], from: D, to: D });
  assert.strictEqual(S.txns.filter(x => x.kind === 'income').length, 1, 'الفاتورة تظهر مرة واحدة');
  assert.strictEqual(m.total.rev, 1000); assert.strictEqual(m.total.exp, 200);
  assert.strictEqual(m.rows.find(r => r.methodId === 'm_cash').net, 400);
  assert.strictEqual(m.rows.find(r => r.methodId === 'm_vf').net, 400);
  assert.strictEqual(m.total.net, 800);
});

t('2) تحويل 300 من الخزنة للبنك بدون رسوم', () => {
  const { S, owner } = setup();
  C.addTxn(S, { id: 'i', kind: 'income', date: D, entityId: 'b1', categoryId: S.categories.income[0].id, lines: [{ methodId: 'm_cash', accountId: 'cash1', amount: 1000 }] }, owner);
  const before = { cash: C.accountLedger(S, 'cash1').book, bank: C.accountLedger(S, 'bank').book, tbl: C.methodTable(S, { entityIds: ['b1'], from: D, to: D }).total.net, liq: C.liquidityTiers(S, ['b1', 'admin']).tiers.now };
  assert(C.addTransfer(S, { date: D, entityId: 'b1', fromAccountId: 'cash1', toAccountId: 'bank', amount: 300 }, owner).ok);
  assert.strictEqual(C.accountLedger(S, 'cash1').book, before.cash - 300);
  assert.strictEqual(C.accountLedger(S, 'bank').book, before.bank + 300);
  assert.strictEqual(C.methodTable(S, { entityIds: ['b1'], from: D, to: D }).total.net, before.tbl);
  assert.strictEqual(C.liquidityTiers(S, ['b1', 'admin']).tiers.now, before.liq);
});

t('3) تحصيل POS 1000 ثم تسوية 980 + رسوم 20', () => {
  const { S, owner } = setup();
  C.addTxn(S, { id: 'p', kind: 'income', date: D, entityId: 'b1', categoryId: S.categories.income[0].id, lines: [{ methodId: 'm_pos', accountId: 'pos1', amount: 1000 }] }, owner);
  assert.strictEqual(C.posPendingList(S, ['b1'])[0].pending, 1000, 'يظهر قيد التسوية');
  assert(C.settlePOS(S, { date: D, entityId: 'b1', posAccountId: 'pos1', bankAccountId: 'bank', gross: 1000, fee: 20 }, owner).ok);
  const m = C.methodTable(S, { entityIds: ['b1'], from: D, to: D });
  assert.strictEqual(S.txns.filter(x => x.kind === 'income').length, 1); assert.strictEqual(m.total.rev, 1000);
  assert.strictEqual(m.total.exp, 20, 'مصروف رسوم 20');
  assert.strictEqual(C.accountLedger(S, 'bank').book, 980);
  assert.strictEqual(C.posPendingList(S, ['b1']).length, 0, 'إقفال المبلغ المعلق');
});

t('4) مطالبة تأمين 10,000 وتحصيل جزئي 4,000', () => {
  const { S, owner } = setup();
  S.claims.push({ id: 'c1', entityId: 'b1', payer: 'شركة تأمين', amount: 10000, date: '2026-11-01', expectedDate: '2026-12-15', collectAccountId: 'bank' });
  C.addTxn(S, { id: 'cp', kind: 'claim_payment', linkId: 'c1', date: D, entityId: 'b1', lines: [{ methodId: 'm_bank', accountId: 'bank', amount: 4000 }] }, owner);
  assert.strictEqual(C.pnl(S, ['b1'], '2026-11-01', D).cashIn, 4000);
  assert.strictEqual(C.claimStatus(S, S.claims[0]).outstanding, 6000);
  const fc = C.forecast(S, {});
  const ev = fc.events.filter(e => e.ref && e.ref.id === 'c1');
  assert.strictEqual(ev.length, 1); assert.strictEqual(ev[0].amount, 6000, 'التوقع للمتبقي فقط');
});

t('5) حساب بنكي مركزي يستقبل إنستاباي من فرعين', () => {
  const { S, owner } = setup();
  const cat = S.categories.income[0].id;
  C.addTxn(S, { kind: 'income', id: 'a', date: D, entityId: 'b1', categoryId: cat, lines: [{ methodId: 'm_ip', accountId: 'bank', amount: 700 }] }, owner);
  C.addTxn(S, { kind: 'income', id: 'b', date: D, entityId: 'b2', categoryId: cat, lines: [{ methodId: 'm_ip', accountId: 'bank', amount: 500 }] }, owner);
  assert.strictEqual(C.methodTable(S, { entityIds: ['b1'], from: D, to: D }).total.rev, 700);
  assert.strictEqual(C.methodTable(S, { entityIds: ['b2'], from: D, to: D }).total.rev, 500);
  const P = C.position(S, ['b1', 'b2', 'admin']);
  assert.strictEqual(P.cash, 1200, 'رصيد البنك مرة واحدة في الإجمالي');
  assert.strictEqual(C.entityCash(S, 'admin').cash, 1200); assert.strictEqual(C.entityCash(S, 'b1').cash, 0);
});

t('6) المحاسب يرى الفروع المصرح بها فقط والخزنة الشخصية محجوبة', () => {
  const { S, acct, owner } = setup();
  S._vaultOpen = true;
  const vis = C.visibleEntityIds(S, acct);
  assert.deepStrictEqual(vis, ['b1']);
  assert(!vis.includes('owner'));
  assert(!C.userCan(acct, 'vault'));
  assert(C.userCan(acct, 'export'));
  assert(C.visibleEntityIds(S, owner).includes('owner'));
  const r = C.addTxn(S, { kind: 'income', id: 'z', date: D, entityId: 'b2', categoryId: S.categories.income[0].id, lines: [{ methodId: 'm_cash', accountId: 'cash2', amount: 5 }] }, acct);
  assert(!r.ok, 'لا يسجل على فرع غير مصرح');
});

t('7) سيناريو تأخير تأمين وشراء جهاز لا يغيّر السجلات الفعلية', () => {
  const { S, owner } = setup();
  S.claims.push({ id: 'c1', entityId: 'b1', payer: 'تأمين', amount: 10000, date: '2026-11-01', expectedDate: '2026-12-01', collectAccountId: 'bank' });
  C.addTxn(S, { kind: 'income', id: 'i1', date: D, entityId: 'b1', categoryId: S.categories.income[0].id, lines: [{ methodId: 'm_cash', accountId: 'cash1', amount: 50000 }] }, owner);
  const snapshotJSON = JSON.stringify({ t: S.txns, c: S.claims, l: S.liabilities, a: S.accounts });
  const sc = { id: 's1', name: 'جهاز + تأخير', snapshot: C.snapshotForScenario(S), changes: [{ type: 'claims_delay', days: 60 }, { type: 'buy_device', entityId: 'b1', date: '2026-12-01', downPayment: 30000, installments: 4, installmentAmount: 5000, frequencyMonths: 3 }] };
  const base = C.forecast(S, {}); const fc = C.runScenario(S, sc, 'base');
  const sb = C.seriesStats(base, 'company'), sx = C.seriesStats(fc, 'company');
  assert(sx.min < sb.min, 'السيولة تتغير داخل السيناريو');
  const evb = base.events.find(e => e.ref && e.ref.id === 'c1'), evx = fc.events.find(e => e.ref && e.ref.id === 'c1');
  assert(evx.d - evb.d === 60, 'تأخير التأمين 60 يوم');
  assert.strictEqual(JSON.stringify({ t: S.txns, c: S.claims, l: S.liabilities, a: S.accounts }), snapshotJSON, 'السجلات كما هي');
});

t('8) إعادة إرسال حركة سُجلت بدون إنترنت تُحفظ مرة واحدة', () => {
  const { S, owner } = setup();
  const tx = { id: 'offline-1', kind: 'income', date: D, entityId: 'b1', categoryId: S.categories.income[0].id, lines: [{ methodId: 'm_cash', accountId: 'cash1', amount: 250 }], sync: 'pending' };
  const r1 = C.addTxn(S, JSON.parse(JSON.stringify(tx)), owner);
  const r2 = C.addTxn(S, JSON.parse(JSON.stringify(tx)), owner);
  const r3 = C.addTxn(S, JSON.parse(JSON.stringify(tx)), owner);
  assert(r1.ok && !r1.dup && r2.dup && r3.dup);
  assert.strictEqual(S.txns.filter(x => x.id === 'offline-1').length, 1);
  assert.strictEqual(S.txns[0].sync, 'pending', 'الحالة ظاهرة');
});

t('إضافي: اليوم المقفل يمنع التعديل ويقبل قيد التصحيح', () => {
  const { S, owner } = setup();
  C.addTxn(S, { kind: 'income', id: 'q', date: '2026-11-19', entityId: 'b1', categoryId: S.categories.income[0].id, lines: [{ methodId: 'm_cash', accountId: 'cash1', amount: 100 }] }, owner);
  assert(C.closeDay(S, { entityId: 'b1', date: '2026-11-19', counted: { cash1: { amount: 100 } } }, owner).ok);
  assert(!C.addTxn(S, { kind: 'income', id: 'q2', date: '2026-11-19', entityId: 'b1', categoryId: S.categories.income[0].id, lines: [{ methodId: 'm_cash', accountId: 'cash1', amount: 1 }] }, owner).ok);
  assert(C.reverseTxn(S, 'q', owner, 'خطأ').ok);
  assert.strictEqual(C.accountLedger(S, 'cash1').book, 0);
  assert(S.audit.some(a => a.action === 'reverse'));
});

t('إضافي: محرك القرار يعمل ويحترم الاحتياطي', () => {
  const { S, owner } = setup();
  S.settings.reserve.ops = 20000;
  C.addTxn(S, { kind: 'income', id: 'big', date: D, entityId: 'b1', categoryId: S.categories.income[0].id, lines: [{ methodId: 'm_cash', accountId: 'cash1', amount: 200000 }] }, owner);
  S.projects.push({ id: 'pr', name: 'مشروع', status: 'study', entityId: 'admin', setup: [{ monthOffset: 0, amount: 150000 }], monthlyOpex: 10000, firstRevenueOffset: 2, steadyRevenue: 30000, rampMonths: 4, mgmtHoursWeek: 5, pilotScale: 0.3, phases: 2 });
  S.settings.ownerHoursPerWeek = 10;
  const d = C.decide(S, {});
  assert(d.evaluated >= 6);
  assert(d.best.profit.minCons >= 20000 - 1);
  const cap0 = d.caps[0].lumpCapCons; assert(cap0 > 0 && cap0 <= 200000 - 20000 + 1, 'سقف ' + cap0);
  assert(d.projectCaps[0].caps[0].cap > 0);
});
console.log(`\n${pass} اختبار ناجح`);
