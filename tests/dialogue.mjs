import assert from 'node:assert/strict';
import {
  newProject,
  newShot,
  validateProject,
  compilePrompt,
  shotVisualText,
  subtitle,
  id,
} from '../work/test/studio.mjs';
import { parseShots } from '../work/test/director.mjs';
import {
  dialogueLines,
  dialogueText,
  parseLines,
} from '../work/test/dialogue.mjs';
import { matchShotAssets } from '../work/test/assets.mjs';
const lines = [
  {
    kind: '台词',
    speaker: '师傅',
    emotion: '平静',
    text: '先把速度降下来。',
    voiceName: '师傅配音',
  },
  {
    kind: '台词',
    speaker: '徒弟',
    emotion: '恐惧',
    text: '不是更危险吗？',
    voiceName: '徒弟配音',
  },
];
const shots = parseShots(JSON.stringify([{ title: '雨夜车内', lines }]));
assert.equal(shots[0].dialogue, lines.map((l) => l.text).join('\n'));
assert.equal(dialogueLines(shots[0]).length, 2);
assert.notEqual(shots[0].lines[0].id, shots[0].lines[1].id);
const p = newProject();
p.shots = shots;
p.assets = lines.flatMap((l) => [
  { id: id(), kind: '人物', name: l.speaker, description: '' },
  { id: id(), kind: '声音', name: l.voiceName, description: '' },
]);
p.shots[0] = matchShotAssets(shots[0], p.assets);
assert.equal(p.shots[0].references.length, 4);
assert.match(compilePrompt(p, p.shots[0]), /徒弟｜恐惧｜徒弟配音/);
assert.match(
  subtitle(p),
  /先把速度降下来。\n\n2\n[^\n]+ --> [^\n]+\n不是更危险吗？/,
);
validateProject(JSON.parse(JSON.stringify(p)));
const rewritten = { ...p.shots[0], dialogue: '导演改后的对白' };
assert.equal(dialogueLines(rewritten)[0].speaker, '');
assert.equal(dialogueText(dialogueLines(rewritten)), rewritten.dialogue);
assert.deepEqual(
  dialogueLines({ ...rewritten, dialogue: shots[0].dialogue }),
  shots[0].lines,
);
assert.throws(() => parseLines([{ ...lines[0], kind: '无效类型' }]));
assert.throws(() => parseLines(Array.from({ length: 41 }, () => lines[0])));
assert.throws(() =>
  parseLines([
    { ...lines[0], text: 'a'.repeat(10000) },
    { ...lines[1], text: 'b' },
  ]),
);
assert.equal(dialogueLines({ ...newShot(), dialogue: '旧对白' }).length, 1);
console.log(
  'PASS: multi-speaker JSON, independent line IDs, voice references, performance prompts, subtitles, persistence schema, director rewrite compatibility, invalid/oversized lines',
);
const mergedText = {
  ...newShot(),
  description: '画面动作',
  prompt: '运镜要求',
};
assert.equal(shotVisualText(mergedText), '画面动作\n\n运镜要求');
assert.equal(
  shotVisualText({ ...mergedText, prompt: '画面动作，运镜要求' }),
  '画面动作，运镜要求',
);
const blockingId = id();
const blocking = {
  id: blockingId,
  name: '站位.png',
  type: 'image/png',
  url: '/api/media/' + blockingId,
};
const withBlocking = {
  ...p,
  shots: [{ ...p.shots[0], blockingImage: blocking }],
};
assert.deepEqual(
  validateProject(JSON.parse(JSON.stringify(withBlocking))).shots[0]
    .blockingImage,
  blocking,
);
assert.throws(() =>
  validateProject({
    ...withBlocking,
    shots: [
      {
        ...withBlocking.shots[0],
        blockingImage: { ...blocking, type: 'video/mp4' },
      },
    ],
  }),
);
console.log(
  'PASS: combined visual text preserves existing content, avoids duplication, blocking image persistence/type validation',
);

const { promptParts } = await import('../work/test/prompt-rich.mjs');
const taggedAssets = [
  { id: id(), kind: '人物', name: '小猫', description: '' },
  { id: id(), kind: '场景', name: '雨夜(车内)', description: '' },
];
const taggedText = '0—2秒：小猫看向雨夜(车内)。\n小猫：“继续。”';
const parts = promptParts(taggedText, taggedAssets);
assert.equal(parts.map((p) => p.text).join(''), taggedText);
assert.equal(parts.filter((p) => p.asset).length, 3);
assert.equal(
  promptParts('<script>plain text</script>', taggedAssets)
    .map((p) => p.text)
    .join(''),
  '<script>plain text</script>',
);
assert.equal(
  promptParts('小猫', [...taggedAssets, { ...taggedAssets[0], id: id() }]).some(
    (p) => p.asset,
  ),
  false,
);
console.log(
  'PASS: inline asset names preserve prompt text/newlines, escape regex characters, and avoid ambiguous names',
);
