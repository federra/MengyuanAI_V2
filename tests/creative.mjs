import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
// Run core.mjs first to transpile the shared studio graph.
const code = ts
  .transpileModule(await fs.readFile('lib/creative.ts', 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  })
  .outputText.replaceAll("'./studio'", "'./studio.mjs'");
await fs.writeFile('work/test/creative.mjs', code);
const { parseStoryPlans, chooseStory, creativeStages } = await import(
  pathToFileURL(path.resolve('work/test/creative.mjs')).href
);
const { exampleProject, validateProject } = await import(
  pathToFileURL(path.resolve('work/test/studio.mjs')).href
);
const p = exampleProject();
assert.doesNotThrow(() => validateProject(p));
assert.doesNotThrow(()=>validateProject({...p,favoriteSkillIds:['idea','shot']}));
assert.throws(()=>validateProject({...p,favoriteSkillIds:['shot','shot']}));
assert.throws(()=>validateProject({...p,favoriteSkillIds:[42]}));
for (const count of [1,2,3,4]) assert.doesNotThrow(()=>validateProject({...p,creativeSkillId:'idea',storySkillId:'story',storyVersionCount:count}));
for (const count of [0,5,1.5,'3']) assert.throws(()=>validateProject({...p,storyVersionCount:count}));
const parsed = parseStoryPlans(
  JSON.stringify({
    plans: [
      {
        title: '方案一',
        summary: '梗概',
        content: '故事完整正文',
        tags: ['友情'],
      },
      {
        title: '方案二',
        summary: '不同结局',
        content: '另外一个故事',
        tags: [],
      },
    ],
  }),
);
assert.equal(new Set(parsed.map((p) => p.id)).size, 2);
assert.throws(() => parseStoryPlans('not json'));
assert.throws(() => parseStoryPlans('{"plans":[]}'));
assert.throws(() =>
  parseStoryPlans(
    JSON.stringify({ plans: [{ title: '缺正文', summary: '', tags: [] }] }),
  ),
);
const source = { ...p, storyPlans: parsed, videoType: '剧情短片' };
const patch = chooseStory(source, parsed[1].id);
const next = { ...source, ...patch };
assert.doesNotThrow(() => validateProject(next));
assert.equal(next.story, parsed[1].content);
assert.equal(next.script, source.script);
assert.deepEqual(next.assets, source.assets);
assert.equal(next.shots.length, source.shots.length);
assert.ok(next.shots.every((s) => s.reviewRequired));
assert.equal(source.story, p.story);
assert.equal(source.selectedStoryId, undefined);
assert.doesNotThrow(() => validateProject(JSON.parse(JSON.stringify(next))));
assert.throws(() => chooseStory(source, 'missing'));
assert.throws(() => validateProject({ ...source, selectedStoryId: 'missing' }));
assert.throws(() =>
  validateProject({ ...source, storyPlans: [parsed[0], parsed[0]] }),
);
assert.throws(() =>
  validateProject({
    ...source,
    storyPlans: [{ ...parsed[0], content: 'x'.repeat(30001) }],
  }),
);
assert.deepEqual(creativeStages, ['创意', '故事', '剧本', '分镜', '剪辑']);
console.log(
  'Creative flow passed: legacy projects, story plan boundaries, persistence, selection and downstream review preservation.',
);
for (const ratio of ['4:3','21:9','2.35:1','5:4']) assert.doesNotThrow(()=>validateProject({...p,ratio}),'custom ratio must save');
for (const ratio of ['0:1','-1:2','1:0','NaN:1','1:2:3','1000:1']) assert.throws(()=>validateProject({...p,ratio}));
for (const storyLength of ['500字以下','500～1000字','1000～2000字','2000～3000字','3000～5000字','5000字以上']) assert.doesNotThrow(()=>validateProject({...p,storyLength}));
assert.throws(()=>validateProject({...p,storyLength:'随便'}));
const {customStylePatch,storyTokenBudget}=await import(pathToFileURL(path.resolve('work/test/creative.mjs')).href);
const style=customStylePatch(p,'复古剪纸');
assert.equal(style.style,'复古剪纸');
assert.equal(style.assets.at(-1).kind,'风格');
assert.equal(style.assets.at(-1).inLibrary,true);
assert.equal(customStylePatch({...p,...style},'复古剪纸').assets.length,style.assets.length);
assert(storyTokenBudget('5000字以上',4)>storyTokenBudget('500字以下',4));
console.log('PASS custom settings persistence, validation, shared style templates and long story budget');
