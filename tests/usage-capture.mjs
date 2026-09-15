import { openStore } from '../services/access-control/src/store.ts';
import { AccessService } from '../services/access-control/src/service.ts';
import { createHandler } from '../services/access-control/src/http.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { UsageOutbox } = require('../desktop/usage-outbox.cjs');
const centralDB = openStore(':memory:');
const service = new AccessService(centralDB);
await service.bootstrap('test-admin', 'Admin-fixture-2026');
const admin = await service.login(
  'test-admin',
  'Admin-fixture-2026',
  'desktop',
);
const member = await service.createMember(admin.token, {
  account: 'test-member',
  key: 'Member-fixture-2026',
  expires_at: Date.now() + 86400000,
  reason: 'test',
});
const session = await service.login(
  'test-member',
  'Member-fixture-2026',
  'desktop',
);
const handler = createHandler(service);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-capture-'));
const db = new DatabaseSync(':memory:');
for (const file of (await fs.readdir('drizzle'))
  .filter((f) => f.endsWith('.sql'))
  .sort())
  db.exec(
    (await fs.readFile('drizzle/' + file, 'utf8')).replaceAll(
      '--> statement-breakpoint',
      '',
    ),
  );
function prepare(sql) {
  const st = db.prepare(sql);
  const build = (args = []) => ({
    bind: (...a) => build(a),
    run: async () => ({ meta: { changes: Number(st.run(...args).changes) } }),
    all: async () => ({ results: st.all(...args) }),
    first: async () => st.get(...args),
  });
  return build();
}
const D1 = {
  prepare,
  batch: async (statements) => {
    db.exec('BEGIN');
    try {
      const results = [];
      for (const s of statements) results.push(await s.run());
      db.exec('COMMIT');
      return results;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  },
};
globalThis.FixedLengthStream = class extends TransformStream {
  constructor() {
    super();
  }
};
const bucket = new Map();
globalThis.__usageEnv = {
  DB: D1,
  FILES: {
    put: async (id, bytes) => {
      bucket.set(id, await new Response(bytes).arrayBuffer());
    },
  },
  DESKTOP_OWNER_ID: member.id,
  DESKTOP_OWNER_ROLE: 'member',
};
let upstream = {
  choices: [{ finish_reason: 'stop', message: { content: '完整的剧本' } }],
};
let modelCalls = 0;
globalThis.__textRequest = async () => {
  modelCalls++;
  return Response.json(upstream);
};
globalThis.__modelRequest = async () =>
  Response.json({ data: [{ b64_json: btoa('image-bytes') }] });
await fs.writeFile(
  path.join(root, 'env.mjs'),
  'export const env=globalThis.__usageEnv;',
);
await fs.writeFile(
  path.join(root, 'model-server.mjs'),
  `export const textRequest=(...args)=>globalThis.__textRequest(...args);export const config=async()=>({});export const readyConfig=async()=>({id:'test',kind:'image',protocol:'images',model:'test',enabled:true,hasKey:true,apiKey:'fixture'});export const modelRequest=(...args)=>globalThis.__modelRequest(...args);`,
);
const compiled = new Map();
async function compile(filename) {
  filename = path.resolve(filename);
  if (compiled.has(filename)) return compiled.get(filename);
  const target = path.join(root, String(compiled.size) + '.mjs');
  compiled.set(filename, target);
  let source = ts.transpileModule(await fs.readFile(filename, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  }).outputText;
  const imports = [...source.matchAll(/from\s*['"]([^'"]+)['"]/g)];
  for (const match of imports) {
    let resolved;
    if (match[1] === 'cloudflare:workers')
      resolved = path.join(root, 'env.mjs');
    else if (match[1].endsWith('model-server'))
      resolved = path.join(root, 'model-server.mjs');
    else if (match[1].startsWith('@/') || match[1].startsWith('.'))
      resolved = await compile(
        (match[1].startsWith('@/')
          ? path.resolve(match[1].slice(2))
          : path.resolve(path.dirname(filename), match[1])) + '.ts',
      );
    if (resolved)
      source = source.replace(
        match[0],
        `from '${pathToFileURL(resolved).href}'`,
      );
  }
  await fs.writeFile(target, source);
  return target;
}
const load = async (filename) =>
  import(pathToFileURL(await compile(filename)).href);
const { exampleProject } = await load('lib/studio.ts');
const projects = await load('app/api/projects/route.ts');
const ai = await load('app/api/ai/route.ts');
const media = await load('app/api/media/route.ts');
const old = {
  ...exampleProject(),
  id: '11111111-1111-4111-8111-111111111111',
  brief: '旧创意',
  revision: 1,
};
db.prepare('INSERT INTO projects VALUES(?,?,?,?,?)').run(
  old.id,
  old.title,
  JSON.stringify(old),
  1,
  new Date().toISOString(),
);
const outbox = new UsageOutbox(D1, { id: member.id, role: 'member' });
await outbox.init();
const post = (body, headers = {}) =>
  new Request('http://localhost/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
let p = {
  ...exampleProject(),
  id: '22222222-2222-4222-8222-222222222222',
  revision: 0,
  brief: '',
};
let response = await projects.POST(post(p));
assert.equal(response.status, 200, await response.clone().text());
p = await response.json();
assert.equal(
  db
    .prepare(
      "SELECT state FROM desktop_usage_events WHERE event_id='idea:22222222-2222-4222-8222-222222222222'",
    )
    .get().state,
  'waiting_idea',
);
response = await projects.POST(post({ ...p, brief: '新创意' }));
assert.equal(response.status, 200, await response.clone().text());
p = await response.json();
response = await projects.POST(post({ ...p, brief: '改写' }));
assert.equal(response.status, 200);
assert.equal((await projects.POST(post(p))).status, 409);
assert.equal((await projects.POST(post(old))).status, 200);
assert.equal(
  (
    await projects.POST(
      post(
        {
          ...exampleProject(),
          id: '33333333-3333-4333-8333-333333333333',
          revision: 0,
        },
        { 'x-director-import': '1' },
      ),
    )
  ).status,
  200,
);
assert.equal(
  db
    .prepare(
      "SELECT SUM(quantity) n FROM desktop_usage_events WHERE metric='idea' AND state='pending'",
    )
    .get().n,
  1,
);
const plans = Array.from({ length: 3 }, (_, i) => ({
  title: '方案' + i,
  summary: '梗概',
  content: '完整故事' + i,
  tags: [],
}));
upstream = {
  choices: [
    { finish_reason: 'stop', message: { content: JSON.stringify({ plans }) } },
  ],
};
assert.equal(
  (await ai.POST(post({ task: 'storyOptions', content: '创意' }))).status,
  200,
);
upstream = {
  choices: [{ finish_reason: 'length', message: { content: '截断' } }],
};
assert.equal(
  (await ai.POST(post({ task: 'story', content: '创意' }))).status,
  502,
);
upstream = {
  choices: [{ finish_reason: 'stop', message: { content: '不合法json' } }],
};
assert.equal(
  (await ai.POST(post({ task: 'storyOptions', content: '创意' }))).status,
  422,
);
upstream = {
  choices: [{ finish_reason: 'stop', message: { content: '完整剧本' } }],
};
assert.equal(
  (await ai.POST(post({ task: 'script', content: '故事' }))).status,
  200,
);
const upload = () => {
  const form = new FormData();
  form.set(
    'file',
    new File(['video-content'], 'video.mp4', { type: 'video/mp4' }),
  );
  form.set('operation_id', 'doubao:job-1');
  return media.POST(
    new Request('http://localhost/api/media', { method: 'POST', body: form }),
  );
};
const first = await (await upload()).json(),
  second = await (await upload()).json();
assert.equal(first.id, second.id);
const { submitJob, refreshJob } = await load('lib/generation-server.ts');
const job = await submitJob(
  {
    projectId: '22222222-2222-4222-8222-222222222222',
    targetId: 'shot-1',
    target: 'image',
    prompt: '生成图片',
    referenceIds: [],
    size: '1024x1024',
    ratio: '16:9',
    duration: 5,
    resolution: '720p',
  },
  'job-image',
);
assert.equal(job.status, 'succeeded', job.error);
await submitJob(
  {
    projectId: '22222222-2222-4222-8222-222222222222',
    targetId: 'shot-1',
    target: 'image',
    prompt: '生成图片',
    referenceIds: [],
    size: '1024x1024',
    ratio: '16:9',
    duration: 5,
    resolution: '720p',
  },
  'job-image',
);
await refreshJob('job-image');
const { submitSpeech } = await load('lib/speech-server.ts');
globalThis.__modelRequest = async () =>
  new Response('audio-content', { headers: { 'content-type': 'audio/mpeg' } });
const speechInput = {
  projectId: '22222222-2222-4222-8222-222222222222',
  targetId: 'shot-1',
  lineId: 'line-1',
  text: '台词',
  voice: 'voice',
  speed: 1,
};
assert.equal(
  (await submitSpeech(speechInput, 'job-speech')).status,
  'succeeded',
);
await submitSpeech(speechInput, 'job-speech');
const totals = Object.fromEntries(
  db
    .prepare(
      "SELECT metric,SUM(quantity) n FROM desktop_usage_events WHERE state='pending' GROUP BY metric",
    )
    .all()
    .map((r) => [r.metric, r.n]),
);
assert.deepEqual(totals, { asset: 3, idea: 1, script: 1, story: 3 });
assert.equal(modelCalls, 4);
assert.ok(
  !JSON.stringify(
    db.prepare('SELECT * FROM desktop_usage_events').all(),
  ).includes('完整剧本'),
);
// Local transaction failure cannot leave a successful project without its event.
db.exec(
  "CREATE TRIGGER reject_usage BEFORE INSERT ON desktop_usage_events WHEN NEW.event_id='idea:44444444-4444-4444-8444-444444444444' BEGIN SELECT RAISE(ABORT,'fixture'); END;",
);
assert.equal(
  (
    await projects.POST(
      post({
        ...exampleProject(),
        id: '44444444-4444-4444-8444-444444444444',
        revision: 0,
      }),
    )
  ).status,
  400,
);
assert.equal(
  db
    .prepare(
      "SELECT id FROM projects WHERE id='44444444-4444-4444-8444-444444444444'",
    )
    .get(),
  undefined,
);
const { exportVideo } = require('../desktop/video-files.cjs');
const videoOptions = {
  videosDir: root,
  origin: 'http://localhost',
  token: 'test',
  fetchVideo: async () =>
    new Response('video-bytes', { headers: { 'content-type': 'video/mp4' } }),
  journal: {
    begin: (event, details) => outbox.record(event, 'file_pending', details),
    complete: (id, created) => outbox.complete(id, created),
  },
};
const videoInput = { projectId: member.id, mediaId: first.id, name: 'shot' };
assert.equal((await exportVideo(videoInput, videoOptions)).created, true);
assert.equal((await exportVideo(videoInput, videoOptions)).created, false);
let lost = true;
const uploadEvents = async (events) => {
  const r = await handler(
    new Request('http://localhost/usage/events', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + session.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ events }),
    }),
    '127.0.0.1',
  );
  assert.equal(r.status, 200, await r.clone().text());
  const result = await r.json();
  if (lost) {
    lost = false;
    throw Error('lost acknowledgement');
  }
  return result;
};
await outbox.flush(uploadEvents);
assert.equal(
  db
    .prepare(
      "SELECT COUNT(*) n FROM desktop_usage_events WHERE state='pending'",
    )
    .get().n,
  9,
);
await outbox.flush(uploadEvents);
assert.equal(
  db
    .prepare(
      "SELECT COUNT(*) n FROM desktop_usage_events WHERE state='pending'",
    )
    .get().n,
  0,
);
const get = async (route) =>
  (
    await handler(
      new Request('http://localhost' + route, {
        headers: { authorization: 'Bearer ' + admin.token },
      }),
      '127.0.0.1',
    )
  ).json();
const overview = await get('/admin/overview'),
  detail = await get('/admin/users/' + member.id + '/usage');
assert.deepEqual(overview.today, {
  idea: 1,
  story: 3,
  script: 1,
  asset: 3,
  video_export: 1,
  shot: 1,
  final: 0,
});
assert.deepEqual(detail.totals, overview.today);
assert.equal(detail.items.length, 9);
assert.ok(detail.last_received_at);
centralDB.close();
console.log(
  'PASS five actual capture paths + central HTTP:  legacy/import exclusion, first nonempty idea, save conflict, 3 stories, incomplete rejection, script, stable Doubao/image media, atomic event failure.',
);
db.close();
