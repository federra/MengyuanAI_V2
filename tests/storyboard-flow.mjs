// Run after core.mjs. Exercises the actual generation route with a fake model.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const dir = 'work/storyboard-flow';
await fs.mkdir(dir, { recursive: true });
for (const [file, name] of [
  ['app/api/ai/route.ts', 'route'],
  ['lib/api-response.ts', 'api-response'],
  ['lib/storyboard-conversion-server.ts', 'storyboard-conversion-server'],
  ['app/api/storyboards/normalize/route.ts', 'normalize-route'],
]) {
  const code = ts
    .transpileModule(await fs.readFile(file, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    })
    .outputText.replaceAll("'@/lib/creative'", "'../test/creative.mjs'")
    .replaceAll("'@/lib/storyboard-conversion-server'", "'./storyboard-conversion-server.mjs'")
    .replaceAll("'./model-server'", "'./fake.mjs'")
    .replaceAll("'./storyboard-contract'", "'../test/storyboard-contract.mjs'")
    .replaceAll("'./storyboard-normalize'", "'../test/storyboard-normalize.mjs'")
    .replaceAll("'@/lib/usage-server'", "'./fake.mjs'")
    .replaceAll("'@/lib/server'", "'./fake.mjs'")
    .replaceAll("'@/lib/model-server'", "'./fake.mjs'")
    .replaceAll("'@/lib/director'", "'../test/director.mjs'")
    .replaceAll(
      "'@/lib/storyboard-contract'",
      "'../test/storyboard-contract.mjs'",
    )
    .replaceAll("'@/lib/api-response'", "'./api-response.mjs'");
  await fs.writeFile(`${dir}/${name}.mjs`, code);
}
await fs.writeFile(
  `${dir}/fake.mjs`,
  `
export async function recordUsage(){}
export const requests=[];
let answer;
export function respond(value){answer=value;}
export function json(value,status=200){return Response.json(value,{status});}
export function sameOrigin(req){if(req.headers.get('origin')!==new URL(req.url).origin)throw Error('不允许跨站写入');}
export async function textRequest(body){requests.push(body);return Response.json(Array.isArray(answer) ? answer.shift() : answer);}
export async function config(){return {enabled:true,hasKey:true};}
`,
);
const imp = (name) =>
  import(pathToFileURL(path.resolve(dir, name + '.mjs')).href);
const { POST } = await imp('route');
const { respond, requests } = await imp('fake');
const { episodeTemplate } =
  await import('../work/test/storyboard-contract.mjs');
const source = structuredClone(episodeTemplate);
source.episodes = Array.from({ length: 26 }, (_, i) => ({
  ...structuredClone(source.episodes[0]),
  video_id: String(i + 1),
}));
const answer = (body, finish = 'stop') =>
  respond({
    choices: [
      { finish_reason: finish, message: { content: JSON.stringify(body) } },
    ],
  });
const request = () =>
  POST(
    new Request('https://studio.example/api/ai', {
      method: 'POST',
      headers: {
        origin: 'https://studio.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: 'shots',
        content: '将当前完整剧本按26段、每段10秒制作分镜。',
      }),
    }),
  );
answer(source);
let r = await request();
assert.equal(r.status, 200);
let result = await r.json();
assert.deepEqual(result.storyboard, {
  segments: 26,
  duration: 260,
  subshots: 52,
  assets: 3,
});
assert.equal(JSON.parse(result.text).episodes.length, 26);
assert.ok(
  requests[0].messages[0].content.includes('视频段（工作台的一行分镜）'),
);
assert.ok(!requests[0].messages[0].content.includes('6至12'));
assert.ok(requests[0].max_tokens > 5000);
source.episodes[0].shots[1].time_start = 3;
answer(source);
r = await request();
assert.equal(r.status, 422);
assert.match((await r.json()).error, /时间不连续/);
answer({
  shots: [{ title: '兼容格式', duration: 10, description: '0—10秒：完整动作' }],
});
r = await request();
assert.equal(r.status, 200);
assert.equal((await r.json()).storyboard.segments, 1);
answer(source, 'length');
assert.equal((await request()).status, 502);
assert.equal(
  requests.length,
  5,
  'no automatic retries or subshot generation fan-out',
);
console.log(
  'PASS generation route: segment counts/timing, shared architecture, legacy compatibility, rejection of invalid/truncated output; fake model only.',
);

answer({plans:[{title:'长故事',summary:'概要',content:'完整正文',tags:[]}]});
const long=await POST(new Request('http://localhost/api/ai',{method:'POST',headers:{origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({task:'storyOptions',content:'长篇测试',storyCount:4,storyLength:'5000字以上'})}));
assert.equal(long.status,200);
assert.match(requests.at(-1).messages[0].content,/5000字以上/);
assert(!requests.at(-1).messages[0].content.includes('400至700'));
assert(requests.at(-1).max_tokens>=52000);
console.log('PASS long story instructions and output budget reach model');

const complete = text => ({choices:[{finish_reason:'stop',message:{content:JSON.stringify(text)}}]});
const standard={shots:[{title:'转换镜头',description:'进门',duration:10}]};
respond([complete({storyboards:[{duration:'10s'}]}),complete(standard)]);
const before=requests.length;r=await request();assert.equal(r.status,200);assert.equal((await r.json()).converted,true);assert.equal(requests.length-before,2);
const {POST:normalize}=await imp('normalize-route');
const callImport=source=>normalize(new Request('https://studio.example/api/storyboards/normalize',{method:'POST',headers:{origin:'https://studio.example','Content-Type':'application/json'},body:JSON.stringify({source:JSON.stringify(source)})}));
const count=requests.length;assert.equal((await callImport(standard)).status,200);assert.equal(requests.length,count);
respond(complete(standard));r=await callImport({storyboards:[{duration:'10s'}]});assert.equal(r.status,200);assert.equal((await r.json()).converted,true);assert.equal(requests.length,count+1);
console.log('PASS generation and import endpoints use one format conversion, valid import skips AI');
respond({choices:[{finish_reason:'length',message:{content:'{"shots":['}}]});
r=await callImport({unknown:'需要转换'});assert.equal(r.status,422);assert.match((await r.json()).error,/长度限制截断/);
respond({choices:[{message:{content:JSON.stringify(standard)}}]});
r=await callImport({unknown:'完整响应未提供finish_reason'});assert.equal(r.status,200);
console.log('PASS conversion distinguishes truncated output and accepts complete output without optional finish_reason.');
