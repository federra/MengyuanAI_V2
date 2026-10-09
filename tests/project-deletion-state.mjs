// Reproduce stale recovery and delayed original-video replies using production functions.
import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'director-project-deletion-'));
after(()=>fs.rm(dir,{recursive:true,force:true}));
for(const name of ['video-duration','video-generation','doubao-manager','doubao','studio','dialogue','dialogue-timeline','video-context','video-performance','video-request','video-voice']) {
  const source=await fs.readFile(`lib/${name}.ts`,'utf8');
  await fs.writeFile(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'"));
}
const {newProject,newShot}=await import(pathToFileURL(path.join(dir,'studio.mjs')));
const {receiveDoubaoVideos}=await import(pathToFileURL(path.join(dir,'doubao-manager.mjs')));
const recoveryCode=ts.transpileModule(await fs.readFile('lib/project-recovery.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const recovery={exports:{},crypto};vm.createContext(recovery);vm.runInContext(recoveryCode,recovery);
const source=await fs.readFile('app/page.tsx','utf8');const start=source.indexOf('    const poll = async () => {');const end=source.indexOf('    void poll();',start);
const pollCode=ts.transpileModule(source.slice(start,end)+'\n globalThis.poll=poll;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const original={...newProject('已删除项目'),revision:1,shots:[newShot()]};
const job={id:'old-job',projectId:original.id,shotId:original.shots[0].id,status:'succeeded',media:{id:'old-video',url:'/api/media/old-video',name:'result.mp4',type:'video/mp4'}};
function pendingPoll(project) {
  let reply;const waiting=new Promise(resolve=>{reply=resolve});const writes=[];
  const ctx={project,current:{current:project},isDirty:{current:false},disposed:false,timer:undefined,setTimeout:()=>0,doubaoCommand:()=>waiting,receiveDoubaoVideos,setProject:p=>writes.push(p),setDirty(){},setNotice(){}};
  vm.createContext(ctx);vm.runInContext(pollCode,ctx);return {ctx,writes,reply};
}
void test('a persisted project missing from active storage is not resurrected as a recovery copy',()=>{
  assert.equal(recovery.exports.recoverProject(original,[]),null);
});
void test('a delayed Doubao reply cannot replace the project selected after deletion',async()=>{
  const state=pendingPoll(original),waiting=state.ctx.poll();state.ctx.current.current=newProject('新的空项目');state.reply({jobs:[job]});await waiting;
  assert.equal(state.writes.length,0,'late original reply must not restore deleted project');
});
void test('a matching reply applies to latest draft, preserving edits made while waiting',async()=>{
  const state=pendingPoll(original),waiting=state.ctx.poll();state.ctx.current.current={...original,brief:'刚刚编辑的创意'};state.reply({jobs:[job]});await waiting;
  assert.equal(state.writes.length,1);assert.equal(state.writes[0].brief,'刚刚编辑的创意');assert.equal(state.writes[0].shots[0].video.id,'old-video');
});
void test('a refresh started before saving a new project cannot evict the newly saved project',async()=>{
  const at=source.indexOf('    const refresh = () => {'),until=source.indexOf('    const timer = setInterval(refresh',at);
  let resolveProjects;const staleList=new Promise(resolve=>{resolveProjects=resolve});
  const writes=[],start=newProject('新项目');
  const ctx={active:true,lock:{current:false},aiGenerationLock:{current:false},batchesActive:{current:false},trashRefreshSequence:{current:0},current:{current:start},api:url=>url.endsWith('/trash')?Promise.resolve([]):staleList,
    setProjects(){},setTrashedProjects(){},setProject:p=>writes.push(p),setDirty(){},setSelected(){},setUndo(){},setAiText(){},setSkillLaunch(){},setDialog(){},setGenerationTarget(){},setAssetManagementKind(){},setNotice(){},isDirty:{current:false},assistantUndo:{current:undefined},recoveryCopies:{current:new Set()},newProject};
  vm.createContext(ctx);vm.runInContext(ts.transpileModule(source.slice(at,until)+'\n globalThis.refresh=refresh;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  ctx.refresh();ctx.current.current={...start,revision:1};resolveProjects([]);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes.length,0,'older empty list must not erase newly saved project');
});
