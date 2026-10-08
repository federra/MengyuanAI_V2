import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const {DoubaoManager}=createRequire(import.meta.url)('./doubao-manager.cjs');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-retrieve-timeout-'));
let downloads=0;
const m=new DoubaoManager({root,backend:()=>{throw Error('aborted media must never reach workbench');},fetchMedia:async(_url,{signal})=>{downloads++;return new Promise((_resolve,reject)=>{const abort=()=>reject(signal.reason);if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});}});
try{
 await m.command('account',{name:'original'});const a=m.state.accounts[0];a.lastSeen=Date.now();
 const job={id:'job',accountId:a.id,accountIds:[a.id],status:'attention',requestId:'request',videoId:'video',submittedAt:new Date().toISOString(),title:'镜头'};m.state.jobs.push(job);
 await m.command('retrieve',{id:job.id});job.retrieval.deadlineAt=Date.now()+20;
 await m.event(a,{type:'result',jobId:job.id,videoId:'video',requestId:'request',original:true,url:'https://test.byteimg.com/result.mp4'});
 const finished=Promise.all(m.downloadJobs);const keepalive=setTimeout(()=>{},1000);await finished;clearTimeout(keepalive);
 assert.equal(downloads,1);assert.equal(job.status,'attention');assert.equal(job.retrieval.status,'failed');assert.equal(job.retrieval.reason,'timeout');assert.match(job.retrieval.message,/超时/);assert.equal(m.downloading.has(job.id),false);
 await m.command('retrieve',{id:job.id});assert.equal(job.retrieval.status,'fetching','aborted transport releases duplicate guard for explicit retry');
 console.log('PASS downloading deadline aborts transport, emits clear timeout reason, preserves original and allows retry.');
}finally{await m.stop();await fs.rm(root,{recursive:true,force:true});}
