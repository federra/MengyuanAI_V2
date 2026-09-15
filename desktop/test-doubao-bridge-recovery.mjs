import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import {createRequire} from 'node:module';
const {DoubaoManager}=createRequire(import.meta.url)('./doubao-manager.cjs');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-bridge-recovery-'));
const backend=http.createServer(async(req,res)=>{for await(const _ of req){}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:'saved-video',kind:'video'}));});
await new Promise(resolve=>backend.listen(0,'127.0.0.1',resolve));
const m=await new DoubaoManager({root,backend:()=>({origin:`http://127.0.0.1:${backend.address().port}`,token:'fixture'}),launch:async()=>({}),fetchMedia:async()=>new Response('video bytes',{headers:{'Content-Type':'video/mp4'}})}).start();
clearInterval(m.timer);m.requestWake=()=>{};
const source=(await fs.readFile(new URL('../browser-extension/background.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
const storage={},tabs=[],sent=[],created=[],closed=[];
let online=true,tabSequence=10,hasResult=false,inspected=0;
const functions=Object.fromEntries(['configureVideo','prepareTask','readPageState','readLoginState','labelAccount','inspectComposer','enterCreation','confirmVideo','probeResult','readGenerationProgress'].map(name=>[name,{[name]:function(){}}[name]]));
const chrome={
 runtime:{getURL:()=> 'chrome-extension://fixture/',onMessage:{addListener(){}},onStartup:{addListener(){}}},action:{onClicked:{addListener(){}}},alarms:{create:async()=>{},onAlarm:{addListener(){}}},
 storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,structuredClone(storage[k])])),set:async patch=>Object.assign(storage,structuredClone(patch))}},
 tabs:{query:async()=>structuredClone(tabs),get:async id=>structuredClone(tabs.find(t=>t.id===id)),create:async opts=>{const t={id:++tabSequence,...opts,status:'loading'};tabs.push(t);created.push(t.url);return structuredClone(t);},remove:async id=>{closed.push(id);tabs.splice(tabs.findIndex(t=>t.id===id),1);},reload:async()=>{},sendMessage:async(id,message)=>{sent.push({id,message});return {ok:true};}},
 scripting:{executeScript:async({func,target})=>{
   const tab=tabs.find(t=>t.id===target.tabId);
   if(['inspectComposer','readPageState','configureVideo','prepareTask'].includes(func.name)){inspected++;throw Error('submitted tasks must not wait for a creation composer');}
   if(func.name==='probeResult')return [{result:hasResult&&tab.url==='https://www.doubao.com/chat/123'?{url:tab.url,messageId:'result-message'}:null}];
   if(func.name==='confirmVideo')return [{result:{needed:false}}];
   if(func.name==='readGenerationProgress')return [{result:null}];
   return [{result:(await m.snapshot()).helper.version}];
 }}
};
let account;
function worker(){
 const context=vm.createContext({chrome,...functions,URL,AbortSignal,structuredClone,fetch:async(url,opts)=>{
   if(!online)throw Error('fixture desktop temporarily offline');
   return Response.json(url.endsWith('/next')?await m.claim(account):await m.event(account,JSON.parse(opts.body)));
 }});
 vm.runInContext(source+'\nglobalThis.test={handle,poll,flushEvents,closeReturnedTasks};',context);return context.test;
}
const idle=()=>Object.assign(account,{runtimeState:'idle',runtimeAt:Date.now(),idleSamples:2,creationReady:true,lastSeen:Date.now()});
try{
 await m.command('account',{name:'A',group:'视频组'});account=m.state.accounts[0];
 await m.command('participation',{ids:[account.id],selected:true});idle();
 const bundle={format:'director-doubao-task',version:1,projectId:'p',tasks:['one','two'].map(id=>({id,title:id,prompt:'当前分镜的原始提示词，仅匹配这一条视频',references:[]})),media:[]};
 await assert.rejects(m.command('enqueue',{bundle,accountIds:[account.id],group:''}),/选择账号分组/);
 assert.equal(m.state.jobs.length,0,'missing group cannot enqueue');
 await assert.rejects(m.command('enqueue',{bundle,accountIds:[account.id],group:'另一组'}),/选择账号分组/);
 await m.command('enqueue',{bundle,accountIds:[account.id],group:'视频组'});
 const first=(await m.claim(account)).job;
 Object.assign(storage,{connection:{url:'http://fixture',accountId:account.id,token:'fixture'},activeJob:first,taskTab:1});
 tabs.push({id:1,url:'https://www.doubao.com/chat/123',status:'complete'});
 const sender={tab:tabs[0]};let w=worker();online=false;
 await assert.rejects(w.handle({type:'event',event:{type:'submitted',jobId:first.id,requestId:'r1'}},sender),/offline/);
 assert.equal(storage.activeJob.requestId,'r1');assert.equal(storage.eventOutbox.length,1);
 await assert.rejects(w.handle({type:'harvest',requestId:'r1',identities:[{videoId:'v1'}],media:[{kind:'video',videoId:'v1',original:true,url:'https://www.doubao.com/original.mp4'}]},sender),/offline/);
 assert.deepEqual(storage.eventOutbox.map(e=>e.event.type),['submitted','identity','result'],'identity and result are both durable before any delivery');
 w=worker();online=true;await w.flushEvents();await Promise.all([...m.downloadJobs]);
 assert.equal(storage.eventOutbox.length,0);assert.equal(m.state.jobs[0].status,'succeeded');
 assert.equal(m.state.jobs[0].media.id,'saved-video');assert.equal(m.stats(account).submitted,1);
 await w.handle({type:'event',event:{type:'submitted',jobId:first.id,requestId:'r1'}},sender);
 assert.equal(m.stats(account).submitted,1,'submission retry never consumes a second quota entry');
 assert.equal(m.state.jobs[1].status,'queued','no parallel job on the same account while returning');
 await w.closeReturnedTasks(await m.claim(account));assert.deepEqual(closed,[1]);
 idle();const second=(await m.claim(account)).job;assert.equal(second.shotId,'two','next task becomes available after terminal plus fresh idle');
 await m.event(account,{type:'submitted',jobId:second.id,requestId:'r2'});
 await m.event(account,{type:'conversationBound',jobId:second.id,requestId:'r2',url:'https://www.doubao.com/chat/123'});
 await m.event(account,{type:'generationWaiting',jobId:second.id,requestId:'r2',url:'https://www.doubao.com/chat/123',summary:'原视频正在生成，请等待。'});
 m.state.jobs[1].waitStartedAt=Date.now()-21*60000;await m.expire();
 assert.equal(m.state.jobs[1].status,'attention');
 Object.assign(storage,{activeJob:null,taskTab:3,waitingJobs:{}});tabs.push({id:3,url:'https://www.doubao.com/chat/999',status:'complete'});
 w=worker();hasResult=true;await w.poll();
 assert.deepEqual(created,['https://www.doubao.com/chat/123'],'restart reopens the saved conversation, never guesses another tab');
 tabs.find(t=>t.id!==3).status='complete';await w.poll();await w.poll();
 assert.equal(created.length,1,'polling does not repeatedly open the original conversation');
 assert.equal(inspected,0,'result tracking does not depend on the creation form');
 assert.ok(sent.some(s=>s.message.type==='probeVideo'&&s.id!==3));
 assert.equal(m.state.jobs[1].status,'attention','a video card alone is not a saved video');
 assert.ok(m.state.jobs[1].resultDetectedAt,'timed-out jobs continue exact result recovery');
 assert.equal(tabs.find(t=>t.id===3).url,'https://www.doubao.com/chat/999','unrelated conversation remains untouched');
 // A saved pre-navigation creation URL must not strand the original tab when
 // Doubao changes its URL after the submission response arrives.
 delete m.state.jobs[1].conversationUrl;
 Object.assign(storage,{activeJob:m.state.jobs[1],taskTab:3,waitingJobs:{[second.id]:{job:m.state.jobs[1],tabId:3,url:'https://www.doubao.com/chat/create-image'}}});
 tabs.find(t=>t.id===3).url='https://www.doubao.com/chat/456';hasResult=false;await w.poll();
 assert.equal(m.state.jobs[1].conversationUrl,'https://www.doubao.com/chat/456','follow assigned tab through SPA navigation before binding a conversation');
 // Older stored videos may have a video ID but no conversation or local tab.
 Object.assign(m.state.jobs[1],{videoId:'v2',recoveryKey:'recover-known',status:'submitted'});delete m.state.jobs[1].conversationUrl;
 Object.assign(storage,{activeJob:null,taskTab:null,waitingJobs:{}});sent.length=0;await w.poll();
 assert.ok(sent.some(s=>s.message.type==='arm'&&s.message.job.videoId==='v2'&&s.message.job.recoveryKey==='recover-known'));
 await w.poll();
 assert.equal(m.state.jobs[1].conversationUrl,undefined,'video-ID lookup never binds an unrelated conversation');
 console.log('PASS durable submission/identity/result replay after worker restart, one quota record, media receipt, terminal+idle→next task, explicit group preflight, exact conversation recovery after timeout, no composer dependency and no repeated generation.');
}finally{await m.stop();await new Promise(resolve=>backend.close(resolve));}
