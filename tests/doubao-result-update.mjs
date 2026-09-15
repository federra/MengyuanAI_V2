import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const build=JSON.parse(await fs.readFile('browser-extension/manifest.json','utf8')).version;
const url='https://www.doubao.com/chat/123';
const job={id:'job',status:'submitted',requestId:'req',conversationUrl:url};
const store={connection:{url:'http://127.0.0.1:1234',token:'test'},waitingJobs:{}};
const reloads=[],events=[],probes=[];let complete=false,observerBuild='old',failArm=false;
const chrome={storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,structuredClone(store[k])])),set:async p=>Object.assign(store,structuredClone(p))}},
 runtime:{getURL:()=>'',onMessage:{addListener(){}},onStartup:{addListener(){}}},action:{onClicked:{addListener(){}}},alarms:{create(){},onAlarm:{addListener(){}}},
 tabs:{reload:async id=>reloads.push(id),sendMessage:async(_id,m)=>{if(failArm)throw Error('disconnected');if(m.type==='probeVideo')probes.push(m);}},
 scripting:{executeScript:async arg=>arg.world==='MAIN'?[{result:observerBuild}]:[{result:complete?{messageId:'result',url}:null}]}};
const ctx=vm.createContext({chrome,URL,AbortSignal,Map,Set,Date,probeResult:()=>{},readResultIdentity:()=>{},fetch:async(_url,init)=>{events.push(JSON.parse(init.body));return Response.json({ok:true});}});
vm.runInContext((await fs.readFile('browser-extension/background.js','utf8')).replace(/^import .*;\r?\n/gm,'')+'\nglobalThis.track=trackWaiting;',ctx);
const next={waitingJobs:[job],settings:{}},tabs=[{id:1,url}];
await ctx.track(next,tabs);assert.equal(reloads.length,0,'running task must not reload');
complete=true;await ctx.track(next,tabs);assert.deepEqual(reloads,[1]);assert.equal(probes.length,0);
observerBuild=build;await ctx.track(next,tabs);assert.equal(probes.length,1);assert.equal(probes[0].job.requestId,'req');
await ctx.track(next,tabs);assert.equal(probes.length,1,'do not repeatedly toggle playback');assert.deepEqual(reloads,[1]);
failArm=true;await ctx.track(next,tabs);assert(events.some(e=>e.type==='resultProbeError'),'disconnect leaves a diagnostic instead of silent waiting');
assert(events.some(e=>e.type==='resultDetected'));assert(events.every(e=>!['submitted','submissionIntent'].includes(e.type)));
console.log('PASS completed-page update only, one refresh/build, original task reuse, playback throttle, disconnect diagnostics, no regeneration.');
