// Isolated source transpilation; fake upstream only, no model quota or user data.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'director-asset-grounding-'));
after(() => fs.rm(dir, { recursive: true, force: true }));
await fs.copyFile('lib/builtin-adapted-skills.json', path.join(dir, 'builtin-adapted-skills.json'));
for (const [file, name] of [
  ...['studio', 'dialogue', 'dialogue-timeline', 'assets', 'creative', 'director', 'storyboard-episodes',
    'storyboard-contract', 'storyboard-normalize', 'storyboard-conversion-server',
    'storyboard-generation-input', 'video-duration', 'api-response', 'model-json']
    .map(name => [`lib/${name}.ts`, name]),
  ['app/api/assets/route.ts', 'assets-route'], ['app/api/ai/route.ts', 'ai-route'],
]) {
  const code = ts.transpileModule(await fs.readFile(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText
    .replaceAll(/(['"])(?:@\/lib\/|\.\/)([^'"]+)\1/g, (match, quote, target) => {
      if (target.endsWith('.json')) return match;
      return `${quote}./${['server', 'model-server', 'usage-server'].includes(target) ? 'fake' : target}.mjs${quote}`;
    });
  await fs.writeFile(path.join(dir, name + '.mjs'), code);
}
await fs.writeFile(path.join(dir, 'fake.mjs'), `
export const requests=[];
let answers=[];
export function respond(values){answers=[...values];requests.length=0;}
export async function textRequest(body){requests.push(body);if(!answers.length)throw Error('unexpected upstream call');return Response.json(answers.shift());}
export function json(value,status=200){return Response.json(value,{status});}
export function sameOrigin(req){if(req.headers.get('origin')!==new URL(req.url).origin)throw Error('cross origin');}
export async function config(){return {enabled:true,hasKey:true};}
export async function recordUsage(){}
`);
const load = name => import(pathToFileURL(path.join(dir, name + '.mjs')).href);
const { explicitAssets, reviewAssetDrafts, mergeScriptAssets } = await load('assets');
const { newProject } = await load('studio');
const { splitStoryboardScript } = await load('storyboard-generation-input');
const { POST: extract } = await load('assets-route');
const { POST: generate } = await load('ai-route');
const { respond, requests } = await load('fake');
const answer = body => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(body) } }] });
const req = (route, body) => new Request('https://studio.example/api/' + route, {
  method: 'POST', headers: { origin: 'https://studio.example', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

void test('inline role annotations preserve each name and its original description', () => {
  const script = '人物：小林（短发，红色外套）、小王（长发，蓝色外套）\n小林：“你好。”';
  const assets = explicitAssets(script);
  const role = assets.find(a => a.kind === '人物' && a.name === '小林');
  assert.equal(role?.description, '短发，红色外套');
  assert.equal(assets.find(a => a.name === '小王')?.description, '长发，蓝色外套');
  assert.equal(assets.filter(a => a.kind === '人物').length, 2);
  assert(script.includes(role.evidence));
});

void test('explicit role descriptions survive later name-only labels and dialogue', () => {
  const script = '人物：小林：短发，红色外套\n人物：小林\n小林：“你好。”';
  const role = explicitAssets(script).find(a => a.kind === '人物' && a.name === '小林');
  assert.equal(role?.description, '短发，红色外套');
  assert.equal(role.evidence, '人物：小林：短发，红色外套');
});

void test('ambiguous inline colon declarations cannot attach another character description', () => {
  const script = '人物：小林：短发、红外套，小王：长发、蓝外套';
  const report = reviewAssetDrafts({assets:[]}, script);
  assert.equal(report.assets.find(a => a.name === '小林')?.description, '');
  assert(report.warnings.some(w => w.includes('小林') && w.includes('描述')));
});

void test('mixed colon and bracket declarations do not assign another character to the first', () => {
  const script = '人物：小林：短发，小王（长发，蓝外套）';
  const report = reviewAssetDrafts({assets:[]}, script);
  assert.equal(report.assets.find(a => a.name === '小林')?.description, '');
  assert(report.warnings.some(w => w.includes('小林') && w.includes('描述')));
});

void test('unknown colon properties cannot invent a named character', () => {
  const assets = explicitAssets('人物：小林：短发，鞋子：红色运动鞋');
  assert.deepEqual(assets.map(a => a.name), ['小林']);
  assert.equal(assets[0].description, '');
});

void test('description property labels are not mistaken for character declarations', () => {
  const script = '人物：小林：短发，服装：红外套，身材：高瘦';
  const assets = explicitAssets(script);
  assert.equal(assets.length, 1);
  assert.equal(assets[0].name, '小林');
  assert.equal(assets[0].description, '短发，服装：红外套，身材：高瘦');
});

void test('colons and semicolons inside a role annotation cannot consume another role', () => {
  const script = '人物：小林（发型：短发；服装：红色外套）、小王（长发，蓝色外套）';
  const assets = explicitAssets(script);
  assert.equal(assets.length, 2);
  assert.equal(assets.find(a => a.name === '小林')?.description, '发型：短发；服装：红色外套');
  assert.equal(assets.find(a => a.name === '小王')?.description, '长发，蓝色外套');
});

void test('a character table supplies only the named row description', () => {
  const script = '| 角色 | 外貌描述 |\n| --- | --- |\n| 小林 | 短发，红色外套 |\n| 小王 | 长发，蓝色外套 |\n人物：小林、小王';
  const assets = explicitAssets(script);
  assert.equal(assets.find(a => a.name === '小林')?.description, '短发，红色外套');
  assert.equal(assets.find(a => a.name === '小王')?.description, '长发，蓝色外套');
});

void test('a neighboring scene table cannot be interpreted as more character rows', () => {
  const script = '| 角色 | 外貌描述 |\n| --- | --- |\n| 小林 | 短发 |\n| 场景 | 描述 |\n| --- | --- |\n| 车站 | 玻璃顶棚 |';
  assert.deepEqual(explicitAssets(script).map(a => a.name), ['小林']);
});

void test('a valid model name with whitespace description receives a matching explicit description', () => {
  const script = '人物：小林（短发，红色外套）\n小林进入车站。';
  const report = reviewAssetDrafts({ assets: [{kind:'人物',name:'小林',description:'  ',evidence:'小林进入车站。'}] }, script);
  assert.equal(report.assets.length, 1);
  assert.equal(report.assets[0].description, '短发，红色外套');
  assert.equal(report.assets[0].evidence, '人物：小林（短发，红色外套）');
});

void test('name-only sources stay incomplete without invented descriptions', () => {
  const script = '人物：小林\n小林：“你好。”';
  const report = reviewAssetDrafts({assets:[]}, script);
  assert.equal(report.assets.find(a => a.kind === '人物')?.description, '');
  assert(report.warnings.some(w => w.includes('小林') && w.includes('描述')));
  assert(!explicitAssets('| 镜号 | 人物 |\n| --- | --- |\n| 1 | 小林 |').length);
});

void test('an unrelated model quote cannot replace the correctly named explicit source facts', () => {
  const script = '人物：小林（短发，红色外套）、小王（长发，蓝色外套）\n小王穿蓝色外套。';
  const report = reviewAssetDrafts({assets:[{kind:'人物',name:'小林',description:'蓝色外套',evidence:'小王穿蓝色外套。'}]}, script);
  assert.equal(report.assets.find(a => a.name === '小林')?.description, '短发，红色外套');
  assert(report.warnings.some(w => w.includes('小林')));
});

void test('grounded supplementation fills an existing blank without overwriting manual settings or media', () => {
  const project = newProject('设定保护');
  project.script = '人物：小林（短发，红色外套）';
  project.assets = [{id:'role',kind:'人物',name:'小林',description:'',image:{id:'image',url:'/api/media/image',type:'image/png',name:'role.png'}}];
  const filled = mergeScriptAssets(project, explicitAssets(project.script), 'labels');
  assert.equal(filled.assets[0].description, '短发，红色外套');
  assert.equal(filled.assets[0].id, 'role');
  assert.deepEqual(filled.assets[0].image, project.assets[0].image);
  const manual = mergeScriptAssets({...project,assets:[{...project.assets[0],description:'用户确认的造型'}]}, explicitAssets(project.script), 'labels');
  assert.equal(manual.assets[0].description, '用户确认的造型');
  assert.equal(manual.assets[0].suggestedDescription, '短发，红色外套');
});

void test('the actual extraction endpoint preserves explicit facts omitted by the model', async () => {
  const script = '人物：小林（短发，红色外套）\n小林进入车站。';
  respond([answer({assets:[{kind:'人物',name:'小林',description:'',evidence:'小林进入车站。'}]})]);
  const response = await extract(req('assets', {script}));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].description, '短发，红色外套');
  assert.equal(requests.length, 1, 'supplementation must not issue another paid model request');
});

void test('later storyboard chunks inherit source facts and blank generated roles retain those facts', async () => {
  const script = '人物：小林（短发，红色外套）\n' + '小林经过走廊。\n'.repeat(220);
  const chunks = splitStoryboardScript(script);
  assert(chunks.length > 1);
  respond(chunks.map(() => answer({shots:[{title:'走廊',duration:5,character:'小林'}],assets:[{kind:'人物',name:'小林',description:''}]})));
  const response = await generate(req('ai', {task:'shots',content:JSON.stringify({script})}));
  assert.equal(response.status, 200);
  const result = JSON.parse((await response.json()).text);
  assert.equal(result.assets[0].description, '短发，红色外套');
  const later = JSON.parse(requests[1].messages[1].content);
  assert.equal(later.assets.find(a => a.name === '小林')?.description, '短发，红色外套');
  assert.equal(requests.length, chunks.length);
});

void test('confirmed project descriptions take priority in generated blank assets and keep the selected skill', async () => {
  const script = '人物：小林（短发，红色外套）\n小林进入车站。';
  const shotSkill = {id:'fenjin-10s',name:'10秒漫剧分镜',version:'1.0-platform',stage:'分镜',content:'按用户已确认规则制作分镜。'};
  respond([answer({shots:[{title:'进站',duration:5,character:'小林'}],assets:[{kind:'人物',name:'小林',description:''}]})]);
  const response = await generate(req('ai', {task:'shots',content:JSON.stringify({script,shotSkill,assets:[{kind:'人物',name:'小林',description:'用户确认的造型'}]})}));
  assert.equal(response.status, 200);
  assert.equal(JSON.parse((await response.json()).text).assets[0].description, '用户确认的造型');
  assert.deepEqual(JSON.parse(requests[0].messages[1].content).shotSkill, shotSkill);
  assert.equal(requests.length, 1);
});
