import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const {DoubaoManager}=createRequire(import.meta.url)('./doubao-manager.cjs');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'doubao-slot-'));
let m=await new DoubaoManager({root,backend:()=>({})}).start();
m.requestWake=()=>{};
const idle=async a=>{await m.event(a,{type:'runtime',state:'idle'});a.runtimeAt-=1100;await m.event(a,{type:'runtime',state:'idle'});};
const bundle=ids=>({format:'director-doubao-task',version:1,projectId:'p',tasks:ids.map(id=>({id,title:id,prompt:'test',references:[]})),media:[]});
try {
 await m.command('account',{name:'A'});let a=m.state.accounts[0];
 await m.command('participation',{ids:[a.id],selected:true});
 await m.command('loginStatus',{id:a.id,loggedIn:true});await m.command('settings',{concurrency:1});
 await m.command('enqueue',{bundle:bundle(['old','next']),accountIds:[a.id]});await idle(a);
 const first=await m.claim(a);const old=m.state.jobs.find(j=>j.id===first.job.id);
 await m.event(a,{type:'submitted',jobId:old.id,requestId:'original'});
 const realNow=Date.now;const base=Date.parse(old.submittedAt);
 try {
 Date.now=()=>base+179999;await idle(a);assert.equal((await m.claim(a)).job.id,old.id);
 Date.now=()=>base+180000;await idle(a);
 const claimed=(await m.claim(a)).job;const next=m.state.jobs.find(j=>j.id===claimed.id);assert.equal(next.shotId,'next','at 3 minutes same account AND concurrency slot are released');
 assert.equal((await m.claim(a)).waitingJobs[0].id,old.id,'old result remains tracked');
 assert.equal(old.status,'submitted');
 await m.event(a,{type:'failed',jobId:next.id,error:'network'});
 await assert.rejects(m.command('cancel',{id:next.id}),/确认/);
 await m.command('cancel',{id:next.id,confirmed:true});assert.equal(next.status,'cancelled');
 await m.event(a,{type:'submitted',jobId:next.id,requestId:'late'});assert.equal(next.status,'cancelled');
 } finally {Date.now=realNow;}
 old.submittedAt=new Date(Date.now()-181000).toISOString();await m.save();await m.stop();
 m=await new DoubaoManager({root,backend:()=>({})}).start();m.requestWake=()=>{};a=m.state.accounts[0];
 assert.equal((await m.claim(a)).job,null,'restart does not reset the submission deadline');
 assert.equal((await m.claim(a)).waitingJobs.length,1);
 await m.command('enqueue',{bundle:bundle(['third']),accountIds:[a.id]});await idle(a);
 const third=(await m.claim(a)).job;assert.equal(third.shotId,'third');
 let returned;
 m.startDownload=async(owner,j,url)=>{returned={id:j.id,url};};
 await m.event(a,{type:'result',jobId:old.id,requestId:'original',original:true,url:'https://test.byteimg.com/original.mp4'});
 assert.equal(returned.id,old.id,'late video routes to original job');assert.equal((await m.claim(a)).job.id,third.id);
 console.log('PASS 3-minute boundary, global slot, cancellation, restart deadline and late result routing');
} finally {await m.stop();await fs.rm(root,{recursive:true,force:true});}
