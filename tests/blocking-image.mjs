import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
// tests/core.mjs prepares the real shared project modules.
for (const name of ['asset-image-skill', 'blocking-image']) {
  const code = ts.transpileModule(await fs.readFile(`lib/${name}.ts`, 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022},
  }).outputText.replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
  await fs.writeFile(`work/test/${name}.mjs`, code);
}
const imp=n=>import(pathToFileURL(path.resolve('work/test',n+'.mjs')).href);
const {blockingImagePrompt,blockingImageSkill,blockingJobActive,latestBlockingJob,receiveBlockingImages}=await imp('blocking-image');
const {exampleProject,validateProject}=await imp('studio');
const p=exampleProject();
const s=p.shots[0];
assert.equal(blockingImageSkill(p,s).id,'shot-blocking-image');
const custom={id:'my-blocking',name:'导入站位规则',stage:'生图',version:'2',content:'左侧角色面向右侧人物；保留末尾这条完整规则。'};
p.skills=[custom];
s.blockingSkillId=custom.id;
assert(blockingImagePrompt(p,s,'人物开门').includes(custom.content));
assert(blockingImagePrompt(p,s,'人物开门').includes(p.ratio));
const saved=JSON.parse(JSON.stringify(p));
validateProject(saved);
assert.equal(blockingImageSkill(saved,saved.shots[0]).id,custom.id);
s.blockingSkillId='none';
assert.equal(blockingImageSkill(p,s),undefined);
s.blockingSkillId='deleted';
assert.throws(()=>blockingImagePrompt(p,s,'开门'),/重新选择/);
s.blockingSkillId=custom.id;
assert.throws(()=>blockingImagePrompt(p,s,'长'.repeat(10000)),/超过10000/);
assert.throws(()=>blockingImagePrompt(p,s,' '),/填写/);
const media={id:'11111111-1111-4111-8111-111111111111',name:'站位图.png',url:'/api/media/11111111-1111-4111-8111-111111111111',type:'image/png'};
const queued={id:'blocking-job-1',projectId:p.id,targetId:s.id,target:'blockingImage',status:'submitting',createdAt:'2026-09-11T01:00:00Z',model:'test',prompt:'test'};
const done={...queued,status:'succeeded',media};
assert(blockingJobActive(queued));
assert(!blockingJobActive(done));
const pending=receiveBlockingImages(p,[queued],new Set());
assert.equal(pending.shots[0].blockingPendingJobId,queued.id);
assert.equal(p.shots[0].blockingPendingJobId,undefined,'must not mutate current project');
const returned=receiveBlockingImages(pending,[done],new Set());
assert.deepEqual(returned.shots[0].blockingImage,media);
assert.equal(returned.shots[0].blockingGenerationId,done.id);
assert.equal(returned.shots[1],p.shots[1],'only exact shot may change');
assert.equal(receiveBlockingImages(returned,[done],new Set()),returned,'poll is idempotent');
validateProject(JSON.parse(JSON.stringify(returned)));
const removed={...returned,shots:returned.shots.map((s,i)=>i? s:{...s,blockingImage:undefined})};
assert.equal(receiveBlockingImages(removed,[done],new Set()),removed,'manual removal stays removed');
const manual={...p,shots:p.shots.map((s,i)=>i?s:{...s,blockingImage:{...media,id:'manual'}})};
assert.equal(receiveBlockingImages(manual,[done],new Set()),manual,'historical job cannot overwrite manual image');
assert.deepEqual(receiveBlockingImages(manual,[done],new Set([done.id])).shots[0].blockingImage,media,'live completion replaces previous image');
assert.equal(receiveBlockingImages(p,[{...done,projectId:'other-project'}],new Set([done.id])),p);
assert.equal(receiveBlockingImages(p,[{...done,targetId:'deleted-shot'}],new Set([done.id])),p);
assert.equal(receiveBlockingImages(p,[{...done,target:'image'}],new Set([done.id])),p,'other generation targets stay separate');
const newer={...queued,id:'newer-job',createdAt:'2026-09-11T02:00:00Z'};
assert.equal(latestBlockingJob([newer,done],p.id,s.id),newer,'arrival order must not choose stale result');
const newerPending=receiveBlockingImages(p,[newer,done],new Set());
assert.equal(newerPending.shots[0].blockingImage,p.shots[0].blockingImage);
assert.equal(newerPending.shots[0].blockingPendingJobId,newer.id);
const failed={...newer,status:'attention',error:'provider failure'};
assert.equal(receiveBlockingImages(newerPending,[done,failed],new Set()),newerPending,'failed retry preserves image');
assert(!blockingJobActive(failed),'failure releases button');
const recovered=receiveBlockingImages(JSON.parse(JSON.stringify(pending)),[done],new Set());
assert.deepEqual(recovered.shots[0].blockingImage,media,'saved pending ID recovers result after reopening');
console.log('PASS: blocking skill content/persistence/limits; exact project and shot routing; background completion; reload recovery; stale jobs; manual edits; failures; idempotent polling. No provider requests.');

