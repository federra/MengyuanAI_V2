import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const store={connection:{url:'http://127.0.0.1:45678',token:'test'}};
const events=[],alarms=new Map(),removed=[];
let result={state:'loggedOut',safeToClose:false},pending=true,navigating=false;
const listeners={};
const chrome={
  storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,store[k]])),set:async patch=>Object.assign(store,patch)}},
  runtime:{getURL:()=> 'chrome-extension://test/',onMessage:{addListener(){}},onStartup:{addListener(){}}},
  action:{onClicked:{addListener(){}}},
  alarms:{create:async(name,options)=>alarms.set(name,options),clear:async name=>alarms.delete(name),onAlarm:{addListener:f=>listeners.alarm=f}},
  tabs:{query:async()=>[{id:7,url:'https://www.doubao.com/chat/create-image'}],remove:async id=>removed.push(id),onUpdated:{addListener:f=>listeners.updated=f}},
  scripting:{executeScript:async ({func})=>{
    if(func.name==='readLoginState') {if(navigating)throw Error('Frame navigated');return [{result}];}
    return [{}];
  }},
};
const ctx=vm.createContext({chrome,URL,AbortSignal,Map,Date,readLoginState:function readLoginState(){},labelAccount:function labelAccount(){},fetch:async(url,options)=>{
  if(url.endsWith('/next'))return Response.json({loginCheck:pending?{id:'check-1'}:null,settings:{}});
  const data=JSON.parse(options.body);events.push(data);
  if(data.type==='loginResult'){pending=data.state!=='loggedIn';return Response.json({pending,closeAllowed:!pending&&data.safeToClose});}
  return Response.json({ok:true});
}});
vm.runInContext((await fs.readFile('browser-extension/background.js','utf8')).replace(/^import .*;\r?\n/gm,'')+'\nglobalThis.pollTest=poll;',ctx);
await ctx.pollTest();assert.equal(events.at(-1).state,'loggedOut');assert(alarms.has('director-login-retry'));assert.deepEqual(removed,[]);
result={state:'verification',safeToClose:false};await ctx.pollTest();assert.equal(events.at(-1).state,'verification');assert.deepEqual(removed,[]);
navigating=true;await ctx.pollTest();assert.equal(events.at(-1).state,'unknown');assert(alarms.has('director-login-retry'));
navigating=false;result={state:'loggedIn',nickname:'珍秘',safeToClose:true};
// Navigation completion triggers a recheck without another click in the workbench.
listeners.updated(7,{status:'complete'},{url:'https://www.doubao.com/chat/create-image'});
for(let i=0;i<30&&!removed.length;i++)await new Promise(r=>setImmediate(r));
assert.deepEqual(removed,[7]);assert.equal(alarms.has('director-login-retry'),false);
assert.equal(events.at(-1).type,'loginClosed');
assert(events.filter(e=>e.type==='loginResult').every(e=>e.checkId==='check-1'));
console.log('PASS persistent retry alarm, manual login/verification wait, navigation race recovery, automatic redirect recheck and success-only tab close.');
