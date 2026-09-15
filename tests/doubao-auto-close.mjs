import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const job={id:'first',requestId:'r-first',status:'submitted'};
const store={connection:{url:'http://127.0.0.1:1234',token:'test'},activeJob:job,taskTab:1,waitingJobs:{}};
const tabs=new Map([[1,{id:1,url:'https://www.doubao.com/chat/123'}],[2,{id:2,url:'https://www.doubao.com/chat/456'}]]);
const closed=[];let failClose=false;
const chrome={
 storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,structuredClone(store[k])])),set:async p=>Object.assign(store,structuredClone(p))}},
 runtime:{getURL:()=> 'chrome-extension://test/',onMessage:{addListener(){}},onStartup:{addListener(){}}},
 action:{onClicked:{addListener(){}}},alarms:{create:async()=>{},onAlarm:{addListener(){}}},
 tabs:{get:async id=>{if(!tabs.has(id))throw Error('No tab with id: '+id);return tabs.get(id);},remove:async id=>{if(failClose)throw Error('temporary failure');closed.push(id);tabs.delete(id);},query:async()=>[...tabs.values()],sendMessage:async()=>{}},
 scripting:{executeScript:async()=>[]}
};
const ctx=vm.createContext({chrome,URL,AbortSignal,Map,Set,Date,fetch:async()=>Response.json({ok:true})});
vm.runInContext((await fs.readFile('browser-extension/background.js','utf8')).replace(/^import .*;\r?\n/gm,'')+'\nglobalThis.test={closeReturnedTasks,trackWaiting,handle,poll};',ctx);
// Fast results must retain their original page even without a waiting message.
await ctx.test.handle({type:'harvest',requestId:job.requestId,media:[{kind:'video',original:true,url:'https://test.byteimg.com/video.mp4'}]},{tab:tabs.get(1)});
assert.equal(store.waitingJobs.first.tabId,1);
const next={jobStates:[{...job,status:'downloading',returned:false}],waitingJobs:[]};
await ctx.test.trackWaiting(next,[...tabs.values()]);
assert.equal(store.waitingJobs.first.tabId,1,'download must not lose the tab mapping');
for(const state of [{status:'downloading',returned:false},{status:'attention',returned:false},{status:'failed',returned:false},{status:'succeeded',returned:false}]){
 next.jobStates=[{...job,...state}];await ctx.test.closeReturnedTasks(next);assert.equal(closed.length,0);
}
next.jobStates=[{...job,status:'succeeded',returned:true,requestId:'wrong'}];
await ctx.test.closeReturnedTasks(next);assert.equal(closed.length,0,'receipt must match original request');
next.jobStates=[{...job,status:'succeeded',returned:true}];
store.activeJob={id:'second',requestId:'r-second'};store.taskTab=2;
store.waitingJobs.second={job:store.activeJob,tabId:2,url:tabs.get(2).url};
failClose=true;await ctx.test.closeReturnedTasks(next);assert(store.waitingJobs.first,'transient close failure remains retryable');
failClose=false;await ctx.test.closeReturnedTasks(next);
assert.deepEqual(closed,[1]);assert(tabs.has(2));assert.equal(store.activeJob.id,'second');assert.equal(store.taskTab,2);
assert(!store.waitingJobs.first);await ctx.test.closeReturnedTasks(next);assert.deepEqual(closed,[1]);
// Browser already closed: clean stale receipt without touching another tab.
store.waitingJobs.first={job,tabId:99,url:'https://www.doubao.com/chat/123'};
await ctx.test.closeReturnedTasks(next);assert(!store.waitingJobs.first);
// Do not close a tab reassigned to another task, or one the user navigated away.
store.waitingJobs.first={job,tabId:2,url:tabs.get(2).url};
await ctx.test.closeReturnedTasks(next);assert(tabs.has(2));
store.waitingJobs.first={job,tabId:3,url:'https://www.doubao.com/chat/789'};
tabs.set(3,{id:3,url:'https://www.doubao.com/chat/999'});
await ctx.test.closeReturnedTasks(next);assert(tabs.has(3));
tabs.get(3).url=store.waitingJobs.first.url;
await ctx.test.closeReturnedTasks(next);assert.deepEqual(closed,[1,3]);
// Download polling must not rebind an independent active task to the old job.
ctx.fetch=async()=>Response.json({job:{...job,status:'downloading'},jobStates:[],settings:{}});
await ctx.test.poll();assert.equal(store.activeJob.id,'second');assert.equal(store.taskTab,2);
// The final task tab closes once its own receipt arrives; no blanket window kill.
next.jobStates=[{...store.activeJob,status:'succeeded',returned:true}];
await ctx.test.closeReturnedTasks(next);assert.deepEqual(closed,[1,3,2]);assert.equal(store.activeJob,null);assert.equal(store.taskTab,null);
console.log('PASS receipt-gated close, fast result tracking, download/failure retention, exact task/request/tab isolation, retry, stale tabs and final-tab closure.');
