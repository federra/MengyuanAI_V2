import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
await fs.mkdir('work/business-test', { recursive: true });
const output = ts.transpileModule(
  await fs.readFile('lib/business.ts', 'utf8'),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  },
).outputText;
await fs.writeFile('work/business-test/business.mjs', output);
const {
  emptyBusiness,
  applyBusiness,
  openCommission,
  parseMoney,
  businessDate,
} = await import(
  pathToFileURL(path.resolve('work/business-test/business.mjs')).href
);
const now = '2026-09-10T03:00:00Z';
let state = emptyBusiness(),
  seq = 0;
function apply(action) {
  state = applyBusiness(state, action, now, `id-${++seq}`);
  return state;
}
const initial = structuredClone(state);
assert.equal(state.rules.enabled, false);
apply({ type: 'agent', name: '一级测试', code: 'FIRST' });
const first = state.agents[0].id;
assert.deepEqual(initial.agents, []);
apply({ type: 'agent', name: '二级测试', code: 'SECOND', parentId: first });
const second = state.agents[1].id;
assert.throws(
  () =>
    apply({ type: 'agent', name: '非法三级', code: 'THIRD', parentId: second }),
  /最多支持两级/,
);
assert.throws(
  () => apply({ type: 'agent', name: '重复码', code: 'first' }),
  /不能重复/,
);
const income = (reference, more = {}) => ({
  type: 'income',
  reference,
  amount: '100.01',
  kind: '渠道收益',
  date: '2026-09-10',
  agentId: second,
  ...more,
});
apply(income('DISABLED'));
assert.equal(state.income[0].commissions.length, 0);
assert.throws(
  () => apply({ type: 'rules', first: 9000, second: 2000, enabled: true }),
  /超过100/,
);
apply({ type: 'rules', first: 3000, second: 1000, enabled: true });
apply(income('ORDER-1'));
const order = state.income.at(-1);
assert.deepEqual(
  order.commissions.map((c) => [c.agentId, c.cents]),
  [
    [second, 3000],
    [first, 1000],
  ],
);
assert.equal(order.cents, 10001);
assert.throws(() => apply(income('order-1')), /已经登记/);
assert.throws(
  () => apply(income('INVALID-DATE', { date: '2026-02-30' })),
  /有效日期/,
);
assert.throws(
  () => apply(income('FUTURE', { date: '2027-01-01' })),
  /有效日期/,
);
for (const bad of ['-1', '1.001', '1e3', 'NaN', '0', '', '999999999'])
  assert.throws(() => parseMoney(bad));
assert.equal(parseMoney('0.01'), 1);
assert.equal(parseMoney('99999999.99'), 9999999999);
assert.equal(businessDate('2026-09-09T17:00:00Z'), '2026-09-10');
apply({ type: 'rules', first: 1000, second: 500, enabled: true });
assert.equal(
  state.income.find((i) => i.id === order.id).commissions[0].cents,
  3000,
);
apply({ type: 'settle', agentId: second });
const settlement = state.settlements.at(-1);
assert.equal(settlement.cents, 3000);
assert.equal(openCommission(state, second).length, 0);
assert.throws(() => apply({ type: 'settle', agentId: second }), /没有可结算/);
assert.throws(
  () => apply({ type: 'voidIncome', id: order.id, reason: '退款' }),
  /已有结算/,
);
apply({ type: 'settlementStatus', id: settlement.id, status: '已取消' });
assert.equal(openCommission(state, second)[0].cents, 3000);
apply({ type: 'settle', agentId: second });
const payment = state.settlements.at(-1);
assert.throws(
  () =>
    apply({
      type: 'settlementStatus',
      id: payment.id,
      status: '已登记付款',
      reference: '',
    }),
  /付款凭证/,
);
apply({
  type: 'settlementStatus',
  id: payment.id,
  status: '已登记付款',
  reference: 'PAY-1',
});
assert.throws(
  () => apply({ type: 'settlementStatus', id: payment.id, status: '已取消' }),
  /只能操作待付款/,
);
assert.throws(
  () => apply({ type: 'voidIncome', id: order.id, reason: '退款' }),
  /已有结算/,
);
apply({ type: 'settle', agentId: first });
const upstreamPayment = state.settlements.at(-1);
assert.throws(
  () =>
    apply({
      type: 'settlementStatus',
      id: upstreamPayment.id,
      status: '已登记付款',
      reference: 'PAY-1',
    }),
  /已经登记/,
);
apply(income('TO-VOID'));
const voidable = state.income.at(-1);
apply({ type: 'voidIncome', id: voidable.id, reason: '录入错误' });
assert.equal(openCommission(state, second).length, 0);
assert.throws(() => apply(income('TO-VOID')), /已经登记/);
apply({ type: 'agentStatus', id: first, active: false });
assert.throws(() => apply(income('PAUSED')), /已停用/);
assert.throws(
  () =>
    apply({ type: 'agent', name: '暂停上级', code: 'PAUSE', parentId: first }),
  /已停用/,
);
assert.ok(state.audit.length > 0);

// Exercise route-level stale writes, first insert races and same-origin protection.
await fs.writeFile(
  'work/business-test/fake.mjs',
  `
let row = null;
export function json(value, status = 200) { return Response.json(value, {status}); }
export function sameOrigin(req) { const o = req.headers.get('origin'); if (o && o !== new URL(req.url).origin) throw Error('不允许跨站写入'); }
export function db() { return { prepare(sql) { let args; return { bind(...a) { args = a; return this; }, async first() { return row ? {...row} : null; }, async run() {
  let changes = 0;
  if (sql.startsWith('INSERT')) { if (!row) { row = {body: args[1], revision: args[2]}; changes=1; } }
  else if (row?.revision === args[3]) { row = {body: args[0], revision: args[1]}; changes=1; }
  return {meta:{changes}};
} }; } }; }
`,
);
const routeSrc = ts
  .transpileModule(await fs.readFile('app/api/business/route.ts', 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  })
  .outputText.replaceAll("'@/lib/server'", "'./fake.mjs'")
  .replaceAll("'@/lib/business'", "'./business.mjs'");
await fs.writeFile('work/business-test/route.mjs', routeSrc);
const { GET, POST } = await import(
  pathToFileURL(path.resolve('work/business-test/route.mjs')).href
);
const request = (revision, code, origin = 'https://studio.test') =>
  new Request('https://studio.test/api/business', {
    method: 'POST',
    headers: { origin },
    body: JSON.stringify({
      revision,
      action: { type: 'agent', name: code, code },
    }),
  });
assert.equal(
  (await POST(request(0, 'EVIL', 'https://other.test'))).status,
  400,
);
const concurrent = await Promise.all([
  POST(request(0, 'ONE1')),
  POST(request(0, 'TWO2')),
]);
assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
assert.equal((await POST(request(0, 'STALE'))).status, 409);
const saved = await (await GET()).json();
assert.equal(saved.revision, 1);
assert.equal(saved.agents.length, 1);
const updateConcurrent = await Promise.all([
  POST(request(1, 'THREE')),
  POST(request(1, 'FOUR')),
]);
assert.deepEqual(updateConcurrent.map((r) => r.status).sort(), [200, 409]);
console.log(
  'Business tests passed: cents, two tiers, immutable rules, void/payment constraints, duplicate prevention and optimistic concurrency.',
);
