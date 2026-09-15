import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir='work/batch-test';await fs.mkdir(dir,{recursive:true});
const source=await fs.readFile('lib/image-batch-queue.ts','utf8');
await fs.writeFile(`${dir}/queue.mjs`,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
const {ImageBatchQueue}=await import(pathToFileURL(path.resolve(dir,'queue.mjs')).href);
const input=(projectId,targetId)=>({projectId,targetId,target:'asset',prompt:'Original prompt',modelConfigId:'image',ratio:'16:9',duration:5,resolution:'720p',size:'2048x1152',referenceIds:[]});
const request=(projectId,n=3)=>({projectId,projectTitle:projectId,assetKind:'人物',modelName:'image-model',concurrency:2,items:Array.from({length:n},(_,i)=>({id:crypto.randomUUID(),name:`Role ${i}`,input:input(projectId,`asset-${i}`)}))});
let batches=[],events=[],calls=[],gates=new Map(),inflight=0,maxInflight=0;
let modalOpen=true,selectedProject='project-A';
const queue=new ImageBatchQueue(async(data,id,accepted)=>{
  calls.push({data:structuredClone(data),id});inflight++;maxInflight=Math.max(maxInflight,inflight);
  const job={id,projectId:data.projectId,targetId:data.targetId,target:'asset',status:'submitting',createdAt:new Date().toISOString(),model:'image-model',prompt:data.prompt};
  accepted(job);
  try {await new Promise((resolve,reject)=>gates.set(id,{resolve,reject}));return {...job,status:'succeeded',media:{id:'media-'+id,name:'result.png',url:'/api/media/'+id,type:'image/png'}};}
  finally {inflight--;}
},next=>{batches=next;events.push(next.map(b=>({id:b.id,finished:b.finished,statuses:b.items.map(i=>i.job.status)})));},()=>{});
const original=request('project-A');const batchId=queue.start(original);
assert.equal(calls.length,2);assert.equal(batches[0].items[2].job.status,'queued');assert.equal(maxInflight,2);
assert.throws(()=>queue.start(original),/生成队列/);
// Settings disappears and another project is edited while the same queue keeps running.
modalOpen=false;selectedProject='project-B';original.items[2].input.prompt='Edited later';original.items[2].input.modelConfigId='changed-model';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
gates.get(calls[0].id).resolve();await tick();
assert.equal(calls.length,3);assert.equal(calls[2].data.prompt,'Original prompt');assert.equal(calls[2].data.modelConfigId,'image');assert.equal(calls[2].data.projectId,'project-A');
assert.equal(batches[0].finished,false,'completion notice must wait for every queued item');
gates.get(calls[1].id).reject(new Error('Provider connection interrupted'));await tick();
assert.equal(batches[0].finished,false);assert.equal(calls.length,3,'failure must not retry billable requests');
gates.get(calls[2].id).resolve();await tick();
assert.equal(modalOpen,false);assert.equal(selectedProject,'project-B');assert.equal(batches[0].id,batchId);assert.equal(batches[0].finished,true);assert.equal(batches[0].items.filter(i=>i.job.status==='succeeded').length,2);assert.equal(batches[0].items.filter(i=>i.job.status==='attention').length,1);assert.equal(maxInflight,2);assert.equal(new Set(calls.map(c=>c.id)).size,3);
// A fresh batch is allowed after completion, with independent project routing.
const next=request('project-B',1);queue.start(next);assert.equal(calls.at(-1).data.projectId,'project-B');gates.get(next.items[0].id).resolve();await tick();assert.equal(batches.length,2);assert(batches.every(b=>b.finished));
assert.throws(()=>queue.start({...next,items:[]}),/请选择/);
const invalid=request('project-C',2);invalid.items[1].input.projectId='project-D';assert.throws(()=>queue.start(invalid),/目标无效/);
console.log('PASS background image batches: dialog-independent ownership, bounded concurrency, immutable input/model snapshots, project isolation, complete-batch timing, duplicate protection and partial failure without retries.');
