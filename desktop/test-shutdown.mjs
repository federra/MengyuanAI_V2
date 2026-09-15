import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {createShutdown}=require('./shutdown.cjs');
const {DoubaoManager}=require('./doubao-manager.cjs');
for(const mode of ['normal','throw','callback-error','disconnected','helper-hang','helper-error','no-backend']) {
  const events=[];let exits=0,forced=0;
  const child=mode==='no-backend'?null:Object.assign(new EventEmitter(),{exitCode:null,signalCode:null,connected:mode!=='disconnected'});
  if(child)child.send=(_message,callback)=>{events.push('stop');if(mode==='throw')throw Error('disconnected');if(mode==='callback-error'){callback(Error('IPC closed'));return;}setTimeout(()=>{child.exitCode=0;child.emit('exit',0);},3);};
  const stop=createShutdown({getBackend:()=>child,stopHelper:async()=>{events.push('helper');if(mode==='helper-hang')await new Promise(()=>{});if(mode==='helper-error')throw Error('disk');},log:async m=>events.push(m),exit:()=>exits++,forceBackend:async()=>forced++,graceMs:40,helperMs:8});
  const first=stop();assert.equal(stop(),first,'shutdown must run once');await first;
  assert.equal(exits,1);assert.equal(forced,['throw','callback-error','disconnected'].includes(mode)?1:0,mode);
  if(events.includes('stop'))assert(events.indexOf('helper')<events.indexOf('stop'),'helper writes drain before backend stop');
}
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-stop-'));
const manager=await new DoubaoManager({root,backend:()=>({}),fetchMedia:(_url,{signal})=>new Promise((_resolve,reject)=>{
  if(signal.aborted)reject(Error('aborted'));else signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});
})}).start();
const job={id:'download-1',title:'Test',status:'downloading',history:[]};manager.state.jobs.push(job);
const pending=manager.download(job,'https://www.doubao.com/test.mp4');manager.downloadJobs.add(pending);
await manager.stop();
assert.equal(job.status,'attention');assert.match(job.error,/无需重复生成/);
const saved=JSON.parse(await fs.readFile(path.join(root,'manager.json'),'utf8'));assert.equal(saved.jobs[0].status,'attention');
await assert.rejects(manager.command('pause',{paused:false}),/正在关闭/);
console.log('PASS shutdown ordering, reentry, broken IPC, stuck helper, backend deadline, interrupted-download persistence and no submissions during shutdown.');
