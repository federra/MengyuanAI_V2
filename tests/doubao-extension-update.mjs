import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const src=(await fs.readFile('browser-extension/background.js','utf8')).replace(/^import .*;\r?\n/gm,'');
const current=src.match(/const EXECUTION_BUILD='([^']+)'/)[1];
const store={connection:{url:'http://127.0.0.1:1234',token:'test'}};
let reloads=0,opened=0,grant=true,busy=false;
const events=[];
const inspectComposer=()=>{};
const chrome={storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,structuredClone(store[k])])),set:async x=>Object.assign(store,structuredClone(x))}},runtime:{getURL:()=> 'chrome-extension://test/',reload:()=>reloads++,onMessage:{addListener(){}},onStartup:{addListener(){}}},action:{onClicked:{addListener(){}}},alarms:{create:async()=>{},onAlarm:{addListener(){}}},tabs:{query:async()=>[{id:1,url:'https://www.doubao.com/chat/create-image'}],create:async({active})=>{assert.equal(active,false);opened++;return{id:2};},sendMessage:async()=>{}},scripting:{executeScript:async({func})=>[{result:func===inspectComposer?{state:busy?'busy':'idle',settings:{automaticPage:true}}:{state:'loggedIn',nickname:'test'}}]}};
const make=code=>{
 const ctx=vm.createContext({chrome,inspectComposer,readLoginState:()=>{},labelAccount:()=>{},URL,AbortSignal,Map,Set,Date,fetch:async(url,opts)=>{
  if(url.endsWith('/event')){const body=JSON.parse(opts.body);events.push(body);return Response.json(body.type==='extensionUpdate'?{updateAllowed:grant&&body.safeToUpdate,version:current}:{ok:true});}
  return Response.json({enabled:true,paused:true,extensionUpdateRequired:true,extensionVersion:current,settings:{automaticPage:true}});
 }});vm.runInContext(code+'\nglobalThis.testPoll=poll;globalThis.chooseTab=chooseTab;',ctx);return ctx;
};
const old=make(src.replace(`const EXECUTION_BUILD='${current}'`,"const EXECUTION_BUILD='0.11.99'"));
busy=true;await old.testPoll();assert.equal(reloads,0,'busy page defers update');
busy=false;grant=false;await old.testPoll();assert.equal(reloads,0,'server account lock must approve');
grant=true;await old.testPoll();assert.equal(reloads,1);assert.equal(store.pendingExtensionUpdate.version,current);
await old.testPoll();assert.equal(reloads,1,'no hot reload loop');
const updated=make(src);await updated.testPoll();assert.equal(opened,1);assert.equal(store.pendingExtensionUpdate,null);assert.equal(store.taskTab,2);
assert(events.some(e=>e.executionBuild===current&&e.type==='runtime'));
assert.equal(updated.chooseTab([{id:1,url:'https://www.doubao.com/chat/create-image',active:true},{id:2,url:'https://www.doubao.com/chat/create-image',active:false}],store.taskTab).id,2,'fresh updated page wins over active old page');
assert.equal(store.connection.token,'test','connection and login profile are preserved');
console.log('PASS idle-only self-update, server grant, bounded reload, background fresh page, build acknowledgement and preserved connection.');
store.pendingExtensionUpdate={version:'0.1.0',fromVersion:current,at:Date.now()-61000};
const before=reloads;await updated.testPoll();
assert.equal(store.pendingExtensionUpdate,null,'stale update target must reconcile against the current desktop manifest');
assert.equal(reloads,before,'current helper must not reload forever toward a retired desktop target');
console.log('PASS stale persisted update target recovery');
