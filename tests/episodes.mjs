// Run after tests/core.mjs; optionally pass a real episodes JSON file.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  parseShots,
  parseStoryboardImport,
  applyStoryboardImport,
  exportStoryboard,
  shotTemplate,
  legacyShotTemplate,
} from '../work/test/director.mjs';
import { newProject, validateProject } from '../work/test/studio.mjs';

const episode = (n) => ({
  video_id: String(n),
  scene_name: '庭院',
  characters: ['小林'],
  total_duration: 10,
  source_refs: ['原文第1段'],
  generation_prompt: '保持画风统一',
  role_ids: ['@role_lin'],
  scene_ids: ['@scene_yard'],
  prop_ids: [],
  shots: [
    {
      shot_id: '1',
      time_start: 0,
      time_end: 4,
      camera: '近景固定',
      visual: '小林 ( @role_lin ) 推门。',
      audio: '小林：“回来了。”；音效：开门声。',
    },
    {
      shot_id: '2',
      time_start: 4,
      time_end: 10,
      camera: '中景跟随',
      visual: '小林走入庭院 ( @scene_yard )。',
      audio: '脚步声、风声。',
    },
  ],
});
const data = {
  episodes: Array.from({ length: 26 }, (_, i) => episode(i + 1)),
  missing_roles: [
    {
      role_id: '@role_lin',
      role_name: '小林',
      description: '青年，蓝衣',
      visual_style: '动漫',
    },
  ],
  missing_scenes: [
    { scene_id: '@scene_yard', scene_name: '庭院', description: '木门朝南' },
  ],
  missing_props: [],
};
const stringify = (d) => JSON.stringify(d);
assert.equal(parseShots(stringify(shotTemplate)).length, 1);
assert.equal(parseStoryboardImport(stringify(shotTemplate)).subshotCount, 2);
assert.equal(parseShots(stringify(shotTemplate))[0].duration, 10);
assert.equal(parseShots(stringify(legacyShotTemplate)).length, 1);
const imported = parseStoryboardImport(stringify(data));
assert.equal(imported.shots.length, 26);
assert.equal(imported.subshotCount, 52);
assert.equal(imported.shots[0].lines[0].start, 0);
assert.equal(imported.shots[0].lines[0].end, 4);
assert.equal(
  imported.shots.reduce((n, s) => n + s.duration, 0),
  260,
);
assert.equal(imported.assets.length, 2);
for (const s of imported.shots) {
  assert.ok(s.prompt.includes('保持画风统一'));
  assert.ok(s.description.includes('原文第1段'));
  for (const sub of data.episodes[0].shots) {
    for (const field of ['camera', 'visual', 'audio'])
      assert.ok(s.prompt.includes(sub[field]));
    assert.ok(s.description.includes(sub.audio),'full sound design stays in the timeline');
  }
  assert.equal(s.lines.length,1);
  assert.equal(s.lines[0].speaker,'小林');
  assert.equal(s.dialogue,'回来了。');
  assert(!s.dialogue.includes('音效'));
}
const p = newProject();
const before = stringify(p);
const applied = applyStoryboardImport(p, stringify(data), 'replace');
assert.equal(
  stringify(p),
  before,
  'import must not mutate project before approval',
);
assert.equal(applied.shots.length, 26);
assert.ok(applied.assets.every((a) => a.inLibrary === false));
assert.ok(applied.shots.every((s) => s.references.length === 2));
applied.assets[0].description = '用户编辑过的角色';
const imageId = crypto.randomUUID();
applied.assets[0].image = {
  id: imageId,
  url: `/api/media/${imageId}`,
  name: '已有图片',
  type: 'image/png',
};
const appended = applyStoryboardImport(applied, stringify(data), 'append');
assert.equal(appended.shots.length, 52);
assert.equal(appended.assets.length, 2);
assert.equal(appended.assets[0].id, applied.assets[0].id);
assert.equal(appended.assets[0].description, '用户编辑过的角色');
assert.deepEqual(appended.assets[0].image, applied.assets[0].image);
validateProject(JSON.parse(stringify(appended)));
const exported = exportStoryboard(appended);
const restored = applyStoryboardImport(
  newProject(),
  stringify(exported),
  'replace',
);
assert.equal(restored.shots.length, 52);
assert.equal(restored.assets.length, 2);
assert.deepEqual(
  restored.shots.map((s) => [s.duration, s.description, s.prompt, s.dialogue]),
  appended.shots.map((s) => [s.duration, s.description, s.prompt, s.dialogue]),
);
assert.ok(!stringify(exported).includes('/api/media/'));
assert.ok(!stringify(exported).includes(imageId));
assert.ok(restored.shots.every((s) => s.references.length === 2));
const edited = structuredClone(appended);
edited.shots[0].dialogue = '编辑后的新台词';
edited.shots[0].lines = [
  {
    id: 'old',
    kind: '台词',
    speaker: '小林',
    emotion: '',
    voiceName: '',
    text: '旧台词',
  },
];
assert.equal(
  parseShots(stringify(exportStoryboard(edited)))[0].dialogue,
  '编辑后的新台词',
);
assert.equal(
  parseShots(stringify({ shots: [{ title: '旧格式', duration: 8 }] })).length,
  1,
);
assert.equal(parseShots(stringify([{ title: '数组格式' }])).length, 1);
assert.throws(() => parseShots('{"unknown":[]}'), /未识别/);
assert.throws(() => parseShots(stringify({ ...data, episodes: [] })), /非空/);
assert.throws(() => parseShots(stringify({ ...data, shots: [] })), /不能同时/);
assert.throws(
  () =>
    parseShots(
      stringify({
        ...data,
        episodes: Array.from({ length: 201 }, (_, i) => episode(i)),
      }),
    ),
  /201.*200/,
);
assert.equal(
  parseStoryboardImport(
    stringify({
      ...data,
      episodes: Array.from({ length: 110 }, (_, i) => episode(i)),
    }),
  ).subshotCount,
  220,
);
for (const mutate of [
  (d) => (d.episodes[0].shots[1].time_start = 3),
  (d) => (d.episodes[0].shots[1].time_start = 5),
  (d) => (d.episodes[0].shots[1].time_end = 11),
  (d) => (d.episodes[0].shots[1].time_end = 9),
  (d) => (d.episodes[0].shots[1].time_end = '10'),
  (d) => (d.episodes[1].video_id = '1'),
  (d) => (d.episodes[0].shots[1].shot_id = '1'),
]) {
  const invalid = structuredClone(data);
  mutate(invalid);
  assert.throws(() => applyStoryboardImport(p, stringify(invalid), 'replace'));
  assert.equal(stringify(p), before);
}
if (process.argv[2]) {
  const raw = await fs.readFile(process.argv[2], 'utf8');
  const original = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const result = parseStoryboardImport(raw);
  assert.equal(result.shots.length, original.episodes.length);
  assert.equal(result.shots.length, 26);
  assert.equal(result.subshotCount, 53);
  assert.equal(
    result.shots.reduce((n, s) => n + s.duration, 0),
    260,
  );
  original.episodes.forEach((e, i) =>
    e.shots.forEach((sub) => {
      for (const key of ['camera', 'visual', 'audio'])
        assert.ok(
          result.shots[i].prompt.includes(sub[key]),
          `${i + 1}: missing ${key}`,
        );
    }),
  );
  const saved = JSON.parse(
    stringify(applyStoryboardImport(newProject(), raw, 'replace')),
  );
  validateProject(saved);
  assert.equal(saved.shots.length, 26);
  const roundtrip = applyStoryboardImport(
    newProject(),
    stringify(exportStoryboard(saved)),
    'replace',
  );
  assert.equal(roundtrip.shots.length, 26);
  assert.equal(
    roundtrip.shots.reduce((n, s) => n + s.duration, 0),
    260,
  );
  assert.deepEqual(
    roundtrip.shots.map((s) => [s.description, s.prompt, s.dialogue]),
    saved.shots.map((s) => [s.description, s.prompt, s.dialogue]),
  );
  assert.deepEqual(
    roundtrip.assets.map((a) => [a.kind, a.name, a.description]),
    saved.assets.map((a) => [a.kind, a.name, a.description]),
  );
  console.log(
    `User file passed: 26 segments, 53 subshots, 260 seconds, ${saved.assets.length} project assets; round-trip valid.`,
  );
}
console.log(
  'Episode import, legacy formats, timing validation, limits, asset merge and round-trip passed.',
);
