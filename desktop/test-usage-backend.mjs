import { fork } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { openStore } from '../services/access-control/src/store.ts';
import { AccessService } from '../services/access-control/src/service.ts';
import { createHandler } from '../services/access-control/src/http.ts';
const stage = path.resolve(
  process.env.DIRECTOR_ACCESS_STAGE ||
    'desktop/test-results/access-stage4-build',
);
const dataDir = await fs.mkdtemp(
  path.join(os.tmpdir(), 'director-usage-backend-'),
);
const database = openStore(':memory:'),
  service = new AccessService(database),
  handler = createHandler(service);
await service.bootstrap('admin-test', 'Admin-fixture-key-2026');
const admin = await service.login(
  'admin-test',
  'Admin-fixture-key-2026',
  'desktop',
);
const member = await service.createMember(admin.token, {
  account: 'member-test',
  key: 'Member-fixture-key-2026',
  expires_at: Date.now() + 600000,
  reason: 'test',
});
const session = await service.login(
  'member-test',
  'Member-fixture-key-2026',
  'desktop',
);
const token = crypto.randomBytes(24).toString('hex'),
  encryptionKey = crypto.randomBytes(32).toString('hex'),
  internalToken = crypto.randomBytes(32).toString('hex');
let child,
  url,
  first = true,
  uploads = 0,
  sequence = 0;
const pending = new Map();
async function start() {
  child = fork(path.join(stage, 'backend.mjs'), [], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  child.stderr.on('data', (b) => process.stderr.write(b));
  url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('start timeout')), 45000);
    child.on('message', async (m) => {
      if (m.type === 'authorize')
        child.send({
          type: 'authorization',
          id: m.id,
          state: { authorized: true, user: member },
        });
      if (m.type === 'usage-command-result') {
        const p = pending.get(m.id);
        if (p) {
          pending.delete(m.id);
          m.error ? p.reject(Error(m.error)) : p.resolve();
        }
      }
      if (m.type === 'usage-upload') {
        try {
          assert.equal(m.ownerId, member.id);
          const response = await handler(
            new Request('http://localhost/usage/events', {
              method: 'POST',
              headers: {
                authorization: 'Bearer ' + session.token,
                'content-type': 'application/json',
              },
              body: JSON.stringify({ events: m.events }),
            }),
            '127.0.0.1',
          );
          assert.equal(response.status, 200, await response.clone().text());
          const data = await response.json();
          uploads++;
          if (first) {
            first = false;
            child.send({
              type: 'usage-upload-result',
              id: m.id,
              error: 'lost reply',
            });
          } else child.send({ type: 'usage-upload-result', id: m.id, data });
        } catch (e) {
          reject(e);
        }
      }
      if (m.type === 'ready') {
        clearTimeout(timeout);
        resolve(m.url);
      }
      if (m.type === 'error') {
        clearTimeout(timeout);
        reject(Error(m.message));
      }
    });
    child.once('exit', () => {
      clearTimeout(timeout);
      reject(Error('backend exited'));
    });
    child.send({
      type: 'start',
      dataDir,
      token,
      encryptionKey,
      ownerId: member.id,
      ownerRole: 'member',
      internalToken,
    });
  });
}
async function stop() {
  if (child?.exitCode === null) {
    const end = once(child, 'exit');
    child.send({ type: 'stop' });
    await end;
  }
}
const req = (route, init = {}) =>
  fetch(url + route, {
    ...init,
    headers: {
      Cookie: `director_session=${token}`,
      Origin: url,
      ...init.headers,
    },
  });
const command = (action, data) =>
  new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    child.send({ type: 'usage-command', id, action, ...data });
  });
const until = async (predicate) => {
  for (let n = 0; n < 400; n++) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error('condition timeout');
};
try {
  await start();
  const project = {
    id: crypto.randomUUID(),
    title: '统计测试',
    brief: '新创意',
    story: '',
    script: '',
    scenes: '',
    style: '电影感',
    ratio: '16:9',
    shots: [],
    assets: [],
    revision: 0,
    updatedAt: new Date().toISOString(),
  };
  const saved = await req('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(project),
  });
  assert.equal(saved.status, 200, await saved.clone().text());
  const form = new FormData();
  form.set(
    'file',
    new File(['video-fixture'], 'clip.mp4', { type: 'video/mp4' }),
  );
  form.set('operation_id', 'doubao:test-job');
  const media = await (
    await req('/api/media', { method: 'POST', body: form })
  ).json();
  assert.ok(media.id);
  const { exportVideo } = createRequire(import.meta.url)('./video-files.cjs');
  const options = {
    videosDir: path.join(dataDir, 'videos'),
    origin: url,
    token,
    journal: {
      begin: (event, details) => command('file-begin', { event, details }),
      complete: (eventId, created) =>
        command('file-complete', { eventId, created }),
    },
  };
  assert.equal(
    (await exportVideo({ projectId: project.id, mediaId: media.id }, options))
      .created,
    true,
  );
  assert.equal(
    (await exportVideo({ projectId: project.id, mediaId: media.id }, options))
      .created,
    false,
  );
  await until(() => uploads === 1);
  assert.equal(
    database.prepare('SELECT COUNT(*) n FROM usage_events').get().n,
    3,
  );
  await stop();
  await start();
  await until(() => uploads === 2);
  assert.equal(
    database.prepare('SELECT COUNT(*) n FROM usage_events').get().n,
    3,
  );
  assert.equal(
    database
      .prepare(
        "SELECT SUM(quantity) n FROM usage_events WHERE metric='video_export'",
      )
      .get().n,
    1,
  );
  await new Promise((r) => setTimeout(r, 150));
  await stop();
  console.log(
    'PASS Miniflare D1 business+export -> backend IPC -> central: lost ACK then process restart resends without duplicates.',
  );
} finally {
  await stop();
  database.close();
}
