import assert from 'node:assert/strict';
import {splitStoryboardScript, storyboardPart} from '../lib/storyboard-generation-input.ts';

const script = Array.from({length: 75}, (_, index) =>
  `第${index + 1}场｜街角\n人物：小猫\n【动作】小猫走到邮筒旁，发现一封信。\n小猫：这是谁留下的？\n`).join('');
const chunks = splitStoryboardScript(script);
assert.ok(chunks.length >= 3);
assert.equal(chunks.join(''), script);
assert.ok(chunks.every(chunk => chunk.length <= 1400));

const assets = Array.from({length: 155}, (_, index) => ({
  kind: '人物', name: index === 0 ? '小猫' : `无关人物${index}`,
  description: '冗长设定'.repeat(200),
}));
const request = JSON.parse(storyboardPart({script, assets, ratio: '9:16'}, chunks[0]));
assert.equal(request.assets.length, 1);
assert.equal(request.assets[0].name, '小猫');
assert.ok(request.assets[0].description.length <= 260);
assert.equal(request.script, chunks[0]);
console.log('storyboard generation input: ok');
