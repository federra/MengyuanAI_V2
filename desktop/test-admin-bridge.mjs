import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { adminCommand } = createRequire(import.meta.url)('./admin-bridge.cjs');
test('admin bridge rejects members and arbitrary routes; whitelists inputs', async () => {
  const calls = [];
  const auth = {
    call: async (...args) => {
      calls.push(args);
      return { ok: true };
    },
  };
  await assert.rejects(
    adminCommand(auth, async () => ({ role: 'member' }), 'users'),
    /FORBIDDEN/,
  );
  const admin = async () => ({ role: 'super_admin' });
  await assert.rejects(
    adminCommand(auth, admin, 'https://example.com'),
    /INVALID_INPUT/,
  );
  await assert.rejects(
    adminCommand(auth, admin, 'ban', { id: '../auth' }),
    /INVALID_INPUT/,
  );
  assert.equal(calls.length, 0);
  await adminCommand(auth, admin, 'users', {
    q: 'a&role=admin',
    page: 2,
    token: 'secret',
  });
  assert.deepEqual(calls[0], ['/admin/users?q=a%26role%3Dadmin&page=2']);
  await adminCommand(auth, admin, 'create', {
    account: 'abc',
    key: 'x',
    role: 'super_admin',
    expires_at: 123,
    reason: 'test',
  });
  assert.equal(calls[1][1].role, undefined);
});
