import assert from 'node:assert/strict';
import { AccessSession } from './access-session.cjs';
let role = 'member',
  denied = '',
  offline = false,
  resolvePending;
const member = {
  id: '11111111-1111-4111-8111-111111111111',
  account: 'member',
  role,
  expires_at: Date.now() + 60000,
};
let calls = 0,
  signalState;
const auth = new AccessSession({
  request: async (url, options) => {
    calls++;
    if (offline) throw Error('network');
    if (resolvePending)
      await new Promise((resolve) => {
        resolvePending = resolve;
      });
    return Response.json(
      denied
        ? { error: { code: denied } }
        : url.endsWith('logout')
          ? { ok: true }
          : {
              token: 'never-expose-this',
              user: member,
              server_time: Date.now(),
              session_expires_at: Date.now() + 60000,
            },
      { status: denied ? 403 : 200 },
    );
  },
  onState: (s) => (signalState = s),
});
assert.equal(auth.snapshot().authorized, false);
await assert.rejects(auth.authorize(), /UNAUTHENTICATED/);
await auth.login('member', 'Test-secret-key-2026');
assert.equal(auth.snapshot().authorized, true);
assert.ok(!JSON.stringify(auth.snapshot()).includes('never-expose'));
const before = calls;
await Promise.all([auth.authorize(), auth.authorize()]);
assert.equal(calls, before + 1);
denied = 'EXPIRED';
await assert.rejects(auth.authorize(), /EXPIRED/);
assert.equal(signalState.authorized, false);
denied = '';
await auth.login('member', 'Test-secret-key-2026');
offline = true;
await assert.rejects(auth.authorize(), /CONNECTION_FAILED/);
assert.equal(auth.snapshot().code, 'CONNECTION_FAILED');
offline = false;
await auth.authorize();
assert.equal(auth.snapshot().authorized, true);
resolvePending = true;
const pending = auth.authorize();
await new Promise((r) => setTimeout(r, 0));
const release = resolvePending;
resolvePending = false;
await auth.logout();
release();
await assert.rejects(pending, /UNAUTHENTICATED/);
assert.equal(auth.snapshot().authorized, false);
console.log(
  'PASS access session: online checks, fail closed, no token exposure and logout race',
);
