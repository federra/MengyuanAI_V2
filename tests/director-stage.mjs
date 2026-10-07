import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = path.resolve('work/test');
await fs.mkdir(dir, { recursive: true });
try {
  const source = await fs.readFile('lib/director-stage.ts', 'utf8');
  await fs.writeFile(path.join(dir, 'director-stage.mjs'), ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText.replaceAll("'./studio'", "'./studio.mjs'").replaceAll("'./director'", "'./director.mjs'"));
  const { stageContext, assertStageChanges, selectionSource, selectionChanges, applyStageChanges, undoStageChanges, dialogueSelectionOffset } = await import(pathToFileURL(path.join(dir, 'director-stage.mjs')));
  const project = {
    id: 'project-1', title: '测试', brief: '创意', story: '故事', script: '剧本', scenes: '分场',
    shots: [{ id: 'shot-1', title: '镜头', prompt: '提示词', dialogue: '台词', video: { url: 'secret' } }],
    assets: [{ id: 'asset-1', name: '角色', description: '外形', image: { url: 'secret' } }],
  };
  assert.deepEqual(stageContext(project, '故事'), { projectId: 'project-1', content: '故事' });
  assert.equal(stageContext(project, '分镜').shots[0].video, undefined);
  assert.equal(stageContext(project, '资产').assets[0].image, undefined);
  const storyChange = { target: 'project', id: 'project-1', field: 'story' };
  const shotChange = { target: 'shot', id: 'shot-1', field: 'prompt' };
  const assetChange = { target: 'asset', id: 'asset-1', field: 'description' };
  assert.doesNotThrow(() => assertStageChanges('故事', [storyChange]));
  assert.doesNotThrow(() => assertStageChanges('分镜', [shotChange]));
  assert.doesNotThrow(() => assertStageChanges('资产', [assetChange]));
  assert.throws(() => assertStageChanges('故事', [shotChange]), /超出当前环节/);
  assert.throws(() => assertStageChanges('分镜', [assetChange]), /超出当前环节/);
  assert.throws(() => assertStageChanges('剪辑', [storyChange]), /超出当前环节/);
  const { exampleProject } = await import(pathToFileURL(path.join(dir, 'studio.mjs')));
  const actual = exampleProject();
  actual.story = '前文不改。雨落下来。后文不改。雨落下来。';
  const selected = { target: 'project', id: actual.id, field: 'story', start: 5, end: 10, text: '雨落下来。' };
  assert.equal(selectionSource(actual, '故事', selected), actual.story);
  const changes = selectionChanges(actual, '故事', selected, '雪飘下来。');
  assert.equal(changes[0].after, '前文不改。雪飘下来。后文不改。雨落下来。');
  assert.throws(() => selectionSource(actual, '故事', { ...selected, start: 0 }), /选中片段已变化/);
  assert.throws(() => selectionSource(actual, '剧本', selected), /超出当前环节/);
  assert.throws(() => selectionSource(actual, '故事', { ...selected, id: 'other-project' }));
  const applied = applyStageChanges(actual, '故事', changes, '改成雪', selected);
  assert.equal(applied.story, changes[0].after);
  assert.deepEqual(applied.shots, actual.shots);
  assert.deepEqual(applied.assets, actual.assets);
  assert.equal(applied.script, actual.script);
  const restoredStory = undoStageChanges(applied, '故事', { recordId: applied.changeLog.at(-1).id, changes });
  assert.equal(restoredStory.story, actual.story);
  assert.deepEqual(restoredStory.shots, actual.shots, 'undo must not flag other stages for review');
  assert.throws(() => applyStageChanges({ ...actual, story: '手动编辑过' }, '故事', changes, '改成雪'), /修改前/);
  actual.shots[0].description = '开头街角结尾'; actual.shots[0].prompt = '开头街角结尾';
  const visual = { target: 'shot', id: actual.shots[0].id, field: 'visual', start: 2, end: 4, text: '街角' };
  const visualChanges = selectionChanges(actual, '分镜', visual, '钟楼');
  const edited = applyStageChanges(actual, '分镜', visualChanges, '改位置', visual);
  assert.equal(edited.shots[0].description, '开头钟楼结尾');
  assert.equal(edited.shots[0].prompt, '开头钟楼结尾');
  assert.deepEqual(edited.shots[1], actual.shots[1]);
  assert.equal(edited.story, actual.story);
  const audio = { id: actual.id, name: '保留.wav', type: 'audio/wav', url: '/api/media/' + actual.id };
  actual.shots[0].dialogue = '第一句。\n第二句。';
  actual.shots[0].lines = [
    { id: actual.shots[0].id, kind: '台词', speaker: '哈基米', emotion: '平静', voiceName: '', text: '第一句。', audio },
    { id: actual.shots[1].id, kind: '台词', speaker: '哈基米', emotion: '平静', voiceName: '', text: '第二句。', audio },
  ];
  const dialogue = { target: 'shot', id: actual.shots[0].id, field: 'dialogue', start: 0, end: 3, text: '第一句' };
  const lineChanges = selectionChanges(actual, '分镜', dialogue, '改好的第一句');
  const dubbed = applyStageChanges(actual, '分镜', lineChanges, '修改第一句', dialogue);
  assert.equal(dubbed.shots[0].lines[0].text, '改好的第一句。');
  assert.equal(dubbed.shots[0].lines[0].audio, undefined);
  assert.deepEqual(dubbed.shots[0].lines[1], actual.shots[0].lines[1]);
  const undoAction = { recordId: dubbed.changeLog.at(-1).id, changes: lineChanges,
    shotSnapshots: [{ before: actual.shots[0], after: dubbed.shots[0] }] };
  const undone = undoStageChanges(dubbed, '分镜', undoAction);
  assert.deepEqual(undone.shots, actual.shots, 'undo restores dialogue metadata and both audio references');
  const later = structuredClone(dubbed); later.shots[0].video = audio;
  assert.throws(() => undoStageChanges(later, '分镜', undoAction), /分镜已有后续修改/);
  const repeated = { ...actual.shots[0], dialogue: '重复句。\n重复句。', lines: [
    { ...actual.shots[0].lines[0], text: '重复句。' }, { ...actual.shots[0].lines[1], text: '重复句。' },
  ] };
  assert.equal(dialogueSelectionOffset(repeated, 1, '重复句。'), 5, 'consistent lines locate the second identical dialogue');
  const stale = { ...repeated, lines: actual.shots[0].lines };
  assert.equal(dialogueSelectionOffset(stale, 1, '重复句。'), null, 'stale lines cannot identify repeated text safely');
  assert.equal(dialogueSelectionOffset({ ...stale, dialogue: '第一句。\n唯一句。' }, 1, '唯一句。'), 5);
  console.log('PASS: current-stage scope, selected-range replacement, stale rejection, prompt and dialogue preservation');
} finally {
  // Shared transpiled fixtures are ignored by Git.
}
