import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const build=JSON.parse(await fs.readFile('browser-extension/manifest.json','utf8')).version;
const url='https://www.doubao.com/chat/123';
const job={id:'job',status:'submitted',requestId:'original-request',conversationUrl:url,task:{prompt:'原分镜足够长的唯一提示词'},retrieval:{key:'attempt',status:'fetching',deadlineAt:Date.now()+60000}};
const store={connection:{url:'http://127.0.0.1:1234',token:'test'},waitingJobs:{}};
const events=[],sent=[],opened=[];const probe=null;let progress={url,summary:'正在生成视频，请耐心等待'},confirmationClicks=0,staleTabId=0,missingObserverTabId=0,reloads=0;
const probeResult=()=>{},readGenerationProgress=()=>{},confirmVideo=()=>{};
const chrome={storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,structuredClone(store[k])])),set:async p=>Object.assign(store,structuredClone(p))}},runtime:{getURL:()=>'',onMessage:{addListener(){}},onStartup:{addListener(){}}},action:{onClicked:{addListener(){}}},alarms:{create(){},onAlarm:{addListener(){}}},tabs:{create:async input=>{opened.push(input);return {id:opened.length+1,url:input.url};},reload:async()=>{reloads++;},sendMessage:async(id,m)=>{if(id===staleTabId)throw Error('Could not establish connection. Receiving end does not exist.');sent.push({...m,tabId:id});}},scripting:{executeScript:async({func,target})=>{if(func===probeResult)return [{result:probe}];if(func===readGenerationProgress)return [{result:progress}];if(func===confirmVideo){confirmationClicks++;return [{result:{needed:true,prompt:'付费确认',url}}];}return [{result:target.tabId===staleTabId?'0.13.5':target.tabId===missingObserverTabId?undefined:build}];}}};
const ctx=vm.createContext({chrome,URL,AbortSignal,Map,Set,Date,probeResult,readGenerationProgress,confirmVideo,readResultIdentity:()=>{},fetch:async(_url,init)=>{events.push(JSON.parse(init.body));return Response.json({ok:true});}});
vm.runInContext((await fs.readFile('browser-extension/background.js','utf8')).replace(/^import .*;\r?\n/gm,'')+'\nglobalThis.track=trackWaiting;',ctx);
await ctx.track({enabled:true,paused:false,waitingJobs:[job],settings:{}},[{id:1,url}]);
assert.equal(confirmationClicks,0,'explicit retrieval must never confirm generation');assert(events.some(e=>e.type==='retrievalFailed'&&e.reason==='still_generating'&&e.retrievalKey==='attempt'));assert.equal(opened.length,0);
progress=null;events.length=0;job.retrieval={...job.retrieval,key:'retry'};
await ctx.track({enabled:true,paused:false,waitingJobs:[job],settings:{}},[{id:1,url}]);assert.equal(confirmationClicks,0,'missing result also cannot call confirmation');
job.videoId='saved-video';job.conversationUrl='';job.recoveryKey='retry';store.waitingJobs={};sent.length=0;
await ctx.track({enabled:false,paused:true,waitingJobs:[job],settings:{}},[]);assert.equal(opened.length,1,'known video uses an isolated read-only page instead of an unrelated active task');assert(sent.some(m=>m.type==='arm'&&m.job.videoId==='saved-video'));
job.videoId='';job.conversationUrl='';store.waitingJobs={};events.length=0;
await ctx.track({enabled:false,paused:true,waitingJobs:[job],settings:{}},[]);assert(events.some(e=>e.type==='retrievalFailed'&&e.reason==='missing_identity'));assert.equal(opened.length,1);

// Upgrading the worker leaves original-page content scripts invalidated. A
// saved video must recover through a fresh page without refreshing the chat.
job.videoId='saved-video';job.conversationUrl=url;job.status='attention';
store.waitingJobs={};opened.length=0;sent.length=0;events.length=0;staleTabId=1;
const originalTab={id:1,url};
await ctx.track({enabled:false,paused:true,waitingJobs:[job],settings:{}},[originalTab]);
assert.equal(opened.length,1,'known video on an old observer must obtain a new playback page');
assert.equal(reloads,0,'never refresh the original generation conversation or its draft');
assert.equal(store.waitingJobs[job.id].tabId,2);assert.equal(store.waitingJobs[job.id].playbackOnly,true);
assert.equal(job.conversationUrl,url,'original conversation identity stays intact');
await ctx.track({enabled:false,paused:true,waitingJobs:[job],settings:{}},[originalTab,{id:2,url:opened[0].url}]);
assert.equal(opened.length,1,'subsequent polls reuse the isolated playback page');
assert(sent.some(m=>m.type==='arm'&&m.tabId===2&&m.job.videoId==='saved-video'));
assert(!sent.some(m=>m.tabId===1));assert(!events.some(e=>e.type==='retrievalFailed'));
// Failed page injection must not spawn an unbounded chain while tracking.
missingObserverTabId=2;
const preservedTabs=[originalTab,{id:2,url:opened[0].url}];
await ctx.track({waitingJobs:[job],settings:{}},preservedTabs);
assert.equal(opened.length,1,'a missing observer on the fallback page cannot create another page for this attempt');
assert(events.some(e=>e.type==='retrievalFailed'&&e.reason==='page_error'&&e.retrievalKey==='retry'));
job.retrieval.status='failed';
await ctx.track({waitingJobs:[job],settings:{}},preservedTabs);
assert.equal(opened.length,1,'failed retrieval keeps tracking without repeatedly opening pages');
assert.equal(store.waitingJobs[job.id].job.requestId,'original-request');
job.retrieval={...job.retrieval,status:'fetching',key:'explicit-next-attempt'};
await ctx.track({waitingJobs:[job],settings:{}},preservedTabs);
assert.equal(opened.length,2,'an explicit new attempt may replace the page whose injection failed');
assert.equal(store.waitingJobs[job.id].tabId,3);assert.equal(reloads,0);
await ctx.track({waitingJobs:[job],settings:{}},[...preservedTabs,{id:3,url:opened[1].url}]);
assert.equal(opened.length,2);assert(sent.some(m=>m.type==='arm'&&m.tabId===3));

assert(events.every(e=>!['submissionIntent','submitted','confirmationIntent'].includes(e.type)));
console.log('PASS retrieval extension: original still generating, no confirmation or submit, known identity isolated playback and missing identity reason.');
