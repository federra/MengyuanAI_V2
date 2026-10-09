// Real compiled desktop + local D1, isolated account and no external generation.
import {createRequire} from 'node:module';
import {app,BrowserWindow,dialog} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const stage=path.resolve(process.env.DIRECTOR_ACCESS_STAGE);
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-project-rename-ui-'));
app.setPath('userData',root);
const auth=require(path.join(stage,'access-session.cjs'));const Original=auth.AccessSession;
auth.AccessSession=class extends Original{constructor(options){super({...options,request:async()=>Response.json({token:'test-only',user:{id:'11111111-1111-4111-8111-111111111111',account:'test-member',role:'member',expires_at:Date.now()+900000},server_time:Date.now(),session_expires_at:Date.now()+900000})});}};
dialog.showMessageBox=async()=>({response:0});dialog.showMessageBoxSync=()=>1;
const updates=require(path.join(stage,'software-update.cjs'));const OriginalUpdate=updates.SoftwareUpdate;
updates.SoftwareUpdate=class extends OriginalUpdate{constructor(options){super({...options,fetch:async()=>{throw Error('isolated: updates disabled');}});}};
require(path.join(stage,'main.cjs'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{console.error('UI test timeout: '+root);app.exit(1);},90000).unref();
void app.whenReady().then(async()=>{
 let win;
 try{
  for(let i=0;i<150;i++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript("!!document.querySelector('#access-account')").catch(()=>false))break;await delay(100);}
  assert(win);const js=code=>win.webContents.executeJavaScript(code);
  const wait=async selector=>{for(let i=0;i<120;i++){if(await js(`!!document.querySelector(${JSON.stringify(selector)})`).catch(()=>false))return;await delay(100);}throw Error('Missing '+selector);};
  const click=async text=>{assert(await js(`(()=>{const button=[...document.querySelectorAll('button,[role=menuitem]')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button)return false;button.click();return true})()`),'Missing button '+text);await delay(150);};
  await wait('.access-submit:not(:disabled)');
  await js(`(()=>{for(const [id,value] of [['access-account','test-member'],['access-key','test-key']]){const input=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  await delay(100);await js("document.querySelector('.access-card form').requestSubmit()");await wait('.topbar');await delay(400);
  const {exampleProject}=await import('../work/test/studio.mjs');
  const base=exampleProject();base.shots=base.shots.slice(0,1);
  const create=async title=>js(`fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify({...base,id:crypto.randomUUID(),title,revision:0})})}).then(r=>r.json())`);
  const active=await create('当前项目');const other=await create('另一个项目');
  const draft={...active,brief:'当前项目未保存的创意，不能丢失'};
  await js(`window.directorDesktop.auth('recovery-write',${JSON.stringify({project:draft,dirty:true})})`);
  win.webContents.reload();await delay(1000);await wait('.storyboard-row');await click('项目中心');
  const openRename=async title=>{
    await js(`document.querySelector('[aria-label='+CSS.escape(${JSON.stringify(title+'项目操作')})+']').click()`);
    await click('重命名');await wait('#project-rename-title');
  };
  const input=async value=>{await js(`(()=>{const input=document.querySelector('#project-rename-title');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(100);};
  const all=()=>js("fetch('/api/projects').then(r=>r.json())");
  await openRename(other.title);await fs.writeFile(path.join(root,'rename-light.png'),(await win.webContents.capturePage()).toPNG());await input('  ');
  assert(await js("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='确认改名').disabled"),'blank name must not save');
  await input('取消的名称');await click('取消');assert.deepEqual((await all()).find(p=>p.id===other.id),other,'cancel preserves project');
  await openRename(other.title);await input('  另一个项目已改名  ');await click('确认改名');await delay(300);
  let saved=await all();assert.equal(saved.find(p=>p.id===other.id).title,'另一个项目已改名');assert.deepEqual(saved.find(p=>p.id===active.id),active,'renaming another card must not save or replace current draft');
  await click('创作中心');assert.equal(await js("document.querySelector('.project-switcher [data-slot=select-value]').textContent.trim()"),'当前项目');assert(await js("document.querySelector('.save-state').textContent.includes('有未保存修改')"));
  await click('项目中心');await openRename(active.title);await input('当前项目已改名');await click('确认改名');await delay(300);
  saved=await all();assert.equal(saved.find(p=>p.id===active.id).title,'当前项目已改名');assert.equal(saved.find(p=>p.id===active.id).brief,draft.brief,'active draft content must survive rename');
  // Revision conflict: do not silently overwrite a newer saved project.
  const stale=saved.find(p=>p.id===other.id);
  const concurrent=await js(`fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify({...stale,title:'外部已改名'})})}).then(r=>r.json())`);
  await openRename(stale.title);await input('过期改名');await click('确认改名');await delay(200);
  assert(await js("document.querySelector('[role=dialog] [role=alert]').textContent.includes('其他窗口更新')"));assert.deepEqual((await all()).find(p=>p.id===other.id),concurrent);await click('取消');
  await click('创作中心');assert.equal(await js("document.querySelectorAll('.workflow button').length"),5);assert.equal(await js("document.querySelectorAll('.workflow small').length"),0);
  await js("document.querySelector('.project-switcher').click()");await delay(150);assert.equal(await js("document.querySelectorAll('[role=option]').length"),(await all()).length,'switcher should contain projects only');await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  await fs.writeFile(path.join(root,'workflow-light.png'),(await win.webContents.capturePage()).toPNG());
  win.setSize(760,788);await js("document.querySelector('.theme-toggle').click()");await delay(200);await fs.writeFile(path.join(root,'workflow-dark-narrow.png'),(await win.webContents.capturePage()).toPNG());
  win.setSize(1450,788);win.webContents.reload();await delay(1000);await wait('.storyboard-row');await click('项目中心');await wait('.project-cards');assert(await js("document.querySelector('.project-cards').textContent.includes('当前项目已改名')"));
  await fs.writeFile(path.join(root,'project-center-dark.png'),(await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({passed:true,cancel:true,blankRejected:true,correctTarget:true,draftPreserved:true,conflictProtected:true,persistent:true,screenshots:root}));win.destroy();app.quit();
 }catch(error){console.error(error);if(win&&!win.isDestroyed())await fs.writeFile(path.join(root,'failure.png'),(await win.webContents.capturePage()).toPNG());console.error('Screenshots: '+root);app.exit(1);}
});
