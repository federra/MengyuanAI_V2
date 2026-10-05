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
  ['lib/storyboard-generation-input.ts', 'storyboard-generation-input'],
  ['lib/video-duration.ts', 'video-duration'],
  ['app/api/storyboards/normalize/route.ts', 'normalize-route'],
]) {
  const code = ts
    .transpileModule(await fs.readFile(file, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    })
    .outputText.replaceAll("'@/lib/video-duration'", "'./video-duration.mjs'")
    .replaceAll("'@/lib/creative'", "'../test/creative.mjs'")
    .replaceAll("'@/lib/storyboard-conversion-server'", "'./storyboard-conversion-server.mjs'")
    .replaceAll("'@/lib/storyboard-generation-input'", "'./storyboard-generation-input.mjs'")
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
let videoConfig={enabled:true,hasKey:true};
export function configureVideo(value){videoConfig=value;}
export async function config(){return videoConfig;}
`,
);
const imp = (name) =>
  import(pathToFileURL(path.resolve(dir, name + '.mjs')).href);
const { POST } = await imp('route');
const { respond, requests, configureVideo } = await imp('fake');
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
        content: JSON.stringify({script:'将当前完整剧本按26段、每段10秒制作分镜。'}),
      }),
    }),
  );
answer(source);
let r = await request();
assert.equal(r.status, 200);
const result = await r.json();
assert.deepEqual(result.storyboard, {
  segments: 26,
  duration: 260,
  subshots: 52,
  assets: 3,
});
assert.equal(JSON.parse(result.text).shots.length, 26);
assert.ok(
  requests[0].messages[0].content.includes('视频段（工作台的一行分镜）'),
);
assert.ok(!requests[0].messages[0].content.includes('6至12'));
assert.ok(requests[0].max_tokens > 5000);
source.episodes[0].shots[1].time_start = 3;
answer(source);
r = await request();
assert.equal(r.status, 502);
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

const postScript = script => POST(new Request('https://studio.example/api/ai', {
  method:'POST', headers:{origin:'https://studio.example','Content-Type':'application/json'},
  body:JSON.stringify({task:'shots',content:JSON.stringify({script})}),
}));
const oneShot = n => ({choices:[{finish_reason:'stop',message:{content:JSON.stringify({shots:[{title:`片段${n}`,duration:5,description:`片段${n}画面`}]})}}]});
const longScript='剧本'.repeat(1700);
respond([oneShot(1),oneShot(2),oneShot(3)]);
r=await postScript(longScript);
assert.equal(r.status,200);
assert.equal((await r.json()).storyboard.segments,3);
respond([{choices:[{finish_reason:'length',message:{content:'{"shots":['}}]},oneShot(4),oneShot(5)]);
r=await postScript('剧本'.repeat(500));
assert.equal(r.status,200);
assert.equal((await r.json()).storyboard.segments,2);
console.log('PASS long scripts split and length-limited chunks retry as smaller validated parts');

const assetPart = (description) => ({choices:[{finish_reason:'stop',message:{content:JSON.stringify({
  shots:[{title:'进站',duration:5,character:'小林'}],
  assets:[{kind:'人物',name:'小林',description}],
})}}]});
respond([assetPart(''),assetPart('红色外套'),oneShot(3)]);
r=await postScript(longScript);
assert.equal(r.status,200);
assert.equal(JSON.parse((await r.json()).text).assets[0].description,'红色外套','later chunks must fill missing asset descriptions');
console.log('PASS asset descriptions survive deduplication across script chunks');

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

respond({choices:[{finish_reason:'length',message:{content:'',reasoning_content:'reasoning only'}}]});
const emptyBefore=requests.length;
r=await postScript('剧本'.repeat(800));
assert.equal(r.status,502);
assert.match((await r.json()).error,/尚未返回正文.*不等于剧本输入字数超限/);
assert.equal(requests.length-emptyBefore,1,'reasoning-only exhaustion must not fan out into repeated paid attempts');
console.log('PASS reasoning-only truncation gives an output-specific error without recursive requests');

// A complete, valid JSON response can still be unrenderable as one video.
const oversized = {shots:[{title:'长对白',duration:22,description:'完整动作',dialogue:'甲：“前半句。”\n乙：“后半句。”'}]};
const split = {shots:[{title:'前半段',duration:10,description:'前半动作',dialogue:'甲：“前半句。”'},{title:'后半段',duration:12,description:'后半动作',dialogue:'乙：“后半句。”'}]};
respond([complete(oversized),complete(split)]);
const durationBefore=requests.length;
r=await postScript('甲说前半句，乙说后半句。');
assert.equal(r.status,200);
const repaired=await r.json();
assert.equal(repaired.storyboard.segments,2,'22-second result must be resegmented, not silently kept or clamped');
assert.equal(repaired.storyboard.duration,22,'resegmentation must preserve the provided total timing');
assert.match(repaired.text,/前半句/);assert.match(repaired.text,/后半句/);
assert.equal(requests.length-durationBefore,2);
assert.match(requests[durationBefore].messages[0].content,/15秒/);
respond([complete(oversized),complete(oversized)]);
const invalidBefore=requests.length;
r=await postScript('长对白');
assert.equal(r.status,502,'still oversized after one repair must not reach application');
assert.match((await r.json()).error,/时长.*原项目未修改/);
assert.equal(requests.length-invalidBefore,2,'duration repair is bounded');
console.log('PASS duration generation contract, content-preserving resegmentation and bounded rejection');

const {videoDurationOptions,videoDurationError}=await imp('video-duration');
assert.deepEqual(videoDurationOptions({protocol:'heima-video',model:'grok'}),[6,10,15]);
assert.deepEqual(videoDurationOptions({protocol:'chat-video',model:'firefly-veo31-8s-16x9-1080p'}),[8]);
assert.equal(videoDurationOptions({protocol:'heima-minimax',model:'minimax_h3'})[0],5);
assert.equal(videoDurationOptions(undefined,'doubao')[0],4);
assert.match(videoDurationError(16),/15/);
assert.match(videoDurationError(4,{protocol:'heima-minimax',model:'minimax_h3'}),/5/);
assert.match(videoDurationError(2,undefined,'doubao'),/4/);
configureVideo({protocol:'chat-video',model:'firefly-veo31-8s-16x9-1080p'});
respond([oneShot(1),complete({shots:[{title:'固定8秒',duration:8,description:'完整动作'}]})]);
r=await postScript('固定时长型号');assert.equal(r.status,200);
assert.equal(JSON.parse((await r.json()).text).shots[0].duration,8);
assert.match(requests.at(-1).messages[0].content,/允许时长：8秒/);
assert(!requests.at(-1).messages[0].content.includes('0.1至120的秒数'));
// A faithful import remains unchanged; video submission separately enforces limits.
const importCount=requests.length;r=await callImport(oversized);
assert.equal(r.status,200);assert.equal(requests.length,importCount);
assert.equal(JSON.parse((await r.json()).text).shots[0].duration,22);
console.log('PASS channel-specific allowed durations and faithful long-duration import');
