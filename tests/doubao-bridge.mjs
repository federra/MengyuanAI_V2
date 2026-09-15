import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const storage={connection:{url:'http://127.0.0.1:8787',token:'a'.repeat(64)},activeJob:{id:'job-1',status:'prepared',task:{prompt:'原始提示词'},settings:{},bundle:{}},taskTab:7};
const calls=[],downloads=[];
const chrome={storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,structuredClone(storage[k])])),set:async patch=>Object.assign(storage,structuredClone(patch)),remove:async keys=>keys.forEach(k=>delete storage[k])}},runtime:{getURL:()=> 'chrome-extension://'+ 'a'.repeat(32)+'/',onMessage:{addListener(){}},onStartup:{addListener(){}},openOptionsPage(){}},action:{onClicked:{addListener(){}}},alarms:{onAlarm:{addListener(){}},create:async()=>{},clear:async()=>{}},downloads:{download:async data=>{downloads.push(data);return 9;}},tabs:{query:async()=>[],sendMessage:async()=>({ok:true})},scripting:{executeScript:async()=>[]}};
const ctx=vm.createContext({chrome,URL,AbortSignal,Map,Set,Date,structuredClone,prepareTask:async()=>{},fetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({ok:true}),{headers:{'content-type':'application/json'}});}});
vm.runInContext((await fs.readFile('browser-extension/background.js','utf8')).replace(/^import .*;\r?\n/gm,'')+'\nglobalThis.handleTest=handle;',ctx);
const site={tab:{id:7,url:'https://www.doubao.com/chat/'}},other={tab:{id:8,url:'https://www.doubao.com/chat/'}};
await assert.rejects(ctx.handleTest({type:'event',event:{type:'submitted',jobId:'job-1',requestId:'r1'}},other),/不一致/);
await ctx.handleTest({type:'event',event:{type:'submitted',jobId:'job-1',requestId:'r1'}},site);
assert.equal(calls.length,1);assert.equal(storage.activeJob.requestId,'r1');
await ctx.handleTest({type:'event',event:{type:'submitted',jobId:'job-1',requestId:'r1'}},site);assert.equal(calls.length,2);
await ctx.handleTest({type:'harvest',requestId:'old-request',identities:[{videoId:'old'}],media:[{kind:'video',url:'https://test.byteimg.com/old.mp4',original:true,videoId:'old'}]},site);assert.equal(calls.length,2,'old conversation must not bind');
await ctx.handleTest({type:'harvest',requestId:'r1',identities:[{videoId:'v1',messageId:'m1'}],media:[]},site);
assert.equal(storage.activeJob.videoId,'v1');
await ctx.handleTest({type:'harvest',requestId:'',media:[{kind:'video',url:'https://test.byteimg.com/other.mp4',original:true,videoId:'v2'}]},site);assert.equal(calls.length,3);
await ctx.handleTest({type:'harvest',requestId:'',media:[{kind:'video',url:'https://test.byteimg.com/correct.mp4',original:true,videoId:'v1'}]},site);assert.equal(calls.length,4);assert.equal(calls[3].body.type,'result');
await assert.rejects(ctx.handleTest({type:'downloadOriginal',media:{original:true,kind:'video',url:'http://127.0.0.1/private'}},site),/无效/);
await ctx.handleTest({type:'downloadOriginal',media:{original:true,kind:'video',url:'https://test.byteimg.com/correct.mp4'}},site);assert.equal(downloads.length,1);
console.log('PASS Chrome bridge: tab ownership, duplicate submission protection, old/unmatched video rejection, correlated original result return, download URL restriction.');
// An earlier video may return after a later task owns the foreground tab.
storage.waitingJobs={'job-1':{tabId:7,job:structuredClone(storage.activeJob)}};
storage.activeJob={id:'job-2',requestId:'r2',status:'submitted'};storage.taskTab=8;
await ctx.handleTest({type:'harvest',requestId:'r1',media:[{kind:'video',url:'https://test.byteimg.com/late.mp4',original:true,videoId:'v1'}]},site);
assert.equal(calls.at(-1).body.jobId,'job-1');assert.equal(storage.activeJob.id,'job-2');
await assert.rejects(ctx.handleTest({type:'event',event:{type:'failed',jobId:'job-2',error:'wrong tab'}},site),/不一致/);
console.log('PASS late video stays bound to its original tab/job while the next job is active.');

// Concurrent panel and background preparation must never click the same task twice.
const prepStore={activeJob:{id:'click-job',status:'prepared'},connection:storage.connection};
let clicks=0,prepares=0,finishPrepare;
const gate=new Promise(r=>{finishPrepare=r;});
const pageProbe=()=>{};
const prepChrome={...chrome,storage:{local:{...chrome.storage.local,get:async keys=>Object.fromEntries(keys.map(k=>[k,structuredClone(prepStore[k])])),set:async patch=>Object.assign(prepStore,structuredClone(patch))}},scripting:{executeScript:async request=>{
 if(request.func===watermarkFunction)return [{result:watermarkResult}];
 if(request.func===configFunction)return [{result:{ok:true,steps:['模型已确认']}}];
 if(request.func===pageProbe)return [{result:{state:'idle'}}];
 if(request.func===prepFunction){prepares++;await gate;return [{result:{ok:true,readyToSubmit:true}}];}
 clicks++;return [{result:{ok:true}}];
}}};
const prepFunction=()=>{};
const configFunction=()=>{};
const watermarkFunction=()=>{};let watermarkResult={ok:true,steps:[]};
const prepCtx=vm.createContext({chrome:prepChrome,URL,AbortSignal,Map,Set,Date,prepareTask:prepFunction,configureVideo:configFunction,configureWatermark:watermarkFunction,readPageState:pageProbe,fetch:async(url,init)=>Response.json(url.endsWith('/next')?{job:{id:'click-job',status:'prepared'},enabled:true,paused:false}:{ok:true})});
vm.runInContext((await fs.readFile('browser-extension/background.js','utf8')).replace(/^import .*;\r?\n/gm,'')+'\nglobalThis.prepareTest=prepareCurrent;',prepCtx);
const clickJob={id:'click-job',settings:{submitSelector:'.submit'},status:'prepared'};
const once=prepCtx.prepareTest(clickJob,7),twice=prepCtx.prepareTest(clickJob,7);
finishPrepare();await Promise.all([once,twice]);assert.equal(prepares,1);assert.equal(clicks,1);
await prepCtx.prepareTest(clickJob,7);assert.equal(clicks,1,'manual retry cannot click an already attempted submission');
console.log('PASS concurrent panel/poll preparation and repeated automatic click prevention.');

const preparedBeforeFailure=prepares;
watermarkResult={ok:false,error:'水印设置未生效'};
prepStore.activeJob={id:'blocked-job',status:'prepared'};
await prepCtx.prepareTest({...clickJob,id:'blocked-job'},7);
assert.equal(prepares,preparedBeforeFailure,'watermark setting failure blocks uploads and preparation');
assert.equal(clicks,1,'watermark setting failure must never submit');
console.log('PASS watermark setting failure blocks submission.');
