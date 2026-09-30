import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const skills = JSON.parse(readFileSync(new URL('lib/builtin-adapted-skills.json', root), 'utf8'));
const expected = [
  ['arcreel-剧本转分镜', '分镜', 'docs/skills/arcreel-adapted/02-剧本转视频段分镜.md'],
  ['arcreel-小说转剧本', '剧本', 'docs/skills/arcreel-adapted/01-小说转可拍摄剧本.md'],
  ['影策-剧本转分镜', '分镜', 'docs/skills/open-ai-canvas-adapted/01-影策式叙事分镜.md'],
];

assert.equal(skills.length, expected.length);
for (const [index, [name, stage, file]] of expected.entries()) {
  const source = readFileSync(new URL(file, root), 'utf8');
  const match = /^---\n[\s\S]*?\n---\n([\s\S]*)$/.exec(source);
  assert.ok(match, `${file} has YAML frontmatter`);
  assert.equal(skills[index].name, name);
  assert.equal(skills[index].stage, stage);
  assert.equal(skills[index].content, match[1].trim());
  assert.ok(skills[index].id);
}
assert.equal(new Set(skills.map(({ id }) => id)).size, skills.length);
console.log('PASS adapted built-in skills: names, order, stages and complete source content');
