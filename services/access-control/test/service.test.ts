import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.ts';
import { AccessService } from '../src/service.ts';

const key = 'Only-a-test-key-2026';
await test('account lifecycle, durable sessions, independent expiry/ban and transactional audit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'director-access-'));
  const path = join(dir, 'test.sqlite');
  let now = 1_800_000_000_000;
  let db = openStore(path);
  let service = new AccessService(db, () => now);
  try {
    const admin = await service.bootstrap(' Admin ', key);
    assert.equal(admin.account, 'admin');
    await assert.rejects(service.bootstrap('other', key), {
      code: 'ALREADY_INITIALIZED',
    });
    const auth = await service.login('ADMIN', key, 'desktop');
    const member = await service.createMember(auth.token, {
      account: 'Member',
      key,
      expires_at: now + 60_000,
      reason: 'test opening',
    });
    await assert.rejects(
      service.createMember(auth.token, {
        account: ' member ',
        key,
        expires_at: now + 60_000,
        reason: 'duplicate',
      }),
      { code: 'ACCOUNT_EXISTS' },
    );
    await assert.rejects(service.login('member', 'wrong-key-2026', 'desktop'), {
      code: 'INVALID_CREDENTIALS',
    });
    await assert.rejects(service.login('missing', key, 'desktop'), {
      code: 'INVALID_CREDENTIALS',
    });
    const session = await service.login('member', key, 'desktop');
    assert.throws(() => service.requireAdmin(session.token), {
      code: 'FORBIDDEN',
    });
    assert.equal(service.me(session.token).user.id, member.id);
    assert.ok(!JSON.stringify(service.me(session.token)).includes('key_hash'));
    db.close();
    db = openStore(path);
    service = new AccessService(db, () => now);
    assert.equal(service.me(session.token).user.account, 'member');
    const banned = service.changeAuthorization(auth.token, member.id, {
      action: 'ban',
      revision: 1,
      reason: 'test ban',
    });
    assert.throws(() => service.me(session.token), { code: 'UNAUTHENTICATED' });
    await assert.rejects(service.login('member', 'wrong-key-2026', 'desktop'), {
      code: 'INVALID_CREDENTIALS',
    });
    await assert.rejects(service.login('member', key, 'desktop'), {
      code: 'BANNED',
    });
    assert.throws(
      () =>
        service.changeAuthorization(auth.token, member.id, {
          action: 'restore',
          revision: 1,
          reason: 'stale',
        }),
      { code: 'CONFLICT' },
    );
    now += 60_000;
    const restored = service.changeAuthorization(auth.token, member.id, {
      action: 'restore',
      revision: banned.revision,
      reason: 'restore',
    });
    await assert.rejects(service.login('member', key, 'desktop'), {
      code: 'EXPIRED',
    });
    service.changeAuthorization(auth.token, member.id, {
      action: 'expiry',
      revision: restored.revision,
      expires_at: now + 60_000,
      reason: 'renew',
    });
    const renewed = await service.login('member', key, 'desktop');
    now += 60_000;
    assert.throws(() => service.me(renewed.token), { code: 'EXPIRED' });
    service.logout(auth.token);
    assert.throws(() => service.me(auth.token), { code: 'UNAUTHENTICATED' });
    const logs = JSON.stringify(
      db.prepare('SELECT * FROM admin_audit_logs').all(),
    );
    assert.ok(logs.includes('user.ban'));
    assert.ok(!logs.includes(key));
    assert.ok(!logs.includes(auth.token));
    assert.ok(
      !JSON.stringify(db.prepare('SELECT * FROM sessions').all()).includes(
        renewed.token,
      ),
    );
    assert.throws(() =>
      db.prepare('DELETE FROM users WHERE id=?').run(member.id),
    );
    assert.throws(() => db.exec('DELETE FROM admin_audit_logs'));
    const freshAdmin = await service.login('admin', key, 'desktop');
    db.exec(
      "CREATE TRIGGER fail_audit BEFORE INSERT ON admin_audit_logs BEGIN SELECT RAISE(ABORT, 'disk failure'); END",
    );
    assert.throws(() =>
      service.changeAuthorization(freshAdmin.token, member.id, {
        action: 'ban',
        revision: 4,
        reason: 'rollback',
      }),
    );
    assert.equal(
      db.prepare('SELECT banned_at FROM users WHERE id=?').get(member.id)
        ?.banned_at,
      null,
    );
    db.exec('DROP TRIGGER fail_audit');
    now += 12 * 60 * 60 * 1000;
    assert.throws(() => service.me(freshAdmin.token), {
      code: 'UNAUTHENTICATED',
    });
    assert.ok(!readFileSync(path).includes(Buffer.from(key)));
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
