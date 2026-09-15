import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const {DoubaoManager}=createRequire(import.meta.url)('./doubao-manager.cjs');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-marked-result-'));
let downloads=0;
const m=await new DoubaoManager({root,backend:()=>({}),launch:async()=>{},fetchMedia:async()=>{downloads++;throw Error('unexpected download');}}).start();
try {
  await m.command('account',{name:'test',group:'A'});const a=m.state.accounts[0];
  await m.command('participation',{ids:[a.id],selected:true});
  await m.command('enqueue',{accountIds:[a.id],bundle:{format:'director-doubao-task',version:1,projectId:'p',tasks:[{id:'shot',title:'shot',prompt:'prompt',references:[]}],media:[]}});
  const j=m.state.jobs[0];Object.assign(j,{status:'submitted',accountId:a.id,requestId:'r',videoId:'v',submittedAt:new Date().toISOString()});
  const event={type:'resultUnavailable',jobId:j.id,requestId:'r',videoId:'v'};
  await assert.rejects(m.event(a,{...event,videoId:'other'}),/不匹配/);
  await m.event(a,event);assert.equal(j.status,'attention');assert(j.terminalAt,'completed generation releases account');assert.match(j.error,/带水印/);assert.equal(downloads,0);assert.equal(j.media,undefined);assert.equal(m.state.jobs.length,1,'does not retry generation');
  const submitted=m.stats(a).submitted;
  await m.command('resume',{id:j.id});assert.equal(j.status,'submitted');assert(j.recoveryKey);assert.equal(m.stats(a).submitted,submitted,'recovery never consumes another submission');assert.equal(downloads,0);
  console.log('PASS marked-video identity, no false clean download, account release and read-only result recovery.');
} finally {await m.stop();}
