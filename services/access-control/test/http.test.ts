import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/store.ts';
import { AccessService } from '../src/service.ts';
import { createHandler } from '../src/http.ts';

await test('HTTP auth contract rejects malformed bodies, cookies, oversized requests and throttles login', async () => {
  const db = openStore(':memory:');
  let now = 1_800_000_000_000;
  const service = new AccessService(db, () => now);
  await service.bootstrap('admin', 'Test-http-key-2026');
  const handle = createHandler(service);
  const request = (
    path: string,
    method = 'GET',
    body?: string,
    headers: Record<string, string> = {},
  ) =>
    handle(
      new Request('http://localhost' + path, {
        method,
        ...(body !== undefined ? { body } : {}),
        headers: { 'content-type': 'application/json', ...headers },
      }),
      '127.0.0.1',
    );
  try {
    assert.equal((await request('/health')).status, 200);
    assert.equal((await request('/auth/me')).status, 401);
    assert.equal((await request('/auth/login', 'POST', '{')).status, 400);
    assert.equal((await request('/auth/login', 'POST', '[]')).status, 400);
    assert.equal(
      (await request('/auth/login', 'POST', ' '.repeat(9000))).status,
      413,
    );
    assert.equal(
      (
        await request('/auth/login', 'POST', '{}', {
          'content-type': 'text/plain',
        })
      ).status,
      415,
    );
    const login = await request(
      '/auth/login',
      'POST',
      JSON.stringify({
        account: 'admin',
        key: 'Test-http-key-2026',
        client_type: 'desktop',
      }),
    );
    assert.equal(login.status, 200);
    assert.equal(login.headers.get('cache-control'), 'no-store');
    const { token } = (await login.json()) as { token: string };
    assert.equal(
      (
        await request('/auth/me', 'GET', undefined, {
          cookie: `token=${token}`,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request('/auth/me', 'GET', undefined, {
          authorization: `Bearer ${token}`,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request('/admin/users', 'DELETE', undefined, {
          authorization: `Bearer ${token}`,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request('/auth/logout', 'POST', '{}', {
          authorization: `Bearer ${token}`,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request('/auth/me', 'GET', undefined, {
          authorization: `Bearer ${token}`,
        })
      ).status,
      401,
    );
    const body = JSON.stringify({
      account: 'unknown',
      key: 'wrong-key-2026',
      client_type: 'desktop',
    });
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const response = await request('/auth/login', 'POST', body);
      if (response.status === 429) {
        limited = true;
        assert.ok(response.headers.get('retry-after'));
        break;
      }
    }
    assert.ok(limited);
    now += 61_000;
    assert.equal((await request('/auth/login', 'POST', body)).status, 401);
  } finally {
    db.close();
  }
});
