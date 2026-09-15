import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const {DoubaoManager}=createRequire(import.meta.url)('./doubao-manager.cjs');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-wake-')),opened=[];
const m=await new DoubaoManager({root,backend:()=>({}),launch:async args=>opened.push(args)}).start();
try{
  for(const name of ['A','B','C'])await m.command('account',{name});
  const [a,b,c]=m.state.accounts;await m.command('participation',{ids:[a.id,b.id,c.id],selected:true});
  m.state.settings.concurrency=1;
  await m.command('enqueue',{bundle:{format:'director-doubao-task',version:1,projectId:'p',tasks:[{id:'s',title:'test',prompt:'line',references:[]}],media:[]},accountIds:[a.id,b.id,c.id],autoSubmit:true});
  for(let n=0;n<30&&!opened.length;n++)await new Promise(r=>setTimeout(r,10));
  assert.equal(opened.length,1,'enqueue automatically opens a Chrome account without a separate login button');
  assert.equal(a.loginCheck,undefined,'generation does not wait for a separate nickname check');
  await m.command('wakeQueue');assert.equal(opened.length,1,'browser startup reserves concurrency; no launch storm');
  // Reproduce the observed cancelled job retaining its generation login lock.
  a.loginCheck={id:'old-check',purpose:'generation',status:'pending',expiresAt:Date.now()+600000};
  const first=m.state.jobs[0];await m.command('cancel',{id:first.id});
  await m.command('enqueue',{bundle:{format:'director-doubao-task',version:1,projectId:'p',tasks:[{id:'s2',title:'second',prompt:'line',references:[]}],media:[]},accountIds:[a.id,b.id,c.id],autoSubmit:true});
  await m.command('wakeQueue');assert.equal(opened.length,2,'new task opens immediately despite stale old login state and recent heartbeat');
  assert.equal(a.loginCheck.status,'interrupted');
  await m.event(a,{type:'runtime',state:'unknown',loginState:'loggedOut',error:'请登录'});
  assert.equal((await m.claim(a)).job,null,'actual login page still blocks generation');
  await m.event(a,{type:'runtime',state:'idle',readyForGeneration:true});a.runtimeAt-=1100;await m.event(a,{type:'runtime',state:'idle',readyForGeneration:true});
  assert.equal(a.nickname,'','nickname is display metadata, not a generation gate');
  const job=(await m.claim(a)).job;assert.equal(job.status,'prepared');assert.equal(job.settings.automaticPage,true);assert.equal(job.settings.autoSubmit,true);
  await m.command('retryPrepare',{id:job.id});assert.equal(m.state.jobs[1].prepareRevision,1);
  await m.event(a,{type:'submitted',jobId:job.id,requestId:'r'});
  await assert.rejects(m.command('retryPrepare',{id:job.id}),/尚未提交/);
  assert.equal(m.stats(a).submitted,1);
  await m.command('pause',{paused:true});await m.command('wakeQueue');assert.equal(opened.length,2);
  console.log('PASS enqueue→automatic account launch→no nickname gate→stale cancelled-check recovery→idle gate→prepared auto-submit; concurrency, pause and retry protection.');
}finally{await m.stop();}
