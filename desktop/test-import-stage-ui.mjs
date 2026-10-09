// Real compiled desktop + local D1, isolated account and no external generation.
import {createRequire} from 'node:module';
import {app,BrowserWindow,dialog} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const stage=path.resolve(process.env.DIRECTOR_ACCESS_STAGE);
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-import-stage-ui-'));
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
  const click=async text=>{assert(await js(`(()=>{const button=[...document.querySelectorAll('button,[role=menuitem]')].find(b=>b.textContent.trim()===${JSON.stringify(text)}||(b.matches('.workflow button')&&b.querySelector('b')?.textContent.trim()===${JSON.stringify(text)}));if(!button)return false;button.click();return true})()`),'Missing button '+text);await delay(150);};
  await wait('.access-submit:not(:disabled)');
  await js(`(()=>{for(const [id,value] of [['access-account','test-member'],['access-key','test-key']]){const input=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  await delay(100);await js("document.querySelector('.access-card form').requestSubmit()");await wait('.topbar');await delay(400);
  // Catch imports that apply content but leave the user on the creative stage.
  const typeText=async value=>{await js(`(()=>{const input=document.querySelector('.director-dialog textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(100);};
  const start=async option=>{await click('创意');await click('直接编写/导入');await click(option);await wait('.director-dialog textarea');};
  const apply=async()=>{await click('检查并预览导入');for(let i=0;i<120;i++){if(await js("[...document.querySelectorAll('.director-dialog button')].some(b=>b.textContent.trim()==='确认应用导入')"))break;await delay(100);}await click('确认应用导入');};
  for(const [option,title,field,value] of [
    ['导入故事','故事工作区','story','少年发现一封信，决定带着小猫踏上旅程。'],
    ['导入剧本','剧本工作区','script','第一场 外景 街角 日\n少年捡起信封。\n少年：我们出发吧。'],
    ['导入分镜脚本','分镜工作区','shots',JSON.stringify({shots:[{title:'导入镜头',description:'少年捡起信封',duration:5}]})],
  ]){
    await start(option);await typeText(value);await apply();
    assert.equal(await js("document.querySelector('.creative-title h1,.sheet-heading h1').textContent"),title,'successful import must navigate to its content stage');
    assert.equal(await js("!!document.querySelector('.director-dialog')"),false);
    await click('保存');
    const saved=await js("fetch('/api/projects').then(r=>r.json()).then(p=>p[0])");
    if(field==='shots'){assert.equal(saved.shots.length,1);assert.equal(saved.shots[0].title,'导入镜头');}
    else assert.equal(saved[field],value);
  }
  await start('导入剧本');await typeText('取消的剧本');
  await js("document.querySelector('.director-dialog [data-slot=dialog-close]').click()");await delay(150);
  assert.equal(await js("document.querySelector('.creative-title h1').textContent"),'创意工作区');
  await start('导入分镜脚本');await typeText('{}');await click('检查并预览导入');await wait('.director-dialog [role=alert]');
  assert.equal(await js("[...document.querySelectorAll('.director-dialog button')].some(b=>b.textContent.trim()==='确认应用导入')"),false,'failed import cannot apply or navigate');
  await js("document.querySelector('.director-dialog [data-slot=dialog-close]').click()");await delay(150);
  assert.equal(await js("document.querySelector('.creative-title h1').textContent"),'创意工作区');
  console.log(JSON.stringify({passed:true,story:true,script:true,shots:true,cancelStays:true,failureStays:true,isolated:root}));win.destroy();app.quit();
 }catch(error){console.error(error);if(win&&!win.isDestroyed())await fs.writeFile(path.join(root,'failure.png'),(await win.webContents.capturePage()).toPNG()).catch(()=>{});console.error('Screenshots: '+root);app.exit(1);}
});
