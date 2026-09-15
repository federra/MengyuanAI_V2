// Prototype contract regression; no real users, network, models or filesystem data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let elapsed = 0;
class Clock extends Date {
  static now() {
    return elapsed;
  }
}
const ctx = { window: {}, Date: Clock };
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(new URL('./demo-state.js', import.meta.url), 'utf8'),
  ctx,
);
const s = ctx.window.demoState;
assert.throws(() => s.create({}), /超级管理员/);
assert.throws(() => s.login('not-a-user', 'demo-key-2026'), /账号或密钥/);
const admin = s.login(' ADMIN ', 'demo-key-2026');
assert.equal(admin.role, 'super_admin');
assert.throws(
  () =>
    s.create({
      account: 'ADMIN',
      key: 'public-test-key',
      until: '2026-10-01T00:00',
      reason: 'test',
      name: '',
    }),
  /账号已存在/,
);
const member = s.create({
  account: ' QA.Member ',
  key: 'public-test-key',
  until: '2026-09-15T15:31',
  reason: '模拟开通',
  name: '验证会员',
});
assert.equal(member.account, 'qa.member');
assert.deepEqual(
  Array.from(s.counts(member.id, '2026-01-01', '2026-12-31')),
  [0, 0, 0, 0, 0],
);
assert.equal(s.rangeEvents(member.id, '2026-01-01', '2026-12-31').length, 0);
s.logout();
assert.throws(() => s.login('qa.member', 'wrong'), /账号或密钥/);
assert.equal(s.login('QA.MEMBER', 'public-test-key').id, member.id);
assert.throws(
  () => s.change(member, { banned: false, reason: '越权' }),
  /超级管理员/,
);
s.logout();
s.login('admin', 'demo-key-2026');
s.change(member, { banned: true, reason: '模拟封禁' });
s.logout();
assert.throws(() => s.login('qa.member', 'public-test-key'), /封禁/);
s.login('admin', 'demo-key-2026');
s.change(member, { banned: false, reason: '模拟恢复' });
s.logout();
s.login('qa.member', 'public-test-key');
elapsed = 59999;
assert.equal(s.status(member), 'active');
elapsed = 60000;
assert.equal(s.status(member), 'expired');
s.logout();
assert.throws(() => s.login('qa.member', 'public-test-key'), /到期/);
s.login('admin', 'demo-key-2026');
s.change(member, { banned: true, reason: '过期封禁' });
s.change(member, { banned: false, reason: '恢复不延期' });
assert.equal(s.status(member), 'expired');
s.change(member, { until: '2026-10-15T00:00', reason: '延期' });
assert.equal(s.status(member), 'active');
s.change(member, { banned: true, reason: '封禁' });
s.change(member, { until: '2026-12-15T00:00', reason: '延期不解封' });
assert.equal(s.status(member), 'banned');
const before = Array.from(s.counts(null, '2026-08-17', '2026-09-15'));
const sum = s.members.reduce(
  (a, u) => {
    const c = s.counts(u.id, '2026-08-17', '2026-09-15');
    c.forEach((n, i) => (a[i] += n));
    return a;
  },
  [0, 0, 0, 0, 0],
);
assert.deepEqual(before, Array.from(sum));
assert(before[4] > 0);
assert.equal(
  s
    .rangeEvents(null, '2026-08-17', '2026-09-15')
    .some((e) => e.role === 'super_admin'),
  false,
);
assert.equal(s.members.length, 6); // No deletion after ban / expiry.
assert(s.logs.some((l) => l.action === '新增用户' && l.outcome === '失败'));
assert(
  s.logs.some((l) => l.action === '恢复权限' && l.reason === '恢复不延期'),
);
assert(
  s.logs.every((l) => l.actor === 'admin' && l.actorId === 'A001' && l.id),
);
assert(!JSON.stringify(s.logs).includes('public-test-key'));
console.log(
  'PASS: account/key login, authorization lifecycle, expiry boundary, admin guards, zero history, totals, audit and no credential leakage',
);
