import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

await test('generated administrator is private, initialization refuses overwrite, HTTP process enforces session', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'access-process-'));
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const env = {
    ...process.env,
    ACCESS_DB: join(dir, 'data', 'access.sqlite'),
    ACCESS_PORT: '0',
  };
  const secret = join(dir, 'admin-key');
  async function initialize() {
    const child = spawn(process.execPath, ['src/init-generated.ts', secret], {
      cwd,
      env,
      stdio: 'pipe',
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const [code] = await once(child, 'exit');
    return { code, output };
  }
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const init = await initialize();
    assert.equal(init.code, 0, init.output);
    const key = readFileSync(secret, 'utf8').trim();
    assert.ok(key.length >= 32);
    assert.ok(!init.output.includes(key));
    assert.equal(statSync(secret).mode & 0o777, 0o600);
    assert.notEqual((await initialize()).code, 0);
    assert.equal(readFileSync(secret, 'utf8').trim(), key);
    child = spawn(process.execPath, ['src/server.ts'], {
      cwd,
      env,
      stdio: 'pipe',
    });
    let errors = '';
    child.stderr!.on('data', (chunk) => (errors += chunk));
    const port = await new Promise<number>((resolve, reject) => {
      child!.once('exit', (code) =>
        reject(new Error(`server exited ${code}: ${errors}`)),
      );
      child!.stdout!.once('data', (chunk) => {
        try {
          resolve(JSON.parse(String(chunk)).port);
        } catch (error) {
          reject(error);
        }
      });
    });
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(base + '/health')).status, 200);
    const response = await fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: 'admin', key, client_type: 'desktop' }),
    });
    assert.equal(response.status, 200);
    const { token } = (await response.json()) as { token: string };
    assert.equal(
      (
        await fetch(base + '/auth/me', {
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(base + '/auth/login', {
          method: 'POST',
          body: 'x'.repeat(9000),
        })
      ).status,
      413,
    );
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await once(child, 'exit');
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
