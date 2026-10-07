// Actual route with a deterministic model response; never calls a paid model.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const directory = path.resolve('work/director-chat-api');
await fs.mkdir(directory, { recursive: true });
for (const [file, name] of [['app/api/director/route.ts', 'route'], ['lib/api-response.ts', 'api-response'], ['lib/model-json.ts', 'model-json']]) {
  const code = ts.transpileModule(await fs.readFile(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    .replaceAll("'@/lib/model-server'", "'./fake.mjs'").replaceAll("'@/lib/server'", "'./fake.mjs'")
    .replaceAll("'@/lib/studio'", "'../test/studio.mjs'").replaceAll("'@/lib/director'", "'../test/director.mjs'")
    .replaceAll("'@/lib/director-stage'", "'../test/director-stage.mjs'").replaceAll("'@/lib/api-response'", "'./api-response.mjs'")
    .replaceAll("'@/lib/model-json'", "'./model-json.mjs'");
  await fs.writeFile(path.join(directory, `${name}.mjs`), code);
}
await fs.writeFile(path.join(directory, 'fake.mjs'), `
export const requests=[];let answer={reply:'已检查',changes:[]};let finish='stop';
export function respond(value,reason='stop'){answer=value;finish=reason;}
export function json(value,status=200){return Response.json(value,{status});}
export function sameOrigin(req){if(req.headers.get('origin')!==new URL(req.url).origin)throw Error('不允许跨站写入');}
export async function textRequest(body){requests.push(body);return Response.json({choices:[{finish_reason:finish,message:{content:JSON.stringify(answer)}}]});}
`);
const load = name => import(pathToFileURL(path.join(directory, `${name}.mjs`)));
const { POST } = await load('route');
const { respond, requests } = await load('fake');
const { readApiResponse, progressType } = await load('api-response');
const { exampleProject } = await import('../work/test/studio.mjs');
const project = exampleProject(); project.story = '前文不改。雨落下来。后文不改。';
const request = async (extra = {}, origin = 'https://studio.test') => POST(new Request('https://studio.test/api/director', {
  method: 'POST', headers: { origin, 'Content-Type': 'application/json', Accept: progressType },
  body: JSON.stringify({ project, stage: '故事', instruction: '这段故事的因果合理吗？', ...extra }),
}));
let result = await readApiResponse(await request());
assert.equal(result.reply, '已检查'); assert.deepEqual(result.changes, []);
let context = JSON.parse(requests.at(-1).messages.at(-1).content).context;
assert.equal(context.content, project.story); assert.equal(context.script, undefined); assert.equal(context.shots, undefined);
respond({ reply: '已调整故事', changes: [{ target: 'project', id: project.id, field: 'story', before: project.story, after: '新的故事', reason: '调整因果' }] });
result = await readApiResponse(await request()); assert.equal(result.changes[0].after, '新的故事');
respond({ reply: '跨环节修改', changes: [{ target: 'project', id: project.id, field: 'script', before: project.script, after: '修改剧本', reason: '关联修改' }] });
await assert.rejects(() => request({ linked: true, scope: 'project' }).then(readApiResponse), /超出当前环节/);
const selection = { target: 'project', id: project.id, field: 'story', start: 5, end: 10, text: '雨落下来。' };
respond({ reply: '已改成下雪', replacement: '雪飘下来。', changes: [] });
result = await readApiResponse(await request({ instruction: '改成雪', selection }));
assert.equal(result.changes[0].after, '前文不改。雪飘下来。后文不改。');
context = JSON.parse(requests.at(-1).messages.at(-1).content).context;
assert.equal(context.selection.text, '雨落下来。'); assert.equal(context.preceding, '前文不改。'); assert.equal(context.following, '后文不改。');
respond({ reply: '越界', changes: [{ target: 'project', id: project.id, field: 'story', before: project.story, after: '全篇改掉', reason: '修改' }] });
await assert.rejects(() => request({ selection }).then(readApiResponse), /超出选中片段/);
await assert.rejects(() => request({ selection: { ...selection, text: '过期选区' } }).then(readApiResponse), /选中片段已变化/);
const first = project.shots[0], second = project.shots[1];
respond({ reply: '只检查指定分镜', changes: [] });
await readApiResponse(await request({ stage: '分镜', shotId: first.id }));
context = JSON.parse(requests.at(-1).messages.at(-1).content).context;
assert.deepEqual(context.shots.map(shot => shot.id), [first.id]);
respond({ reply: '越界', changes: [{ target: 'shot', id: second.id, field: 'prompt', before: second.prompt, after: '其他分镜', reason: '修改' }] });
await assert.rejects(() => request({ stage: '分镜', shotId: first.id }).then(readApiResponse), /超出指定分镜/);
await assert.rejects(() => request({ stage: '分镜', shotId: 'missing' }).then(readApiResponse), /指定分镜已不存在/);
respond({ reply: '截断', changes: [] }, 'length');
await assert.rejects(() => request().then(readApiResponse), /回复不完整/);
await assert.rejects(() => request({}, 'https://other.test').then(readApiResponse), /不允许跨站/);
console.log('PASS: conversational replies, enforced current-stage scope, exact selected-range patches, truncation and origin protection');
