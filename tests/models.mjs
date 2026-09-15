import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const dir='work/model-test';await fs.mkdir(dir,{recursive:true});
for(const name of ['models','model-server','generation-server','api-response','video-request','video-voice']){
 let code=ts.transpileModule(await fs.readFile(`lib/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 code=code.replaceAll("'cloudflare:workers'","'./fake.mjs'").replaceAll("'./server'","'./fake.mjs'").replaceAll("'./video-voice'","'./video-voice.mjs'").replaceAll("'./video-request'","'./video-request.mjs'").replaceAll("'./models'","'./models.mjs'").replaceAll("'./model-server'","'./model-server.mjs'");await fs.writeFile(`${dir}/${name}.mjs`,code);
}
await fs.writeFile(`${dir}/fake.mjs`, `
export const json=(data,status=200)=>Response.json(data,{status});export const sameOrigin=()=>{};
export const env={MODEL_ENCRYPTION_KEY:'local-test-secret-not-production'};
export const profiles=new Map(),defaults=new Map();
export const configs=new Map(),jobs=new Map(),media=new Map(),blobs=new Map();
export function db(){return {prepare(sql){let a;return {bind(...args){a=args;return this},async first(){if(sql.includes('model_defaults'))return defaults.has(a[0])?{profile_id:defaults.get(a[0])}:null;if(sql.includes('model_profiles')){const r=profiles.get(a[0]);return r&&(!a[1]||r.kind===a[1])?r:null;}if(sql.includes('model_configs'))return configs.get(a[0])||null;if(sql.includes("json_extract(body,'$.media.id')")){return [...jobs.values()].find(r=>JSON.parse(r.body).media?.id===a[0]&&r.project_id===a[1]&&r.status==='succeeded')||null;}if(sql.includes('generation_jobs'))return jobs.get(a[0])||null;throw Error(sql)},async all(){if(sql.includes('model_profiles'))return {results:[...profiles.values()]};throw Error(sql)},async run(){
if(sql.startsWith('INSERT OR IGNORE INTO generation_jobs')){if(jobs.has(a[0]))return {meta:{changes:0}};jobs.set(a[0],{id:a[0],project_id:a[1],body:a[2],status:a[3],config:a[4],created_at:a[5],remote_id:null});}
else if(sql.startsWith('UPDATE generation_jobs')){const old=jobs.get(a[3]);jobs.set(a[3],{...old,body:a[0],status:a[1],remote_id:a[2]||old.remote_id});}
else if(sql.startsWith('INSERT INTO model_defaults'))defaults.set(a[0],a[1]);
else if(sql.startsWith('INSERT INTO model_configs'))configs.set(a[0],{body:a[1],secret:a[2]});
else if(sql.startsWith('INSERT INTO model_profiles'))profiles.set(a[0],{id:a[0],kind:a[1],body:a[2],secret:a[3]});
else if(sql.startsWith('UPDATE model_profiles')){const r=profiles.get(a[2]);if(r?.kind===a[3])profiles.set(a[2],{...r,body:a[0],secret:a[1]});}
else if(sql.startsWith('INSERT INTO media'))media.set(a[0],a);
else throw Error(sql);return {meta:{changes:1}};}}}};}
export function files(){return {async head(id){return blobs.get(id)||null},async get(id){return blobs.get(id)||null},async put(id,stream,meta){const b=await new Response(stream).arrayBuffer();blobs.set(id,{size:b.byteLength,httpMetadata:meta.httpMetadata,arrayBuffer:async()=>b});}};}
`);
const imp=n=>import(pathToFileURL(path.resolve(dir,n+'.mjs')).href);
const {modelDefaults,validateModel,videoBody,publicHttps,normalizeModelBase,imageSizeForRatio,validImageSize}=await imp('models');
for(const ratio of ['16:9','9:16','1:1','4:3','3:4','21:9']) {
 const [w,h]=imageSizeForRatio(ratio).split('x').map(Number),[rw,rh]=ratio.split(':').map(Number);
 assert.equal(w*rh,h*rw); assert(validImageSize(imageSizeForRatio(ratio)));
}
for(const size of ['100000x100000','0x0','auto','1024','1024x9999'])assert.equal(validImageSize(size),false);
const {configs,jobs,blobs}=await imp('fake');
const {seal,config,textRequest}=await imp('model-server');
const {submitJob,refreshJob,validateGeneration}=await imp('generation-server');
for(const url of ['http://example.com','https://127.0.0.1','https://[::1]','https://localhost','https://user:pass@example.com','https://example.com:1234','https://foo.internal'])assert.throws(()=>publicHttps(url));
assert.equal(validateModel({...modelDefaults[0],model:'reasoner',baseUrl:'https://api.example.com/v1/'}).baseUrl,'https://api.example.com/v1');
assert.throws(()=>validateModel({...modelDefaults[0],model:'a',protocol:'ark-video'}));
const key='fake-provider-secret';
const sealed=await seal(key);assert(!sealed.includes(key));assert.notEqual(sealed,await seal(key));
for(const m of modelDefaults) configs.set(m.kind,{body:JSON.stringify({...m,enabled:true,model:'test-model',baseUrl:'https://api.example.com/v1'}),secret:sealed});
assert.equal((await config('text')).apiKey,undefined);assert.equal((await config('text',true)).apiKey,key);
const input={projectId:'project-1',targetId:'shot-1',target:'video',prompt:'雨夜街道',ratio:'16:9',duration:5,referenceIds:[],size:'2K',resolution:'720p'};
assert.throws(()=>validateGeneration({...input,duration:0}));assert.throws(()=>videoBody('model',input,['ref'],'first'));
let requests=[], downloadFail=false, providerFail=false;
globalThis.fetch=async(url,init={})=>{requests.push({url,init});if(url==='https://cdn.example.com/result.mp4'||url==='https://cdn.example.com/result.png')return new Response('media-bytes',{status:downloadFail?503:200,headers:{'Content-Type':url.endsWith('mp4')?'video/mp4':'image/png'}});
 if(providerFail)throw Error('connection interrupted');
 if(url.endsWith('/chat/completions'))return Response.json({choices:[{message:{content:'故事'}}]});
 if(url.endsWith('/images/generations'))return Response.json({data:[{url:'https://cdn.example.com/result.png'}]});
 if(init.method==='POST')return Response.json({id:'remote-task-1'});
 return Response.json({status:'succeeded',content:{video_url:'https://cdn.example.com/result.mp4'}});
};
await textRequest({messages:[{role:'user',content:'写故事'}]});assert.equal(JSON.parse(requests.at(-1).init.body).model,'test-model');assert.equal(requests.at(-1).init.headers.Authorization,'Bearer '+key);
blobs.set('first',{size:3,httpMetadata:{contentType:'image/png'},arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer});
const v=await submitJob({...input,firstFrameId:'first'},'video-1');assert.equal(v.status,'running');const req=JSON.parse(requests.at(-1).init.body);assert.equal(req.content[1].role,'first_frame');assert(req.content[1].image_url.url.startsWith('data:image/png;base64,'));assert(!jobs.get('video-1').config.includes(key));
let count=requests.length;await submitJob(input,'video-1');assert.equal(requests.length,count,'same request ID must not create a second billable job');
downloadFail=true;assert.equal((await refreshJob('video-1')).status,'attention');downloadFail=false;
const completed=await refreshJob('video-1');assert.equal(completed.status,'succeeded');assert(completed.media.url.startsWith('/api/media/'));count=requests.length;await refreshJob('video-1');assert.equal(requests.length,count);
downloadFail=true;assert.equal((await submitJob({...input,target:'image'},'image-1')).status,'attention');downloadFail=false;assert.equal((await refreshJob('image-1')).status,'succeeded','image download retry must reuse original output');
providerFail=true;assert.equal((await submitJob(input,'timeout-1')).status,'attention');count=requests.length;await submitJob(input,'timeout-1');assert.equal(requests.length,count,'uncertain submission is never automatically retried');
await assert.rejects(()=>submitJob({...input,referenceIds:['missing']},'missing-1'));assert(!jobs.has('missing-1'));
const changed=JSON.parse(configs.get('video').body);configs.set('video',{body:JSON.stringify({...changed,baseUrl:'https://other.example.com'}),secret:sealed});
const old=jobs.get('video-1');jobs.set('video-1',{...old,status:'running'});await assert.rejects(()=>refreshJob('video-1'),/之前/);
console.log('Model tests passed: encryption, redaction, protocol payloads, input validation, idempotency, failure recovery, first-frame transport and provider-change guard.');

assert.equal(normalizeModelBase('https://api.mmg.lat'),'https://api.mmg.lat/v1');
assert.equal(normalizeModelBase('https://api.geeknow.ai/v1/images/generations'),'https://api.geeknow.ai/v1');
assert.equal(normalizeModelBase('https://api.deepseek.com'),'https://api.deepseek.com');
assert.throws(()=>normalizeModelBase('https://api.mmg.lat/console/token'));
console.log('PASS endpoint normalization and console URL rejection');

// Keep consuming the original request after the modal receives its durable acknowledgement.
const {withProgress, readApiResponse, progressType}=await imp('api-response');
let releaseProvider, acceptedJob, completedInBackground=false, upstreamCalls=0;
const providerGate=new Promise(resolve=>{releaseProvider=resolve;});
globalThis.fetch=async(url)=>{
  if(url.endsWith('/images/generations')) {
    upstreamCalls++;
    await providerGate;
    return Response.json({data:[{url:'https://cdn.example.com/result.png'}]});
  }
  return new Response('image-bytes',{headers:{'Content-Type':'image/png'}});
};
const request=new Request('https://studio.example/api/generations',{headers:{Accept:progressType}});
const response=withProgress(request,async accepted=>Response.json(await submitJob({...input,target:'asset'},'background-image',accepted)));
const result=readApiResponse(response,undefined,job=>{
  assert(jobs.has(job.id),'acknowledgement must follow durable insertion');
  assert.equal(job.status,'submitting');
  acceptedJob=job;
}).then(job=>{completedInBackground=true;return job;});
for(let i=0;i<100&&!acceptedJob;i++) await new Promise(resolve=>setTimeout(resolve,5));
assert(acceptedJob,'modal can return before provider completes');
assert.equal(completedInBackground,false);
const duplicate=await submitJob({...input,target:'asset'},'background-image');
assert.equal(duplicate.id,acceptedJob.id);
assert.equal(upstreamCalls,1,'background work must not duplicate provider requests');
releaseProvider();
assert.equal((await result).status,'succeeded');
let invalidAcknowledged=false;
const invalid=withProgress(request,async accepted=>{
  try {return Response.json(await submitJob({...input,prompt:''},'invalid-background',accepted));}
  catch(error){return Response.json({error:error.message},{status:400});}
});
await assert.rejects(()=>readApiResponse(invalid,undefined,()=>{invalidAcknowledged=true;}),/提示词/);
assert.equal(invalidAcknowledged,false,'validation failure keeps the modal open');
console.log('PASS background acknowledgement before slow provider, continued stream, single submission and preflight errors.');

// Multiple profiles retain credentials and route existing tasks to their original provider.
const {profiles,defaults}=await imp('fake');
const {listConfigs}=await imp('model-server');
const {validateVideoModel,chatVideoUrl,heimaVideoForm}=await imp('generation-server');
let route=ts.transpileModule(await fs.readFile('app/api/models/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("'@/lib/server'","'./fake.mjs'").replaceAll("'@/lib/models'","'./models.mjs'").replaceAll("'@/lib/model-server'","'./model-server.mjs'");
await fs.writeFile(`${dir}/model-route.mjs`,route);
const modelRoute=await imp('model-route');
const post=async body=>{const r=await modelRoute.POST(new Request('https://studio.example/api/models',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};};
const profileId=crypto.randomUUID();
const heima={...modelDefaults[2],id:profileId,name:'黑马 GROK',model:'grok-imagine-video',baseUrl:'https://api.mmg.lat/v1',protocol:'heima-video',enabled:true,apiKey:'another-fake-secret'};
assert.equal((await post({...heima,action:'create'})).status,200);
assert.equal((await config('video',true,profileId)).apiKey,heima.apiKey);
assert.equal((await post({...heima,apiKey:'',action:'save'})).status,200);
assert.equal((await config('video',true,profileId)).apiKey,heima.apiKey);
assert.equal((await post({...heima,apiKey:'',baseUrl:'https://other.example.org',action:'save'})).status,400);
assert.equal((await post({...heima,id:'image',action:'save'})).status,400);
assert.equal((await post({...heima,apiKey:'',action:'default'})).status,200);
assert.equal((await config('video')).id,profileId);
const listed=await listConfigs();assert.equal(listed.length,5);assert.equal(listed.filter(m=>m.kind==='video'&&m.isDefault).length,1);assert(!JSON.stringify(listed).includes('another-fake-secret'));
assert.equal((await config('image',false,'image')).id,'image');
await assert.rejects(()=>config('image',true,profileId),/找不到/);
const hi={...input,modelConfigId:profileId,duration:10,referenceIds:['first']};
const form=await heimaVideoForm(heima.model,hi,['data:image/png;base64,AQID']);assert.equal(form.get('seconds'),'10');assert.equal(form.get('size'),'1280x720');assert.equal(form.getAll('input_reference[]').length,1);assert.equal(form.get('input_reference[]').type,'image/png');
assert.throws(()=>validateVideoModel(heima,{...hi,duration:5}),/6、10或15/);
let heimaCalls=[];globalThis.fetch=async(url,init={})=>{heimaCalls.push({url,init});if(url.endsWith('/content'))return new Response('video-bytes',{headers:{'Content-Type':'video/mp4'}});if(init.method==='POST')return Response.json({task_id:'heima-task'});return Response.json({code:'success',data:{status:'SUCCESS'}});};
assert.equal((await submitJob(hi,'heima-task-local')).status,'running');assert(heimaCalls[0].init.body instanceof FormData);assert(!heimaCalls[0].init.headers['Content-Type']);assert.equal(heimaCalls[0].url,'https://api.mmg.lat/v1/videos');
defaults.set('video','video'); // Default changed while generation runs.
assert.equal((await refreshJob('heima-task-local')).status,'succeeded');assert(heimaCalls.every(r=>r.init.headers.Authorization==='Bearer another-fake-secret'));assert(heimaCalls[1].url.endsWith('/videos/heima-task'));
assert.equal(chatVideoUrl('<video src="https://cdn.example.com/result.mp4?x=1&amp;y=2" controls></video>'),'https://cdn.example.com/result.mp4?x=1&y=2');
assert.throws(()=>chatVideoUrl('<script>evil()</script>'),/链接/);
const chatId=crypto.randomUUID(),chat={...heima,id:chatId,protocol:'chat-video',model:'firefly-veo31-4s-16x9-720p'};
assert.equal((await post({...chat,action:'create'})).status,200);
let chatPosts=0,chatDownloadFail=true;
globalThis.fetch=async(url,init={})=>{if(init.method==='POST'){chatPosts++;return Response.json({choices:[{message:{content:'<video src="https://cdn.example.com/result.mp4"></video>'}}]});}return new Response('media',{status:chatDownloadFail?503:200,headers:{'Content-Type':'video/mp4'}});};
assert.equal((await submitJob({...input,duration:4,modelConfigId:chatId},'chat-video-local')).status,'attention');chatDownloadFail=false;assert.equal((await refreshJob('chat-video-local')).status,'succeeded');assert.equal(chatPosts,1);
console.log('PASS multiple configuration API, encrypted key preservation, default selection, Heima multipart and authenticated content, original-provider polling, Chat-video parsing and download-only retry.');
// The same ordered attachment legend must reach every supported video transport.
const {finalVideoPrompt}=await imp('video-request');
for (const [id, byte] of [['context-role',21],['context-scene',42],['context-blocking',63]]) {
 blobs.set(id,{size:1,httpMetadata:{contentType:'image/png'},arrayBuffer:async()=>new Uint8Array([byte]).buffer});
}
const contextInput={...input,duration:10,referenceIds:['context-role','context-scene','context-blocking'],referenceBindings:[{mediaId:'context-role',label:'角色/石头；身份外观'},{mediaId:'context-scene',label:'场景/卧室；布局光照'},{mediaId:'context-blocking',label:'本分镜站位图；位置朝向'}],prompt:'风格：电影质感；画幅16:9；分辨率720p；时长10秒。台词：石头说“我来了”。服装：灰色西装归属石头。'};
let transportCalls=[];
globalThis.fetch=async(url,init={})=>{transportCalls.push({url,init});if(init.method==='POST'){if(url.endsWith('/chat/completions'))return Response.json({choices:[{message:{content:'https://cdn.example.com/result.mp4'}}]});return Response.json({id:'remote-context-video'});}return new Response('video-result',{headers:{'Content-Type':'video/mp4'}});};
const arkJob=await submitJob({...contextInput,modelConfigId:'video'},'context-ark');
const ark=JSON.parse(transportCalls[0].init.body);
assert.equal(ark.content[0].text,finalVideoPrompt(contextInput));assert.equal(arkJob.prompt,ark.content[0].text);
assert.deepEqual(ark.content.slice(1).map(c=>c.image_url.url),['data:image/png;base64,FQ==','data:image/png;base64,Kg==','data:image/png;base64,Pw==']);
assert.deepEqual([ark.ratio,ark.duration,ark.resolution],['16:9',10,'720p']);
assert.deepEqual(arkJob.referenceBindings,contextInput.referenceBindings);
transportCalls=[];
await submitJob({...contextInput,modelConfigId:profileId},'context-heima');
const hp=transportCalls[0].init.body;assert(hp instanceof FormData);assert.equal(hp.get('prompt'),finalVideoPrompt(contextInput));assert.equal(hp.get('size'),'1280x720');
assert.deepEqual(await Promise.all(hp.getAll('input_reference[]').map(async f=>[...new Uint8Array(await f.arrayBuffer())])),[[21],[42],[63]]);
const refChatId=crypto.randomUUID();assert.equal((await post({...chat,id:refChatId,model:'firefly-veo31-ref-4s-16x9-720p',action:'create'})).status,200);
transportCalls=[];
const chatContext={...contextInput,duration:4,modelConfigId:refChatId};
await submitJob(chatContext,'context-chat');
const cp=JSON.parse(transportCalls[0].init.body).messages[0].content;assert.equal(cp[0].text,finalVideoPrompt(chatContext));assert.deepEqual(cp.slice(1).map(c=>c.image_url.url),ark.content.slice(1).map(c=>c.image_url.url));
const beforeBad=transportCalls.length;
await assert.rejects(()=>submitJob({...contextInput,referenceBindings:[...contextInput.referenceBindings].reverse()},'context-mismatch'),/不一致/);
assert.equal(transportCalls.length,beforeBad);assert(!jobs.has('context-mismatch'));
await assert.rejects(()=>submitJob({...contextInput,modelConfigId:chatId,referenceIds:['context-role'],referenceBindings:[contextInput.referenceBindings[0]],duration:4},'context-frame-misuse'),/首尾帧/);
assert.equal(transportCalls.length,beforeBad);
console.log('PASS ordered video reference mapping through Ark JSON, Heima multipart, Chat multimodal; saved request audit; parameter parity; mismatched labels/frame mode rejected before provider submission.');
// Voice samples are submitted only by supported transports; silent models omit all automatic voice context.
const voiceModelId=crypto.randomUUID();
const voiceModel={...heima,id:voiceModelId,protocol:'ark-video',model:'doubao-seedance-2-0-260128',voiceReference:'auto'};
assert.equal((await post({...voiceModel,action:'create'})).status,200);
assert.equal((await config('video',false,voiceModelId)).voiceReference,'auto');
blobs.set('voice-sample',{size:3,httpMetadata:{contentType:'audio/mpeg'},arrayBuffer:async()=>new Uint8Array([3,6,9]).buffer});
const voiceBinding={speaker:'石头',roleId:'role-a',voiceId:'voice-a',voiceName:'清亮童声',description:'清亮、自然、稍带稚气。',scope:'角色默认音色',mediaId:'voice-sample',mediaType:'audio/mpeg'};
transportCalls=[];
const voiceInput={...contextInput,modelConfigId:voiceModelId,voiceBindings:[voiceBinding]};
const voiceJob=await submitJob(voiceInput,'voice-with-sample');
const voiceBody=JSON.parse(transportCalls[0].init.body);
assert.equal(voiceBody.generate_audio,true);
assert.deepEqual(voiceBody.content.at(-1),{type:'audio_url',audio_url:{url:'data:audio/mp3;base64,AwYJ'},role:'reference_audio'});
assert(voiceBody.content[0].text.includes('说话人：石头（仅文字设定，未附参考图） → 音色设定：清亮童声'));
assert(voiceBody.content[0].text.includes('参考音频1：石头 → 清亮童声'));
assert.equal(voiceJob.voiceBindings[0].voiceId,'voice-a');
const silentId=crypto.randomUUID();assert.equal((await post({...voiceModel,id:silentId,model:'minimax_h3_no_audios',voiceReference:'audio',action:'create'})).status,200);
transportCalls=[];
const silentJob=await submitJob({...voiceInput,modelConfigId:silentId,voiceBindings:[{...voiceBinding,mediaId:'missing-voice-file'}]},'voice-silent');
const silentBody=JSON.parse(transportCalls[0].init.body);
assert(!silentBody.content.some(c=>c.type==='audio_url'));assert(!('generate_audio' in silentBody));assert(!silentBody.content[0].text.includes('清亮童声'));assert.deepEqual(silentJob.voiceBindings,[]);
const textVoiceId=crypto.randomUUID();assert.equal((await post({...voiceModel,id:textVoiceId,model:'private-endpoint',voiceReference:'text',action:'create'})).status,200);
transportCalls=[];
await submitJob({...voiceInput,modelConfigId:textVoiceId},'voice-text-only');
const textVoiceBody=JSON.parse(transportCalls[0].init.body);assert(textVoiceBody.content[0].text.includes('清亮童声'));assert(!textVoiceBody.content.some(c=>c.type==='audio_url'));
// Unknown endpoints don't guess voice capabilities, and metadata validation occurs before paid requests.
transportCalls=[];
await submitJob({...voiceInput,modelConfigId:'video'},'voice-unknown');
assert(!JSON.parse(transportCalls[0].init.body).content[0].text.includes('清亮童声'));
const beforeVoiceInvalid=transportCalls.length;
await assert.rejects(()=>submitJob({...voiceInput,voiceBindings:[{...voiceBinding,scope:null}]},'voice-invalid'),/音色/);assert.equal(transportCalls.length,beforeVoiceInvalid);
// A real 9MB image + 4MB image now reaches the provider, exceeding both old thresholds.
const large1=new Uint8Array(9*1024*1024),large2=new Uint8Array(4*1024*1024);
blobs.set('large-image-1',{size:large1.length,httpMetadata:{contentType:'image/png'},arrayBuffer:async()=>large1.buffer});
blobs.set('large-image-2',{size:large2.length,httpMetadata:{contentType:'image/png'},arrayBuffer:async()=>large2.buffer});
let largePosted=false;
globalThis.fetch=async(url,init)=>{const body=JSON.parse(init.body);assert.equal(body.content.filter(c=>c.type==='image_url').length,2);assert(body.content[1].image_url.url.length>12*1024*1024);largePosted=true;return Response.json({id:'large-remote'});};
assert.equal((await submitJob({...input,modelConfigId:'video',referenceIds:['large-image-1','large-image-2']},'large-references')).status,'running');assert(largePosted);
console.log('PASS voice audio transport + speaker mapping, text-only capability, silent/unknown automatic omission, capability persistence, preflight validation, and actual 13MB references (including a 9MB image). No paid requests.');

// Concurrent task queries share a download and only finish after local storage.
const source=jobs.get('large-references');
let statusQueries=0, outputDownloads=0, releaseOutput;
globalThis.fetch=async(url, init={})=>{
 assert(!init.method || init.method==='GET', 'polling must never submit a paid task');
 if(String(url).includes('/contents/generations/tasks/')){statusQueries++;return Response.json({status:'succeeded',content:{video_url:'https://cdn.example.com/automatic.mp4'}});}
 if(url==='https://cdn.example.com/automatic.mp4'){
  outputDownloads++;
  await new Promise(resolve=>{releaseOutput=resolve;});
  return new Response(new Uint8Array(13*1024*1024), {headers:{'Content-Type':'video/mp4'}});
 }
 throw Error('unexpected refresh URL');
};
const downloadOne=refreshJob('large-references');
const downloadTwo=refreshJob('large-references');
while(!releaseOutput) await new Promise(resolve=>setTimeout(resolve,1));
assert.equal(jobs.get('large-references').status,'downloading');
releaseOutput();
const [autoOne,autoTwo]=await Promise.all([downloadOne,downloadTwo]);
assert.equal(autoOne.status,'succeeded'); assert.equal(autoOne.media.id,autoTwo.media.id);
assert.equal(statusQueries,1);assert.equal(outputDownloads,1);
assert(autoOne.media.url.startsWith('/api/media/'));
await refreshJob('large-references');assert.equal(outputDownloads,1);
console.log('PASS automatic video download, durable downloading status, concurrent-query coalescing, >12MB without content length and completed-task idempotency.');

// MiniMax H3 follows the supplied JSON contract, not GROK multipart.
const {upgradeVideoConfig}=await imp('models');
const migrated=upgradeVideoConfig({kind:'video',model:'minimax_h3_no_audios',protocol:'heima-video'});
assert.equal(migrated.model,'minimax_h3');assert.equal(migrated.protocol,'heima-minimax');assert.equal(migrated.voiceReference,'none');
const mm={...JSON.parse(configs.get('video').body),kind:'video',model:'minimax_h3',protocol:'heima-minimax',baseUrl:'https://api.mmg.lat/v1',voiceReference:'auto'};
configs.set('video',{...configs.get('video'),body:JSON.stringify(mm)});
const mmInput={...input,modelConfigId:'video',referenceIds:['first'],referenceBindings:[{mediaId:'first',label:'角色/石头'}],resolution:'768p',duration:11,mediaUrls:{first:'https://cdn.example.com/role.png'}};
let mmPayload, mmCalls=[];
globalThis.fetch=async(url,init={})=>{
 mmCalls.push({url,init});
 if(init.method==='POST'){
  assert.equal(init.headers['Content-Type'],'application/json');mmPayload=JSON.parse(init.body);
  return Response.json({id:'public-task',task_id:'internal-task',status:'queued'});
 }
 if(url==='https://api.mmg.lat/v1/videos/public-task')return Response.json({id:'public-task',task_id:'different-internal-task',status:'completed',progress:100,video_url:'https://api.mmg.lat/v1/videos/public-task/content'});
 if(url==='https://api.mmg.lat/v1/videos/public-task/content'){assert.match(init.headers.Authorization,/^Bearer /);return new Response('video',{headers:{'Content-Type':'video/mp4'}});}
 throw Error('unexpected MiniMax URL '+url);
};
assert.equal((await submitJob(mmInput,'minimax-1')).status,'running');
assert.deepEqual(Object.keys(mmPayload).sort(),['aspect_ratio','images','model','prompt','resolution','seconds'].sort());
assert.equal(mmPayload.model,'minimax_h3');assert.equal(mmPayload.seconds,'11');assert.equal(mmPayload.resolution,'768p');assert.deepEqual(mmPayload.images,['https://cdn.example.com/role.png']);
assert.equal(jobs.get('minimax-1').remote_id,'public-task');
assert.equal((await refreshJob('minimax-1')).status,'succeeded');
await assert.rejects(()=>submitJob({...mmInput,resolution:'720p'},'bad-mm-resolution'),/480p/);
await assert.rejects(()=>submitJob({...mmInput,duration:4},'bad-mm-duration'),/5/);
await assert.rejects(()=>submitJob({...mmInput,referenceIds:Array.from({length:9},(_,i)=>'r'+i),referenceBindings:undefined},'bad-mm-images'),/8/);
await assert.rejects(()=>submitJob({...mmInput,mediaUrls:undefined},'missing-public-url'),/素材链接/);
const sourceJob={project_id:input.projectId,status:'succeeded',remote_id:'https://cdn.example.com/generated-role.png',body:JSON.stringify({media:{id:'first'}})};
jobs.set('generated-source',sourceJob);
assert.equal((await submitJob({...mmInput,mediaUrls:undefined},'auto-source-mm')).status,'running');assert.equal(mmPayload.images[0],sourceJob.remote_id);
blobs.set('mm-audio',{httpMetadata:{contentType:'audio/mpeg'}});
const voiced={...mmInput,voiceBindings:[{speaker:'石头',voiceName:'童声',description:'清亮',scope:'台词1',mediaId:'mm-audio',mediaType:'audio/mpeg'}],mediaUrls:{...mmInput.mediaUrls,'mm-audio':'https://cdn.example.com/voice.mp3'}};
await submitJob(voiced,'voiced-mm');assert.deepEqual(mmPayload.audios,['https://cdn.example.com/voice.mp3']);assert(mmPayload.prompt.includes('对应参考音频1'));
configs.set('video',{...configs.get('video'),body:JSON.stringify({...mm,voiceReference:'none'})});
await submitJob({...voiced,mediaUrls:mmInput.mediaUrls},'unvoiced-mm');assert(!('audios' in mmPayload));assert(!mmPayload.prompt.includes('对应参考音频1'));
const {modelRequest}=await imp('model-server');
globalThis.fetch=async()=>Response.json({error:{code:'invalid_resolution',message:'resolution must be 768p; Bearer secret; sk-secret-value'}},{status:500,headers:{'x-request-id':'request-test'}});
await assert.rejects(()=>modelRequest({...mm,apiKey:'secret'},'/videos',{}),e=>e.message.includes('768p')&&e.message.includes('request-test')&&!e.message.includes('Bearer secret')&&!e.message.includes('sk-secret-value'));
console.log('PASS MiniMax JSON, legacy upgrade, model parameters, 8 images, audio URL binding/omission, original image URL recovery, private URL preflight, stable public task ID, authenticated download and redacted provider diagnostics.');

// The production failure used MiniMax over Chat. Normalize only the known supplier alias.
for (const protocol of ['chat-video','heima-minimax']) {
 const fixed = validateModel({...mm, protocol, model:'minimax_h3_no_audios'});
 assert.equal(fixed.protocol,'heima-minimax'); assert.equal(fixed.model,'minimax_h3'); assert.equal(fixed.voiceReference,'none');
}
assert.equal(upgradeVideoConfig({...mm,baseUrl:'https://other.example.com/v1',protocol:'chat-video',model:'minimax_h3_no_audios'}).protocol,'chat-video');
assert.equal(chatVideoUrl([{type:'text',text:'[视频](https://cdn.example.com/result.mp4)'}]),'https://cdn.example.com/result.mp4');
const customChat={...mm,id:'video',protocol:'chat-video',model:'custom-video',baseUrl:'https://other.example.com/v1'};
configs.set('video',{...configs.get('video'),body:JSON.stringify(customChat)});
globalThis.fetch=async()=>Response.json({id:'request-public',error:{message:'secret-never-store'},choices:[]},{headers:{'x-request-id':'request-123'}});
const malformed=await submitJob({...input,modelConfigId:'video',referenceIds:[]},'missing-chat-content');
assert.equal(malformed.status,'attention');assert.equal(malformed.diagnostics[0].requestId,'request-123');assert.equal(malformed.diagnostics[0].contentType,'undefined');
assert(!JSON.stringify(malformed).includes('secret-never-store'));
await assert.rejects(()=>refreshJob(malformed.id),/没有可查询/);
configs.set('video',{...configs.get('video'),body:JSON.stringify({...mm,protocol:'chat-video',model:'minimax_h3_no_audios'})});
let migrationRequests=[];
globalThis.fetch=async(url,init)=>{migrationRequests.push({url,body:JSON.parse(init.body)});return Response.json({id:'recovered-protocol-task',status:'queued'},{headers:{'x-request-id':'mmg-request'}});};
const corrected=await submitJob(mmInput,'corrected-chat-minimax');
assert.equal(corrected.status,'running');assert.equal(migrationRequests.length,1);assert.equal(migrationRequests[0].url,'https://api.mmg.lat/v1/videos');assert.equal(migrationRequests[0].body.model,'minimax_h3');assert(!migrationRequests[0].body.messages);assert(!migrationRequests[0].body.audios);
assert.equal(corrected.diagnostics[0].providerTaskId,'recovered-protocol-task');assert.equal(corrected.diagnostics[0].requestId,'mmg-request');
console.log('PASS MiniMax Chat misconfiguration correction, original-task diagnostics, missing-ID recovery explanation, safe logs and structured Chat content.');
