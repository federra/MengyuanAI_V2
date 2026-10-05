// Run core.mjs first. No network/model calls or user data writes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { reviewAssetDrafts, mergeScriptAssets } from '../work/test/assets.mjs';
import { newProject } from '../work/test/studio.mjs';
import { parseStoryboardImport, applyStoryboardImport } from '../work/test/director.mjs';
import { episodeTemplate } from '../work/test/storyboard-contract.mjs';

void test('rejects evidence belonging to another named character', () => {
  const script = '人物：小林、小王\n小林穿红色外套。小王穿蓝色外套。';
  const report = reviewAssetDrafts({ assets: [
    {kind:'人物', name:'小林', description:'蓝色外套', evidence:'小王穿蓝色外套。'},
  ]}, script);
  assert(!report.assets.some(a => a.name === '小林' && a.description === '蓝色外套'));
  assert(report.warnings.length > 0);
});

void test('missing model descriptions and label fallback remain visibly incomplete', () => {
  const script = '人物：小林；场景：车站\n小林到了车站。';
  const report = reviewAssetDrafts({assets:[
    {kind:'人物',name:'小林',description:'',evidence:'小林到了车站。'},
  ]}, script);
  assert(report.warnings.some(w => w.includes('小林')));
  assert(report.warnings.some(w => w.includes('车站')));
  assert.equal(report.assets.find(a => a.name === '小林').description, '');
});

void test('later duplicate with a description fills an empty extracted draft', () => {
  const draft = {kind:'人物', name:'小林', description:'', evidence:'小林穿红色外套。'};
  const report = reviewAssetDrafts({assets:[draft,{...draft,description:'红色外套'}]}, draft.evidence);
  assert.equal(report.assets.length, 1);
  assert.equal(report.assets[0].description, '红色外套');
});

void test('label fallback cannot discard a pending description correction', () => {
  const project = newProject('复核保护');
  project.script = '人物：小林';
  project.assets = [{id:'role',kind:'人物',name:'小林',description:'旧设定',suggestedDescription:'新设定'}];
  const next = mergeScriptAssets(project,[{kind:'人物',name:'小林',description:'',evidence:project.script}],'labels');
  assert.equal(next.assets[0].suggestedDescription,'新设定');
  assert.equal(next.assets[0].description,'旧设定');
});

void test('flat imports retain later descriptions for the same asset', () => {
  const draft = {kind:'人物',name:'小林',description:''};
  const flat = parseStoryboardImport(JSON.stringify({shots:[{title:'进站',duration:5}],assets:[draft,{...draft,description:'红色外套'}]}));
  assert.equal(flat.assets[0].description, '红色外套');
});

void test('episode imports retain later descriptions for the same asset', () => {
  const episode = structuredClone(episodeTemplate);
  const role = episode.missing_roles[0];
  role.description = '';
  delete role.visual_style;
  episode.missing_roles.push({...role,role_id:'role_extra',description:'红色外套'});
  const parsed = parseStoryboardImport(JSON.stringify(episode));
  assert.equal(parsed.assets.find(a => a.name === role.role_name).description, '红色外套');
});

