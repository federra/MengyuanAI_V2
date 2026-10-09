// Real compiled desktop + local D1, isolated account and no external generation.
import {createRequire} from 'node:module';
import {app,BrowserWindow,dialog} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const stage=path.resolve(process.env.DIRECTOR_ACCESS_STAGE);
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-project-delete-ui-'));
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
  const mode=process.env.DIRECTOR_DELETE_CASE || 'empty';
  const {exampleProject}=await import('../work/test/studio.mjs');
  const fixture=exampleProject();fixture.id=crypto.randomUUID();fixture.title='不应复活的旧项目';
  const save=()=>js(`fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(fixture)})}).then(r=>r.json())`);
  if(mode==='empty'){
    assert.equal(await js("document.querySelectorAll('.storyboard-row').length"),0,'empty account must not show sample or historic shots');
  }else if(mode==='stale'){
    const saved=await save();
    await js(`fetch('/api/projects/'+${JSON.stringify(saved.id)},{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:${saved.revision}})})`);
    await js("fetch('/api/projects/trash',{method:'DELETE'})");
    await js(`window.directorDesktop.auth('recovery-write',${JSON.stringify({project:{...saved,brief:'过期草稿'},dirty:true})})`);
    win.webContents.reload();await delay(1000);await wait('.topbar');await delay(500);
    assert.equal(await js("document.querySelectorAll('.storyboard-row').length"),0,'cleared project must not recover historic storyboards');
    assert(!(await js("document.querySelector('.project-switcher').textContent")).includes(fixture.title));
    assert.equal((await js("fetch('/api/projects').then(r=>r.json())")).length,0);
  }else if(mode==='delete'){
    await save();win.webContents.reload();await delay(1000);await wait('.storyboard-row');await click('项目中心');
    await js(`document.querySelector('[aria-label='+CSS.escape(${JSON.stringify(fixture.title+'项目操作')})+']').click()`);await click('删除');await click('确认删除');await click('创作中心');
    assert.equal(await js("document.querySelectorAll('.storyboard-row').length"),0,'deleting last project must clear all rows');
    win.webContents.reload();await delay(1000);await wait('.topbar');await delay(500);assert.equal(await js("document.querySelectorAll('.storyboard-row').length"),0,'deleted rows must stay cleared after reload');
    assert.equal((await js("fetch('/api/projects/trash').then(r=>r.json())")).length,1,'normal recycle recovery retained');
  }else if(mode==='external'){
    const saved=await save();win.webContents.reload();await delay(1000);await wait('.storyboard-row');
    await js(`fetch('/api/projects/'+${JSON.stringify(saved.id)},{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:${saved.revision}})})`);
    await js("window.dispatchEvent(new Event('focus'))");await delay(500);
    assert.equal(await js("document.querySelectorAll('.storyboard-row').length"),0,'focus refresh must evict a recycled current project');
    assert(!(await js("document.querySelector('.project-switcher').textContent")).includes(fixture.title));
  }
  console.log(JSON.stringify({passed:true,mode,isolated:root}));win.destroy();app.quit();
 }catch(error){console.error(error);if(win&&!win.isDestroyed())await fs.writeFile(path.join(root,'failure.png'),(await win.webContents.capturePage()).toPNG()).catch(()=>{});console.error('Screenshots: '+root);app.exit(1);}
});
