import {app,BrowserWindow} from 'electron';
import {fork} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-creative-'));
app.setPath('userData',path.join(root,'browser'));
const here=path.dirname(new URL(import.meta.url).pathname);
const token=crypto.randomBytes(24).toString('hex');
let child,win;let exitCode=0;
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 try{
  child=fork(path.join(here,'release',process.env.DIRECTOR_TEST_VERSION||'v0.1.67','backend.mjs'),[],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','ignore','pipe','ipc']});
  child.stderr.on('data',b=>process.stderr.write(b));
  const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('backend timeout')),30000);child.on('message',m=>{if(m.type==='ready'){clearTimeout(timer);resolve(m.url)}if(m.type==='error')reject(Error(m.message))});child.send({type:'start',dataDir:path.join(root,'workspace'),token,encryptionKey:crypto.randomBytes(32).toString('hex')})});
  const first=crypto.randomUUID(),second=crypto.randomUUID();
  const project={id:crypto.randomUUID(),title:'工作台回归测试',brief:'小猫找信',story:'第一版正在编辑的正文',script:'',scenes:'',style:'电影质感',ratio:'16:9',shots:[],assets:[],revision:0,updatedAt:new Date().toISOString(),selectedStoryId:first,storyPlans:[{id:first,title:'第一版',summary:'第一版梗概',content:'第一版原始正文',tags:[]},{id:second,title:'第二版',summary:'第二版梗概',content:'第二版完整故事正文',tags:[]}]};
  const request=(route,init={})=>fetch(url+route,{...init,headers:{Cookie:`director_session=${token}`,Origin:url,'Content-Type':'application/json',...init.headers}});
  const saved=await request('/api/projects',{method:'POST',body:JSON.stringify(project)});assert.equal(saved.status,200,await saved.clone().text());
  win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{sandbox:true}});
  await win.webContents.session.cookies.set({url,name:'director_session',value:token});
  const js=code=>win.webContents.executeJavaScript(code);
  const wait=async(code)=>{for(let i=0;i<120;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,100))}throw Error('Timeout '+code)};
  const click=async(text,scope='document')=>{await js(`(()=>{const b=Array.from(${scope}.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Button missing: '+${JSON.stringify(text)});b.click()})()`);await new Promise(r=>setTimeout(r,300))};
  const stage=async(text)=>{await js(`Array.from(document.querySelectorAll('.workflow button')).find(b=>b.querySelector('b')?.textContent===${JSON.stringify(text)}).click()`);await wait(`document.querySelector('.creative-title h1')?.textContent===${JSON.stringify(text+'工作区')}`);await new Promise(r=>setTimeout(r,300))};
  const fill=async(selector,value)=>{await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});const setter=Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`);await new Promise(r=>setTimeout(r,100))};
  await win.loadURL(url);await wait("document.querySelector('.workflow') && !document.querySelector('fieldset').disabled");await stage('创意');
  await js(`window.__requests=[];window.__fail=true;window.__originalFetch=window.fetch;window.fetch=async(input,init)=>{if(String(input)==='/api/ai' && init?.method==='POST'){const body=JSON.parse(init.body);window.__requests.push(body);if(body.task==='storyOptions')return Response.json({text:JSON.stringify({plans:[{title:'新增方案',summary:'梗概',content:'依据所选篇幅创作的完整故事',tags:[]}]})});if(window.__fail){window.__fail=false;return Response.json({error:'模拟模型服务暂时失败'},{status:502})}return Response.json({text:'第一场：小猫来到邮筒旁。\\n小猫：信在这里。'})}return window.__originalFetch(input,init)};true`);
  // Menus must expose custom at the top, and retain the value after committing.
  for(const [id,value] of [['creative-type','竖屏实验短片'],['creative-style','复古剪纸']]){
   await js(`document.getElementById('${id}').click()`);await wait("document.querySelector('[role=option]')");
   assert.equal(await js("document.querySelector('[role=option]').textContent.trim()"),'自定义+');
   await js("document.querySelector('[role=option]').click()");await wait("document.querySelector('[aria-label=自定义内容]')");
   await fill('[aria-label=自定义内容]',value);await click('保存',"document.querySelector('[role=dialog]')");
   assert.equal(await js(`document.getElementById('${id}').textContent.replace('▼','').trim()`),value);
  }
  await js("document.getElementById('creative-ratio').click()");await wait("document.querySelector('[role=option]')");
  assert.deepEqual(await js("Array.from(document.querySelectorAll('[role=option]')).map(e=>e.textContent.trim())"),['9:16','16:9','1:1','4:3','3:4','21:9']);
  await js("Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.trim()==='4:3').click()");
  await js("document.getElementById('creative-story-length').click()");await wait("document.querySelector('[role=option]')");await js("Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.trim()==='3000～5000字').click()");
  await stage('故事');await js("document.querySelector('[aria-label=\"预览故事：第二版\"]').click()");await wait("document.querySelector('[data-stage-field=story]').value==='第二版完整故事正文'");assert(await js("document.querySelector('[data-stage-field=story]').readOnly"));
  await click('返回当前正文');assert.equal(await js("document.querySelector('[data-stage-field=story]').value"),'第一版正在编辑的正文');
  await js("document.querySelector('[aria-label=\"预览故事：第二版\"]').click()");await click('确认故事，进入剧本');await click('确认生成剧本');await wait("document.querySelector('.creative-title h1')?.textContent==='剧本工作区' && !document.querySelector('fieldset').disabled");
  assert.equal(await js("window.__requests[0].task"),'script');assert.equal(await js("JSON.parse(window.__requests[0].content).story"),'第二版完整故事正文');assert.equal(await js("document.querySelector('[data-stage-field=script]').value"),'');
  await click('AI 生成剧本');await wait("document.querySelector('[data-stage-field=script]').value.includes('小猫：信在这里')");assert.equal(await js('window.__requests.length'),2);
  assert.deepEqual(await js("(()=>{const r=window.__requests[1],c=JSON.parse(r.content);return [r.storyLength,c.videoType,c.style,c.ratio]})()"),['3000～5000字','竖屏实验短片','复古剪纸','4:3']);
  await click('保存');await wait("!document.querySelector('fieldset').disabled");
  const persisted=(await (await request('/api/projects')).json())[0];assert.equal(persisted.storyLength,'3000～5000字');assert.equal(persisted.ratio,'4:3');assert(persisted.assets.some(a=>a.kind==='风格'&&a.name==='复古剪纸'&&a.inLibrary));assert(persisted.script.includes('小猫：信在这里'));assert.equal(persisted.selectedStoryId,second);
  await stage('故事');await fs.writeFile(path.join(root,'story-light.png'),(await win.webContents.capturePage()).toPNG());
  await js("document.querySelector('.theme-toggle').click()");await stage('创意');await fs.writeFile(path.join(root,'settings-dark.png'),(await win.webContents.capturePage()).toPNG());
  await click('AI 生成 3 个故事方案');await wait("window.__requests.at(-1)?.task==='storyOptions' && !document.querySelector('fieldset').disabled");assert.deepEqual(await js("(()=>{const r=window.__requests.at(-1),c=JSON.parse(r.content);return [r.storyLength,c.storyLength,c.videoType,c.style,c.ratio]})()"),['3000～5000字','3000～5000字','竖屏实验短片','复古剪纸','4:3']);
  console.log('PASS real desktop UI: story preview/draft preservation, script request uses selected story, failure retry/result insertion, custom dropdowns, six preset ratios, template creation and saved settings. Model mocked; isolated user data. Screenshots: '+root);
 }catch(e){console.error(e);if(win) {console.error(await win.webContents.executeJavaScript('document.body.innerText.slice(-5000)'));await fs.writeFile(path.join(root,'failure.png'),(await win.webContents.capturePage()).toPNG());}console.error(root);exitCode=1;}finally{win?.destroy();child?.send({type:'stop'});setTimeout(()=>app.exit(exitCode),1200)}
});
