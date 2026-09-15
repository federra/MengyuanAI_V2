// Run core.mjs first to transpile source modules.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  explicitAssets,
  parseAssetDrafts,
  mergeScriptAssets,
  matchShotAssets,
} from '../work/test/assets.mjs';
import {
  newProject,
  newShot,
  validateProject,
  id,
} from '../work/test/studio.mjs';
import { parseShots } from '../work/test/director.mjs';
const p = newProject('资产测试');
p.script =
  '人物：小林；道具：信件；场景：车站；服饰：蓝色外套；声音：雨声\n小林：“我回来了。”';
const drafts = explicitAssets(p.script);
assert.deepEqual(
  new Set(drafts.map((a) => a.kind)),
  new Set(['人物', '道具', '场景', '服饰', '声音']),
);
assert.equal(drafts.filter((a) => a.name === '小林').length, 1);
assert.ok(drafts.some((a) => a.name === '小林配音'));
assert.throws(() =>
  parseAssetDrafts(
    {
      assets: [
        { kind: '人物', name: '小王', description: '', evidence: '不存在' },
      ],
    },
    p.script,
  ),
);
assert.throws(() =>
  parseAssetDrafts({ assets: [{ ...drafts[0], kind: '随意类型' }] }, p.script),
);
const clothing = {
  id: id(),
  kind: '服饰',
  name: '蓝色外套',
  description: '用户手工设定',
  image: { id: id(), url: '', name: '服装.png', type: 'image/png' },
};
clothing.image.url = '/api/media/' + clothing.image.id;
p.assets = [clothing];
p.shots = [
  {
    ...newShot(),
    character: '小林',
    dialogue: '我回来了',
    description: '车站，小林拿着信件',
    assetNames: [
      { kind: '服饰', name: '蓝色外套' },
      { kind: '声音', name: '雨声' },
    ],
  },
];
drafts.find((a) => a.kind === '服饰').description = '剧本建议设定';
const merged = mergeScriptAssets(p, drafts, 'model');
assert.equal(merged.assets.find((a) => a.kind === '服饰').id, clothing.id);
assert.deepEqual(
  merged.assets.find((a) => a.kind === '服饰').image,
  clothing.image,
);
assert.equal(
  merged.assets.find((a) => a.kind === '服饰').description,
  '用户手工设定',
);
assert.equal(
  merged.assets.find((a) => a.kind === '服饰').suggestedDescription,
  '剧本建议设定',
);
assert.equal(merged.shots[0].references.length, 6);
assert.equal(
  mergeScriptAssets(merged, drafts, 'model').assets.length,
  merged.assets.length,
);
assert.equal(
  matchShotAssets(merged.shots[0], merged.assets).references.length,
  6,
);
const changed = mergeScriptAssets(
  { ...merged, script: '人物：小林' },
  explicitAssets('人物：小林'),
  'labels',
);
assert.ok(changed.shots[0].reviewRequired);
assert.equal(changed.assets.length, merged.assets.length);
validateProject(changed);
const imported = parseShots(
  JSON.stringify([
    {
      title: '小林',
      assetNames: [{ kind: '服饰', name: '蓝色外套', id: 'ignored' }],
    },
  ]),
);
assert.deepEqual(imported[0].assetNames, [{ kind: '服饰', name: '蓝色外套' }]);
assert.ok(
  matchShotAssets(imported[0], merged.assets).references.includes(clothing.id),
);
assert.throws(() =>
  parseShots(
    JSON.stringify([{ title: 'x', assetNames: [{ kind: '错', name: 'x' }] }]),
  ),
);
assert.throws(() =>
  validateProject({
    ...merged,
    assets: [
      {
        ...clothing,
        audio: { ...clothing.image, url: 'https://external.invalid' },
      },
    ],
  }),
);
console.log(
  'PASS: five-category extraction, evidence validation, stable IDs/media, non-destructive merge, six shot references, JSON matching, stale script review, persisted schema',
);
if (process.argv.includes('--api')) {
  const base='http://localhost:3000';
  const candidate={...merged,assets:merged.assets.map(({image:_image,...a})=>a)};
  const response=await fetch(base+'/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(candidate)});
  assert.equal(response.status,200);
  await fs.writeFile('work/test/assets-cleanup.sql',`DELETE FROM projects WHERE id='${candidate.id}';`);
  const saved=await response.json();
  const projects=await (await fetch(base+'/api/projects')).json();
  assert.deepEqual(projects.find(p=>p.id===saved.id).shots[0].assetNames,candidate.shots[0].assetNames);
  assert.equal(projects.find(p=>p.id===saved.id).assetScript,candidate.script);
  const missing=await fetch(base+'/api/assets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({script:candidate.script})});
  assert.equal(missing.status,503);
  const invalid=await fetch(base+'/api/assets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({script:55})});
  assert.equal(invalid.status,400);
  console.log('PASS: persisted asset classification and references; extraction missing-key and invalid-input guards');
}
