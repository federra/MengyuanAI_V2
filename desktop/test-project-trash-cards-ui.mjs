// Real compiled desktop + local D1, isolated account and no external generation.
import {createRequire} from 'node:module';
import {app,BrowserWindow,dialog} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const stage=path.resolve(process.env.DIRECTOR_ACCESS_STAGE);
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-trash-cards-ui-'));
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
  const fixture=exampleProject();fixture.id=crypto.randomUUID();fixture.title='必须保留的正常项目';fixture.shots=fixture.shots.slice(0,1);
  const active=await js(`fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(fixture)})}).then(r=>r.json())`);assert.equal(active.revision,1);
  await js(`(async()=>{const base=${JSON.stringify(fixture)};for(let i=0;i<18;i++){const value={...base,id:crypto.randomUUID(),title:'回收项目'+String(i+1).padStart(2,'0')};const saved=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}).then(r=>r.json());if(saved.revision!==1)throw Error(JSON.stringify(saved));const removed=await fetch('/api/projects/'+saved.id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:saved.revision})});if(!removed.ok)throw Error(await removed.text());}})()`);
  await js(`window.directorDesktop.auth('recovery-write',${JSON.stringify({project:active,dirty:false})})`);win.webContents.reload();await delay(1000);await wait('.storyboard-row');await click('项目中心');await wait('.project-trash-list');
  const inspect=()=>js(`(()=>{const list=document.querySelector('.project-trash-list'),last=list.lastElementChild;return {count:list.children.length,cards:list.querySelectorAll('.project-card').length,height:list.clientHeight,scrollHeight:list.scrollHeight,overflow:getComputedStyle(list).overflowY,viewport:innerHeight,width:innerWidth,horizontal:document.documentElement.scrollWidth>innerWidth,lastBottom:last.getBoundingClientRect().bottom,listBottom:list.getBoundingClientRect().bottom};})()`);
  const layout=await inspect();assert.equal(layout.count,18);assert.equal(layout.cards,18,'recycle bin must display project cards');assert.equal(layout.overflow,'auto');assert(layout.scrollHeight>layout.height);assert(layout.height<=layout.viewport*.8,JSON.stringify(layout));
  await js(`(()=>{const list=document.querySelector('.project-trash-list');list.scrollTop=list.scrollHeight;})()`);const scrolled=await inspect();assert(scrolled.lastBottom<=scrolled.listBottom+1);assert(await js("document.querySelector('.project-trash-list').scrollTop>0"));
  await js("document.querySelector('.project-trash-heading').scrollIntoView({block:'start'})");
  await fs.writeFile(path.join(root,'trash-cards-light.png'),(await win.webContents.capturePage()).toPNG());
  await click('清空回收站');await wait('[data-slot=dialog-title]');assert(await js("document.querySelector('[data-slot=dialog-description]').textContent.includes('无法恢复')"));await click('取消');assert.equal((await js("fetch('/api/projects/trash').then(r=>r.json())")).length,18);
  // Restore still works from a card, then only the remaining recycled projects are cleared.
  await js("document.querySelector('.project-trash-list button').click()");await delay(300);assert.equal((await js("fetch('/api/projects').then(r=>r.json())")).length,2);assert.equal((await js("fetch('/api/projects/trash').then(r=>r.json())")).length,17);
  await js("document.querySelector('.theme-toggle').click()");win.setSize(1024,788);await delay(300);assert(!(await inspect()).horizontal);await js("document.querySelector('.project-trash-list').scrollTop=0;document.querySelector('.project-trash-heading').scrollIntoView({block:'start'})");await fs.writeFile(path.join(root,'trash-cards-dark.png'),(await win.webContents.capturePage()).toPNG());
  win.setSize(760,788);await delay(200);assert(!(await inspect()).horizontal);
  await click('清空回收站');await click('确认清空');for(let i=0;i<100&&await js("!!document.querySelector('.project-trash-item')");i++)await delay(50);
  assert.equal(await js("document.querySelectorAll('.project-trash-item').length"),0);
  assert(await js("document.querySelector('.project-trash-section button').disabled"),'clear button disabled for empty bin');
  const remaining=await js("fetch('/api/projects').then(r=>r.json())");assert.equal(remaining.length,2);assert.deepEqual(remaining.find(p=>p.id===active.id),active,'clear must preserve active project exactly');
  assert.equal((await js("fetch('/api/projects/trash').then(r=>r.json())")).length,0);
  win.setSize(1450,788);win.webContents.reload();await delay(1000);await wait('.storyboard-row');await click('项目中心');await wait('.project-trash-section');assert.equal(await js("document.querySelectorAll('.project-trash-item').length"),0);
  console.log(JSON.stringify({passed:true,layout,scrolled,clearCancelled:true,restore:true,activePreserved:true,clearPersistent:true,screenshots:root}));win.destroy();app.quit();
 }catch(error){console.error(error);if(win&&!win.isDestroyed())await fs.writeFile(path.join(root,'failure.png'),(await win.webContents.capturePage()).toPNG());console.error('Screenshots: '+root);app.exit(1);}
});
