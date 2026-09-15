import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import path from 'node:path';
const root = process.cwd();
await fs.mkdir('work/test', { recursive: true });
for (const name of [
  'studio',
  'creative',
  'dialogue-timeline',
  'export',
  'director',
  'assets',
  'dialogue',
  'prompt-rich',
  'frame-reference',
  'storyboard-episodes',
  'storyboard-contract',
]) {
  const src = await fs.readFile(`lib/${name}.ts`, 'utf8');
  const js = ts
    .transpileModule(src, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    })
    .outputText.replace("'./dialogue-timeline'", "'./dialogue-timeline.mjs'")
    .replace("'./studio'", "'./studio.mjs'")
    .replace("'./assets'", "'./assets.mjs'")
    .replace("'./storyboard-episodes'", "'./storyboard-episodes.mjs'")
    .replace("'./storyboard-contract'", "'./storyboard-contract.mjs'")
    .replace("'./dialogue'", "'./dialogue.mjs'");
  await fs.writeFile(`work/test/${name}.mjs`, js);
}
const { exampleProject, validateProject, subtitle, continuity } = await import(
  pathToFileURL(path.join(root, 'work/test/studio.mjs')).href
);
const { zip } = await import(
  pathToFileURL(path.join(root, 'work/test/export.mjs')).href
);
const p = exampleProject();
const { parseShots, validateChanges, applyChanges, undoLast, builtinSkills } =
  await import(pathToFileURL(path.join(root, 'work/test/director.mjs')).href);
const imported = parseShots(
  JSON.stringify({
    shots: [
      {
        id: 'untrusted-id',
        title: '夜景',
        duration: 4,
        video: { url: 'https://example.com' },
      },
    ],
  }),
);
assert.equal(imported.length, 1);
assert.notEqual(imported[0].id, 'untrusted-id');
assert.equal(imported[0].video, undefined);
assert.throws(() => parseShots('{broken'));
assert.equal(
  parseShots(
    '```json\n{"shots":[{"title":"x","description":"line1\nline2","dialogue":"保留对白","lines":[],},]}\n```',
  )[0].dialogue,
  '保留对白',
);
assert.equal(
  parseShots('[{"title":"x","description":"保留逗号,] 和转义引号\\\"",}]')[0]
    .description,
  '保留逗号,] 和转义引号"',
);
assert.throws(() => parseShots('{"shots":[{"title":"截断'));
assert.throws(() => parseShots('[{"title":"x","duration":"5"}]'));
assert.throws(() => parseShots('[{}]'));
const before = exampleProject();
before.shots[0].video = {
  id: before.id,
  url: `/api/media/${before.id}`,
  type: 'video/mp4',
  name: 'test.mp4',
};
const change = {
  target: 'project',
  id: before.id,
  field: 'story',
  before: before.story,
  after: '雨夜，小猫找到朋友。',
  reason: '用户要求改为雨夜',
};
const applied = applyChanges(before, [change], '修改雨夜', builtinSkills[1]);
assert.equal(before.story, change.before);
assert.equal(applied.story, change.after);
assert.equal(applied.shots[0].video.id, before.id);
assert.ok(applied.shots[0].reviewRequired);
assert.equal(applied.changeLog[0].skill.version, builtinSkills[1].version);
assert.equal(undoLast(applied).story, before.story);
assert.throws(() => undoLast({ ...applied, story: '后续手动修改' }));
assert.throws(() =>
  validateChanges(before, { changes: [{ ...change, field: '__proto__' }] }),
);
assert.throws(() =>
  validateChanges(before, { changes: [{ ...change, before: '错误原文' }] }),
);
assert.throws(() => validateChanges(before, { changes: [change, change] }));
const shotChange = {
  target: 'shot',
  id: before.shots[0].id,
  field: 'dialogue',
  before: before.shots[0].dialogue,
  after: '我们出发。',
  reason: '修改台词',
};
const partial = applyChanges(before, [shotChange], '只改台词');
assert.equal(partial.story, before.story);
assert.equal(partial.shots[1].reviewRequired, undefined);
assert.ok(partial.shots[0].reviewRequired);
console.log(
  'PASS: JSON import boundaries, linked patch whitelist, partial apply, media preservation, audit snapshot, safe undo/stale rejection',
);
assert.equal(validateProject(p), p);
assert.match(subtitle(p), /00:00:05,000 --> 00:00:09,000/);
p.shots[0].enabled = false;
assert.match(subtitle(p), /00:00:00,000 --> 00:00:04,000/);
assert.throws(() => validateProject({ ...p, ratio: 'unknown' }));
assert.throws(() =>
  validateProject({ ...p, shots: [{ ...p.shots[0], duration: -1 }] }),
);
assert.throws(() =>
  validateProject({
    ...p,
    assets: [
      {
        ...p.assets[0],
        image: {
          id: p.id,
          url: 'https://example.com',
          type: 'image/png',
          name: 'x',
        },
      },
    ],
  }),
);
p.shots[0].references = ['missing'];
assert.ok(continuity(p).some((x) => x.includes('失效')));
await fs.writeFile(
  'work/test/archive.zip',
  Buffer.from(
    await zip([
      { name: '测试.txt', data: new TextEncoder().encode('字幕与镜头') },
    ]).arrayBuffer(),
  ),
);
console.log(
  'PASS: project validation, subtitle timing, missing references, ZIP generation',
);
if (process.argv.includes('--api')) {
  const base = 'http://localhost:3000';
  const candidate = exampleProject();
  candidate.title = 'API integration test';
  const save = () =>
    fetch(base + '/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidate),
    });
  const first = await save();
  assert.equal(first.status, 200);
  const saved = await first.json();
  assert.equal(saved.revision, 1);
  assert.equal((await save()).status, 409);
  const list = await (await fetch(base + '/api/projects')).json();
  assert.ok(list.some((x) => x.id === candidate.id && x.revision === 1));
  const invalid = await fetch(base + '/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...candidate,
      shots: [{ ...candidate.shots[0], duration: -1 }],
    }),
  });
  assert.equal(invalid.status, 400);
  const cross = await fetch(base + '/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://evil.example',
    },
    body: JSON.stringify(candidate),
  });
  assert.ok([400, 403].includes(cross.status));
  const form = new FormData();
  form.set(
    'file',
    new File(
      [
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=',
          'base64',
        ),
      ],
      'test.png',
      { type: 'image/png' },
    ),
  );
  const upload = await fetch(base + '/api/media', {
    method: 'POST',
    body: form,
  });
  assert.equal(upload.status, 200);
  const media = await upload.json();
  const range = await fetch(base + media.url, {
    headers: { Range: 'bytes=0-7' },
  });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 8);
  const ai = await fetch(base + '/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'story', content: '测试' }),
  });
  assert.equal(ai.status, 503);
  await fs.writeFile(
    'work/test/cleanup.sql',
    `DELETE FROM projects WHERE id='${candidate.id}';\nDELETE FROM media WHERE id='${media.id}';`,
  );
  console.log(
    'PASS: persistent save/read, optimistic conflict, invalid input, cross-origin rejection, media upload/range, missing-key guard',
  );
}
