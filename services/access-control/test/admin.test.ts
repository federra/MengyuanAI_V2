import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/store.ts';
import { AccessService } from '../src/service.ts';
import { createHandler } from '../src/http.ts';
await test('admin HTTP lifecycle, access guards, conflict, query audit and member-only metrics', async () => {
  const db = openStore(':memory:');
  const now = Date.parse('2026-09-15T12:00:00+08:00');
  const service = new AccessService(db, () => now);
  const handler = createHandler(service);
  try {
    const root = await service.bootstrap('admin', 'Admin-test-key-2026');
    const { token } = await service.login(
      'admin',
      'Admin-test-key-2026',
      'desktop',
    );
    const call = (
      path: string,
      method = 'GET',
      body?: unknown,
      bearer = token,
    ) =>
      handler(
        new Request('http://localhost' + path, {
          method,
          headers: {
            authorization: `Bearer ${bearer}`,
            'content-type': 'application/json',
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        '127.0.0.1',
      );
    const created = await call('/admin/users', 'POST', {
      account: 'Member',
      key: 'Member-test-key-2026',
      expires_at: now + 60000,
      reason: '开通会员',
    });
    assert.equal(created.status, 200);
    const member = (await created.json()) as {
      id: string;
      revision: number;
      role: string;
    };
    assert.equal(member.role, 'member');
    const { token: memberToken } = await service.login(
      'member',
      'Member-test-key-2026',
      'desktop',
    );
    assert.equal(
      (await call('/admin/users', 'GET', undefined, memberToken)).status,
      403,
    );
    assert.equal(
      (
        await call(
          '/admin/users',
          'POST',
          {
            account: 'hack',
            key: 'Member-test-key-2026',
            expires_at: now + 60000,
            reason: 'bad',
          },
          memberToken,
        )
      ).status,
      403,
    );
    assert.equal(
      (await call('/admin/users/' + member.id, 'DELETE')).status,
      404,
    );
    assert.equal(
      (
        await call('/admin/users', 'POST', {
          account: 'member',
          key: 'Member-test-key-2026',
          expires_at: now + 60000,
          reason: 'duplicate',
        })
      ).status,
      409,
    );
    const ban = await call(`/admin/users/${member.id}/ban`, 'POST', {
      revision: 1,
      reason: '审核封禁',
    });
    assert.equal(ban.status, 200);
    assert.throws(() => service.me(memberToken), { code: 'UNAUTHENTICATED' });
    assert.equal(
      (
        await call(`/admin/users/${member.id}/restore`, 'POST', {
          revision: 1,
          reason: 'stale',
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await call(`/admin/users/${member.id}/authorization`, 'POST', {
          revision: 2,
          reason: '续期',
          expires_at: now + 120000,
        })
      ).status,
      200,
    );
    await assert.rejects(
      service.login('member', 'Member-test-key-2026', 'desktop'),
      { code: 'BANNED' },
    );
    assert.equal(
      (
        await call(`/admin/users/${member.id}/restore`, 'POST', {
          revision: 3,
          reason: '恢复',
        })
      ).status,
      200,
    );
    assert.equal((await call('/admin/users?page=-1')).status, 400);
    const list = (await (
      await call('/admin/users?q=MEMBER&status=active')
    ).json()) as { items: unknown[]; total: number };
    assert.equal(list.total, 1);
    assert.ok(!JSON.stringify(list).includes('key_hash'));
    const insert = db.prepare(
      'INSERT INTO usage_events (event_id,user_id,role_at_event,operation_id,output_id,metric,video_kind,quantity,occurred_at,received_at,source) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    );
    insert.run(
      'e1',
      member.id,
      'member',
      'op1',
      'out1',
      'story',
      '',
      3,
      now,
      now,
      'test',
    );
    insert.run(
      'e2',
      root.id,
      'super_admin',
      'op2',
      'out2',
      'story',
      '',
      99,
      now,
      now,
      'test',
    );
    insert.run(
      'e3',
      member.id,
      'member',
      'op3',
      'out3',
      'video_export',
      'shot',
      2,
      now,
      now,
      'test',
    );
    const overview = (await (await call('/admin/overview')).json()) as {
      today: Record<string, number>;
    };
    assert.equal(overview.today.story, 3);
    assert.equal(overview.today.video_export, 2);
    assert.equal(overview.today.shot, 2);
    const usage = (await (
      await call(
        `/admin/users/${member.id}/usage?from=2026-09-15&to=2026-09-15`,
      )
    ).json()) as { totals: Record<string, number>; items: unknown[] };
    assert.equal(usage.totals.story, 3);
    assert.equal(usage.items.length, 2);
    assert.equal((await call('/admin/audit-logs?from=2026-02-30')).status, 400);
    const logs = (await (
      await call('/admin/audit-logs?action=user.ban')
    ).json()) as { items: { request_id: string }[] };
    assert.equal(logs.items.length, 1);
    assert.equal(logs.items[0].request_id, ban.headers.get('x-request-id'));
    const all = JSON.stringify(
      db.prepare('SELECT * FROM admin_audit_logs').all(),
    );
    assert.ok(!all.includes('Member-test-key-2026'));
    assert.ok(!all.includes(token));
    assert.ok(all.includes('admin.users.list'));
  } finally {
    db.close();
  }
});
