import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const {DoubaoManager}=createRequire(import.meta.url)('./doubao-manager.cjs');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-round-robin-'));
let m=await new DoubaoManager({root,backend:()=>({})}).start();
const idle=async a=>{await m.event(a,{type:'runtime',state:'idle'});a.runtimeAt-=1100;await m.event(a,{type:'runtime',state:'idle'});};
const bundle=ids=>({format:'director-doubao-task',version:1,projectId:'project',tasks:ids.map(id=>({id,title:id,prompt:'原台词',references:[]})),media:[]});
try {
  for(const name of ['A','B','C']) await m.command('account',{name,group:name==='C'?'另一组':'轮询组'});
  const [a,b,c]=m.state.accounts;
  await m.command('participation',{ids:[a.id,b.id,c.id],selected:true});
  for(const x of [a,b,c]) await m.command('loginStatus',{id:x.id,loggedIn:true});
  await m.command('settings',{concurrency:1});
  await m.command('enqueue',{bundle:bundle(['s1','s2','s3','s4']),accountIds:[a.id,b.id]});
  assert.equal((await m.claim(a)).job,null,'login/connection alone is not idle proof');
  await m.event(a,{type:'runtime',state:'idle'});
  assert.equal((await m.claim(a)).job,null,'one idle sample cannot release an account');
  for(const x of [a,b,c]) await idle(x);
  const order=[];
  for(let n=0;n<4;n++) {
    // A polls first every time; the scheduler must still alternate A/B.
    await m.claim(a); const j=m.state.jobs.find(j=>j.status==='prepared');
    order.push(j.accountId);const owner=m.account(j.accountId);
    assert.notEqual(j.accountId,c.id,'never leaves the selected group');
    await m.event(owner,{type:'submitted',jobId:j.id,requestId:'r'+n});
    assert.equal((await m.claim(owner)).job.id,j.id,'same account retains the one original task');
    await m.event(owner,{type:'failed',terminal:true,jobId:j.id,error:'生成失败'});
    assert.equal(m.eligible(owner),false,'failure does not itself prove idle');
    await idle(owner);
  }
  assert.deepEqual(order,[a.id,b.id,a.id,b.id]);
  await m.command('enqueue',{bundle:bundle(['timeout','later']),accountIds:[a.id]});
  const j=(await m.claim(a)).job;
  await m.event(a,{type:'submitted',jobId:j.id,requestId:'timeout-request'});
  m.state.jobs.find(x=>x.id===j.id).waitStartedAt=Date.now()-21*60000;
  await m.expire();await idle(a);
  assert.equal((await m.claim(a)).job.id,j.id,'timeout plus idle must not replace an unresolved job');
  assert.equal(m.state.jobs.find(x=>x.shotId==='later').status,'queued');
  await assert.rejects(m.command('enqueue',{bundle:bundle(['timeout']),accountIds:[b.id]}),/已在队列/,'uncertain task cannot be resubmitted on another account');
  await m.event(a,{type:'failed',jobId:j.id,error:'网络中断'});
  assert.equal(m.state.jobs.find(x=>x.id===j.id).status,'attention');
  await m.event(a,{type:'runtime',state:'busy'});
  await assert.rejects(m.command('release',{id:j.id,confirmed:true}),/空闲/);
  await m.stop();m=await new DoubaoManager({root,backend:()=>({})}).start();
  const restored=m.account(a.id);
  assert.equal(restored.runtimeState,'unknown','restart invalidates stale idle evidence');
  assert.equal((await m.claim(restored)).job.id,j.id,'restart preserves unresolved account ownership');
  await idle(restored);await m.command('release',{id:j.id,confirmed:true});await idle(restored);
  const later=(await m.claim(restored)).job;assert.equal(later.shotId,'later');
  await m.event(restored,{type:'failed',terminal:true,jobId:later.id,error:'失败'});await idle(restored);
  const duplicates=await Promise.allSettled([1,2].map(()=>m.command('enqueue',{bundle:bundle(['double-click']),accountIds:[a.id]})));
  assert.equal(duplicates.filter(x=>x.status==='fulfilled').length,1,'concurrent queue commands are idempotent per shot');
  console.log('PASS group rotation independent of poll order, exclusive ownership, two idle observations, terminal+idle gate, timeout/network/restart locks, manual verified release, cross-account/concurrent duplicate prevention.');
} finally {await m.stop();}
