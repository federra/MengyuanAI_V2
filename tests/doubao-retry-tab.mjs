import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const store={connection:{url:'http://127.0.0.1:1234',token:'test'},activeJob:{id:'old'},taskTab:1};
const tabs=[{id:1,url:'https://www.doubao.com/chat/create-image',active:true}];let opened=0;
const job={id:'new',retryOf:'old',status:'prepared',prepareAttempts:3,settings:{automaticPage:true}};
const inspectComposer=()=>{};
const chrome={storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,structuredClone(store[k])])),set:async p=>Object.assign(store,structuredClone(p))}},runtime:{getURL:()=> 'chrome-extension://test/',onMessage:{addListener(){}},onStartup:{addListener(){}}},action:{onClicked:{addListener(){}}},alarms:{create:async()=>{},onAlarm:{addListener(){}}},tabs:{query:async()=>tabs,create:async({url})=>{opened++;const t={id:2,url,active:true};tabs.push(t);return t;},sendMessage:async()=>{}},scripting:{executeScript:async({func})=>[{result:func===inspectComposer?{state:'idle',settings:{automaticPage:true}}:{state:'loggedIn',nickname:'test'}}]}};
const ctx=vm.createContext({chrome,inspectComposer,readLoginState:()=>{},labelAccount:()=>{},URL,AbortSignal,Map,Set,Date,fetch:async()=>Response.json({enabled:true,paused:false,job,settings:{automaticPage:true}})});
vm.runInContext((await fs.readFile('browser-extension/background.js','utf8')).replace(/^import .*;\r?\n/gm,'')+'\nglobalThis.testPoll=poll;',ctx);
await ctx.testPoll();assert.equal(opened,1);assert.equal(store.taskTab,2);assert.equal(store.freshRetryJobId,job.id);
await ctx.testPoll();assert.equal(opened,1,'polling does not open endless retry tabs');assert.equal(tabs[0].id,1,'original conversation is preserved');
console.log('PASS a manual retry uses one fresh creation tab and preserves its original conversation.');
const waiting={id:'waiting',status:'submitted',requestId:'r-waiting',generationAcceptedAt:Date.now(),task:{prompt:'原分镜'},conversationUrl:tabs[0].url};
store.activeJob=waiting;store.taskTab=1;store.waitingJobs={waiting:{job:waiting,tabId:1,url:tabs[0].url}};
delete job.retryOf;job.id='independent';opened=0;tabs.splice(1);
ctx.fetch=async()=>Response.json({enabled:true,paused:false,job,waitingJobs:[waiting],settings:{automaticPage:true}});
await ctx.testPoll();assert.equal(opened,1);assert.equal(store.activeJob.id,'independent');assert.equal(store.waitingJobs.waiting.tabId,1);assert.equal(store.taskTab,2);
await ctx.testPoll();assert.equal(opened,1,'pending video does not repeatedly open a new task tab');
console.log('PASS acknowledged video retains original tab while independent next task opens once.');

// A bridge-created tab has already provided a fresh page for this retry.
store.waitingJobs={};store.retiredTaskTabs={};store.activeJob=null;
store.taskTab=1;store.freshCreationTabId=1;delete store.freshRetryJobId;
job.id='retry-after-browser-launch';job.retryOf='old';opened=0;tabs.splice(1);
chrome.scripting.executeScript=async({func})=>[{result:func===inspectComposer?{state:'idle',uploads:0,hasDraft:false,hasAttachments:false,settings:{automaticPage:true}}:{state:'loggedIn'}}];
ctx.fetch=async()=>Response.json({enabled:true,paused:false,job,settings:{automaticPage:true}});
await ctx.testPoll();assert.equal(opened,0,'a newly opened empty bridge page must not spawn a duplicate retry tab');
assert.equal(store.freshRetryJobId,job.id);
assert.equal(store.freshCreationTabId,null,'fresh page may be consumed only once');
console.log('PASS retry consumes the freshly opened empty bridge tab.');
for (const occupied of [{hasDraft:true,uploads:0,hasAttachments:false},{hasDraft:false,uploads:1,hasAttachments:true},{hasDraft:false,uploads:0,hasAttachments:true}]) {
 store.activeJob=null;store.taskTab=1;store.freshCreationTabId=1;delete store.freshRetryJobId;
 opened=0;tabs.splice(1);job.id='retry-occupied-'+occupied.uploads;
 chrome.scripting.executeScript=async({func})=>[{result:func===inspectComposer?{state:'idle',...occupied,settings:{automaticPage:true}}:{state:'loggedIn'}}];
 await ctx.testPoll();assert.equal(opened,1,'a fresh tab with user draft/attachment must be preserved');
 assert.equal(tabs[0].id,1);
}
console.log('PASS user draft and attachment prevent fresh tab reuse.');
