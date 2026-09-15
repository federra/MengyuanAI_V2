import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const dir = 'work/repair-test';
await fs.mkdir(dir, { recursive: true });
for (const [file, name] of [
  ['lib/api-response.ts', 'api-response'],
  ['lib/model-json.ts', 'model-json'],
  ['app/api/assets/route.ts', 'assets-route'],
  ['app/api/projects/route.ts', 'projects-route'],
]) {
  const code = ts
    .transpileModule(await fs.readFile(file, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    })
    .outputText.replaceAll("'@/lib/server'", "'./fake.mjs'")
    .replaceAll("'@/lib/model-server'", "'./fake.mjs'")
    .replaceAll("'@/lib/assets'", "'../test/assets.mjs'")
    .replaceAll("'@/lib/studio'", "'../test/studio.mjs'")
    .replaceAll("'@/lib/api-response'", "'./api-response.mjs'")
    .replaceAll("'@/lib/model-json'", "'./model-json.mjs'");
  await fs.writeFile(`${dir}/${name}.mjs`, code);
}
await fs.writeFile(
  `${dir}/fake.mjs`,
  `
export let output;export function respond(value){output=value;}
export const rows=new Map();
export function json(value,status=200){return Response.json(value,{status});}
export function sameOrigin(req){if(req.headers.get('origin')!==new URL(req.url).origin)throw Error('跨站');}
export async function textRequest(){if(output instanceof Error)throw output;return Response.json({choices:[{finish_reason:'stop',message:{content:output}}]});}
export function db(){return {prepare(sql){let args;return {bind(...v){args=v;return this},async all(){return {results:[...rows.values()].map(p=>({body:JSON.stringify(p)}))}},async run(){
 if(sql.startsWith('INSERT')){const [id,,body]=args;if(rows.has(id))return {meta:{changes:0}};rows.set(id,JSON.parse(body));}
 else {const [title,body,revision,updated,id,expected]=args;if(rows.get(id)?.revision!==expected)return {meta:{changes:0}};rows.set(id,JSON.parse(body));}
 return {meta:{changes:1}};
}}}};}
`,
);
const imp = (n) => import(pathToFileURL(path.resolve(dir, n + '.mjs')).href);
const { readApiResponse, withProgress, progressType } =
  await imp('api-response');
const { POST: extract } = await imp('assets-route');
const { POST: save, GET: read } = await imp('projects-route');
const { respond, rows } = await imp('fake');
const { modelJSON } = await imp('model-json');
const { newProject, validateProject } = await import('../work/test/studio.mjs');
const { reviewAssetDrafts, mergeScriptAssets, parseAssetDrafts } =
  await import('../work/test/assets.mjs');
const { parseShots } = await import('../work/test/director.mjs');
const req = (route, body, stream = true) =>
  new Request('https://studio.example/api/' + route, {
    method: 'POST',
    headers: {
      Origin: 'https://studio.example',
      'Content-Type': 'application/json',
      Accept: stream ? progressType : 'application/json',
    },
    body: JSON.stringify(body),
  });
const p = newProject('流程验证');
p.script = '**人物：** 小林；道具：信件；场景：车站\n小林拿起\n 信件。';
const verified = {
  kind: '人物',
  name: '小林',
  description: '主角',
  evidence: '小林拿起 信件。',
};
const hallucinated = {
  kind: '人物',
  name: '不存在',
  description: '错误',
  evidence: '剧本没有这句话',
};
const report = reviewAssetDrafts(
  { assets: [verified, verified, hallucinated] },
  p.script,
);
assert.equal(report.warnings.length, 2);
assert(report.assets.some((a) => a.kind === '场景' && a.name === '车站'));
assert(!report.assets.some((a) => a.name === '不存在'));
parseAssetDrafts(report, p.script);
assert.throws(
  () => reviewAssetDrafts({ assets: [hallucinated] }, '没有标签的原始故事'),
  /依据/,
);
respond(
  '```json\n' +
    JSON.stringify({ assets: [verified, verified, hallucinated] }) +
    '\n```',
);
let progress = 0;
const response = extract(req('assets', { script: p.script }));
const extracted = await readApiResponse(await response, () => progress++);
assert(progress > 0);
assert.equal(extracted.warnings.length, 2);
let next = mergeScriptAssets(p, extracted.assets, 'model');
next.shots = parseShots(
  JSON.stringify({
    shots: [
      {
        title: '取信',
        description: '小林在车站拿起信件',
        character: '小林',
        scene: '车站',
        duration: 10,
        assetNames: [
          { kind: '人物', name: '小林' },
          { kind: '道具', name: '信件' },
        ],
      },
    ],
  }),
);
next = mergeScriptAssets(next, extracted.assets, 'model');
validateProject(next);
assert(next.shots[0].references.length >= 2);
let stored = await readApiResponse(await save(req('projects', next, false)));
assert.equal(stored.revision, 1);
assert.equal(rows.get(p.id).assets.length, next.assets.length);
const all = await readApiResponse(await read());
assert.equal(all[0].shots[0].duration, 10);
assert.equal(
  (await save(req('projects', next, false))).status,
  409,
  'stale saves are rejected',
);
respond(new Error('模型服务返回 429，额度不足'));
await assert.rejects(
  () => readApiResponse(extract(req('assets', { script: p.script }))),
  /429/,
);
// Framing must survive byte boundaries, preserve Chinese, and reject an interrupted response.
const bytes = new TextEncoder().encode(
  JSON.stringify({ type: 'result', status: 200, body: { text: '中文结果' } }) +
    '\n',
);
const chunks = new ReadableStream({
  start(c) {
    for (let i = 0; i < bytes.length; i += 2) c.enqueue(bytes.slice(i, i + 2));
    c.close();
  },
});
assert.equal(
  (
    await readApiResponse(
      new Response(chunks, { headers: { 'Content-Type': progressType } }),
    )
  ).text,
  '中文结果',
);
await assert.rejects(
  () =>
    readApiResponse(
      new Response('{"type":"progress","seconds":5}\n', {
        headers: { 'Content-Type': progressType },
      }),
    ),
  /中断/,
);
const plain = await withProgress(req('assets', {}, false), async () =>
  Response.json({ text: 'legacy' }),
);
assert.equal((await readApiResponse(plain)).text, 'legacy');
assert.deepEqual(modelJSON('```json\n{"shots":[]}\n```'), { shots: [] });
console.log(
  'PASS repair flow: grounded partial assets, Markdown labels, deduplication, streaming progress/errors/UTF8, legacy responses, shot linking, project persistence and stale-save protection.',
);
