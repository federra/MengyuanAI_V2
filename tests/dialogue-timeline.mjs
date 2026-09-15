// Run after tests/core.mjs to compile shared modules.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { newProject, newShot, validateProject } from '../work/test/studio.mjs';
import { newLine, dialogueText } from '../work/test/dialogue.mjs';
import {
  dialogueCues,
  setCueTime,
  cueSubtitle,
} from '../work/test/dialogue-timeline.mjs';
const make = (lines, extra = {}) => ({
  ...newShot(),
  duration: 10,
  character: '石头',
  ...extra,
  lines,
  dialogue: dialogueText(lines),
});
const line = (text, extra = {}) => ({
  ...newLine(),
  speaker: '石头',
  text,
  ...extra,
});
const times = (s) => dialogueCues(s).map((c) => [c.start, c.end]);
const a =
  '石头 ( @role_shitou ) （音色：清亮稚嫩男童音）发出对白：【期待】“妈，今天一定要回来呀。”；音效：红笔摩擦纸张；窗外鸟鸣';
const b =
  '石头 ( @role_shitou ) （音色：清亮稚嫩男童音）发出对白：【小声得意】“我都数了一个月了。”；音效：笔帽轻响';
const legacy = make([line('0—4秒：' + a), line('4—10秒：' + b)]);
assert.deepEqual(times(legacy), [
  [0, 4],
  [4, 10],
]);
assert.deepEqual(
  dialogueCues(legacy).map((c) => c.line.text),
  ['妈，今天一定要回来呀。', '我都数了一个月了。'],
);
assert.deepEqual(
  dialogueCues(legacy).map((c) => c.line.emotion),
  ['期待', '小声得意'],
);
assert.deepEqual(
  times({ ...legacy, lines: undefined }),
  [
    [0, 4],
    [4, 10],
  ],
  'legacy raw dialogue retains times',
);
const plain = make(
  [line('妈，今天一定要回来呀。'), line('我都数了一个月了。')],
  {
    description: `0—4秒 · 子镜头01\n声音：${a}\n4—10秒 · 子镜头02\n声音：${b}`,
  },
);
assert.deepEqual(
  times(plain),
  [
    [0, 4],
    [4, 10],
  ],
  'recover timing for previously normalized dialogue',
);
const timed = make([
  line('第一句', { start: 1, end: 3 }),
  line('第二句', { start: 6, end: 15, audioStart: 2 }),
]);
assert.deepEqual(
  times(timed),
  [
    [1, 3],
    [6, 10],
  ],
  'preserve silence and clamp shot end',
);
assert.equal(dialogueCues(timed)[1].audioStart, 2);
const edit = (s, i, f, n) => make(setCueTime(s, i, f, n));
assert.deepEqual(
  times(edit(timed, 0, 'end', 99)),
  [
    [1, 6],
    [6, 10],
  ],
  'cannot overlap next cue',
);
assert.deepEqual(
  times(edit(timed, 1, 'start', -1)),
  [
    [1, 3],
    [3, 10],
  ],
  'cannot overlap previous cue',
);
assert.deepEqual(times(edit(timed, 1, 'end', 999)), [
  [1, 3],
  [6, 10],
]);
assert.equal(dialogueCues(edit(timed, 1, 'audioStart', 4))[1].audioStart, 4);
assert.deepEqual(
  times(
    make([
      line('甲', { start: -3, end: 4 }),
      line('乙', { start: 2, end: 20 }),
      line('丙', { start: 12, end: 18 }),
    ]),
  ),
  [
    [0, 4],
    [4, 10],
    [10, 10],
  ],
);
const untimed = make([line('甲'), line('乙')]);
assert.deepEqual(times(untimed), [
  [0, 5],
  [5, 10],
]);
assert(dialogueCues(untimed).every((c) => c.estimated));
const multi = make([line('0—10秒：石头：“甲。”；小猫：“乙。”')], {
  character: '石头、小猫',
});
assert.deepEqual(times(multi), [
  [0, 5],
  [5, 10],
]);
assert.deepEqual(
  dialogueCues(multi).map((c) => c.line.speaker),
  ['石头', '小猫'],
);
const project = newProject();
project.shots = [legacy, { ...timed, enabled: false }, timed];
const srt = cueSubtitle(project);
assert(srt.includes('00:00:00,000 --> 00:00:04,000\n妈，今天一定要回来呀。'));
assert(srt.includes('00:00:16,000 --> 00:00:20,000\n第二句'));
assert(!/音效|@role|发出对白|0—4秒/.test(srt));
project.shots = Array.from({ length: 26 }, () => ({
  ...legacy,
  id: crypto.randomUUID(),
}));
const full = cueSubtitle(project);
assert.equal((full.match(/ --> /g) || []).length, 52);
assert(full.includes('00:04:14,000 --> 00:04:20,000'));
const saved = make(setCueTime(legacy, 0, 'end', 3.5));
project.shots = [saved];
assert.deepEqual(
  times(validateProject(JSON.parse(JSON.stringify(project))).shots[0]),
  [
    [0, 3.5],
    [4, 10],
  ],
);
// Optional local fixture contains the actual project, no credentials; never required in CI.
try {
  const actual = JSON.parse(
    await fs.readFile('work/current-video-prompt-project.json', 'utf8'),
  );
  assert.deepEqual(times(actual.shots[0]), [
    [0, 4],
    [4, 10],
  ]);
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
console.log(
  'PASS per-dialogue timing, legacy recovery, raw text, silence gaps, editable bounds, source audio offsets, persistence and 26×10s total endpoint.',
);
