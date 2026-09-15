// Run tests/models.mjs first to prepare the model service mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const dir='work/model-test';
for(const name of ['speech','speech-server','studio','dialogue','dialogue-timeline']){
 const code=ts.transpileModule(await fs.readFile(`lib/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("'./server'","'./fake'").replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'");await fs.writeFile(`${dir}/${name}.mjs`,code);
}
const imp=n=>import(pathToFileURL(path.resolve(dir,n+'.mjs')));
const {modelDefaults,validateModel}=await imp('models');const {configs,jobs,blobs,profiles,defaults}=await imp('fake');const {seal,listConfigs}=await imp('model-server');
const {speechBody,receiveGeneratedSpeech}=await imp('speech');const {submitSpeech}=await imp('speech-server');const {newProject,newShot,validateProject}=await imp('studio');const {newLine}=await imp('dialogue');
const c=validateModel({...modelDefaults.find(m=>m.kind==='audio'),baseUrl:'https://speech.example.com/v1/audio/speech',model:'custom-tts',enabled:true,speechVoice:'child-voice',speechVoices:['child-voice','narrator'],speechFormat:'mp3'});
assert.equal(c.baseUrl,'https://speech.example.com/v1');assert.equal(c.speechVoice,'child-voice');
assert.throws(()=>validateModel({...c,speechPath:'//elsewhere.test/speech'}));
assert.throws(()=>validateModel({...c,protocol:'images'}));
const key='fake-speech-key';configs.set('audio',{body:JSON.stringify(c),secret:await seal(key)});
const profileId=crypto.randomUUID();profiles.set(profileId,{id:profileId,kind:'audio',body:JSON.stringify({...c,model:'second-tts'}),secret:await seal(key)});defaults.set('audio',profileId);
const listed=(await listConfigs()).filter(m=>m.kind==='audio');assert.equal(listed.length,2);assert(listed.find(m=>m.id===profileId).isDefault);assert(!JSON.stringify(listed).includes(key));
const input={projectId:crypto.randomUUID(),targetId:crypto.randomUUID(),lineId:'line-1',text:'妈，今天一定要回来呀。',voice:'child-voice',speed:1,instructions:'期待'};
assert.equal(speechBody(c,input).input,input.text);assert(!('instructions' in speechBody(c,input)));assert.equal(speechBody({...c,speechInstructions:true},input).instructions,'期待');
assert.throws(()=>speechBody(c,{...input,text:''}));assert.throws(()=>speechBody(c,{...input,speed:0}));
let requests=[];globalThis.fetch=async(url,init)=>{requests.push({url,init});return new Response(new Uint8Array([73,68,51,1,2,3]),{headers:{'content-type':'audio/mpeg'}});};
let accepted;const result=await submitSpeech(input,'speech-1',j=>{accepted={...j};});assert.equal(accepted.status,'submitting');assert.equal(result.status,'succeeded');assert(blobs.has(result.media.id));assert(!jobs.get('speech-1').config.includes(key));
assert.equal(requests[0].url,'https://speech.example.com/v1/audio/speech');assert.equal(JSON.parse(requests[0].init.body).model,'second-tts');assert.equal(JSON.parse(requests[0].init.body).input,input.text);assert(!('instructions' in JSON.parse(requests[0].init.body)));
await submitSpeech(input,'speech-1');assert.equal(requests.length,1,'idempotent submission');
await assert.rejects(()=>submitSpeech({...input,lineId:'other'},'speech-1'),/不一致/);
globalThis.fetch=async()=>new Response('<html/>',{headers:{'content-type':'text/html'}});assert.equal((await submitSpeech(input,'speech-html')).status,'attention');
const project=newProject();project.id=input.projectId;const shot={...newShot(),id:input.targetId,duration:10,dialogue:input.text,lines:[{...newLine(),id:input.lineId,text:input.text,start:4,end:10,speechPendingId:'speech-1'}]};project.shots=[shot];
const bound=receiveGeneratedSpeech(project,[result]);assert.equal(bound.shots[0].lines[0].audio.id,result.media.id);assert.equal(bound.shots[0].lines[0].audioStart,0);assert.equal(bound.shots[0].lines[0].start,4);assert.equal(receiveGeneratedSpeech(bound,[result]),bound);
assert.equal(receiveGeneratedSpeech(project,[{...result,projectId:'another'}]),project);
assert.equal(receiveGeneratedSpeech(project,[{...result,speechText:'错误台词'}]),project);
validateProject(JSON.parse(JSON.stringify(bound)));
console.log('PASS multiple custom speech profiles, encryption, protocol body, optional instructions, binary media, failure handling, idempotency, exact-line binding, timing and persistence.');