void test('applying a storyboard retains assets extracted while normalization was pending', async () => {
  const source = await fs.readFile('app/page.tsx','utf8');
  const fn = source.slice(source.indexOf('  async function applyAi('), source.indexOf('  function stageDone('));
  const project = newProject('并发提取');
  project.script = '人物：小林\n小林穿红色外套。';
  let finish;
  const current = {current:project};
  const context = {
    project, current, aiStoryboardMode:'append', aiTask:'shots', aiText:'分镜响应', lock:{current:false},
    Error, structuredClone, applyStoryboardImport, revisedAsset:(_before,next)=>next,
    api:() => new Promise(resolve => {finish = resolve;}),
    setBusy(){},setUndo(){},setAiText(){},setSelected(){},setStep(){},setDialog(){},setNotice(){},
    setError(error){throw Error(error);},
    edit(patch){current.current = {...current.current,...patch};},
    setProject(){}, setDirty(){},
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const applying = context.applyAi();
  current.current = mergeScriptAssets(project,[{kind:'人物',name:'小林',description:'红色外套',evidence:'小林穿红色外套。'}],'model');
  const assetId = current.current.assets[0].id;
  finish({text:JSON.stringify({shots:[{title:'进站',duration:5,character:'小林'}]})});
  await applying;
  assert.equal(current.current.assets.length,1);
  assert.equal(current.current.assets[0].description,'红色外套');
  assert(current.current.shots[0].references.includes(assetId));
});

void test('asset extraction merges against the project at commit time, preserving just-applied shots', async () => {
  const source = await fs.readFile('components/asset-sync.tsx','utf8');
  const functionText = source.slice(source.indexOf('  const latest ='), source.indexOf('  if (!visible)'));
  const project = newProject('反向并发');
  project.script = '人物：小林';
  let live = project;
  let run;
  let onApplyArgument;
  const effects = [];
  const context = {
    project,ready:true,enabled:true,AbortController,JSON,
    onApply(update){onApplyArgument=update;live=typeof update === 'function'?update(live):update;},
    useRef:value=>({current:value}),useState:value=>[value,()=>{}],useEffect:fn=>effects.push(fn),
    setTimeout:fn=>{run=fn;return 1;},clearTimeout(){},
    explicitAssets:()=>[],mergeScriptAssets,parseAssetDrafts:data=>data.assets,progressType:'application/json',
    fetch:async()=>({ok:true}),
    readApiResponse:async()=>({assets:[{kind:'人物',name:'小林',description:'红色外套',evidence:project.script}]}),
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(functionText,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  effects.forEach(fn=>fn());
  live=applyStoryboardImport(project,JSON.stringify({shots:[{title:'刚应用的分镜',duration:5,character:'小林'}]}),'append');
  await run();
  assert.equal(live.shots.length,1,'late extraction must not replace new shots with its earlier snapshot');
  assert.equal(live.assets[0].description,'红色外套');
  assert(live.shots[0].references.includes(live.assets[0].id));
  const another = newProject('已切换的项目');
  assert.equal(onApplyArgument(another),another,'project identity must also be checked at commit time');
});

// Exercise the actual application handler, including its undo and selection behavior.
void test('resegment replaces old overlong shots while retaining assets and undo', async () => {
  const source = await fs.readFile('app/page.tsx','utf8');
  const fn = source.slice(source.indexOf('  async function applyAi('), source.indexOf('  function stageDone('));
  const project = newProject('重新拆分');
  project.script = '小林进站。';
  project.shots = applyStoryboardImport(project, JSON.stringify({shots:[{title:'旧超长镜头',duration:22}]}),'append').shots;
  project.assets = [{id:'11111111-1111-4111-8111-111111111111',kind:'人物',name:'小林',description:'红色外套'}];
  const current = {current:project};
  let selected, undo;
  const context = {
    project, current, aiStoryboardMode:'replace', aiTask:'shots', aiText:'新分镜', lock:{current:false},
    Error, structuredClone, applyStoryboardImport, revisedAsset:(_before,next)=>next,
    api:async()=>({text:JSON.stringify({shots:[{title:'新镜头一',duration:10},{title:'新镜头二',duration:12}]})}),
    setBusy(){},setUndo(value){undo=value;},setAiText(){},setSelected(value){selected=value;},setStep(){},setDialog(){},setNotice(){},
    setError(error){throw Error(error);},setProject(){},setDirty(){},
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  await context.applyAi();
  assert.deepEqual(current.current.shots.map(s=>s.duration),[10,12]);
  assert.equal(current.current.assets[0].id,'11111111-1111-4111-8111-111111111111');
  assert.equal(selected,current.current.shots[0].id);
  assert.equal(undo.shots[0].duration,22);
});
