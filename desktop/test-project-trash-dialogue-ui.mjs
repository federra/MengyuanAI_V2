// Real compiled desktop + local D1, isolated account and no external generation.
import {createRequire} from 'node:module';
import {app,BrowserWindow,dialog} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const stage=path.resolve(process.env.DIRECTOR_ACCESS_STAGE);
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-trash-dialogue-ui-'));
app.setPath('userData',root);
const auth=require(path.join(stage,'access-session.cjs'));const Original=auth.AccessSession;
auth.AccessSession=class extends Original{constructor(options){super({...options,request:async()=>Response.json({token:'test-only',user:{id:'11111111-1111-4111-8111-111111111111',account:'test-member',role:'member',expires_at:Date.now()+600000},server_time:Date.now(),session_expires_at:Date.now()+600000})});}};
dialog.showMessageBox=async()=>({response:0});dialog.showMessageBoxSync=()=>1;
const updates=require(path.join(stage,'software-update.cjs'));const OriginalUpdate=updates.SoftwareUpdate;
updates.SoftwareUpdate=class extends OriginalUpdate{constructor(options){super({...options,fetch:async()=>{throw Error('isolated: updates disabled');}});}};
require(path.join(stage,'main.cjs'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
setTimeout(()=>{console.error('UI test timeout: '+root);app.exit(1);},60000).unref();
void app.whenReady().then(async()=>{
 let win;
 try{
  for(let i=0;i<150;i++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript("!!document.querySelector('#access-account')").catch(()=>false))break;await delay(100);}
  assert(win);const js=code=>win.webContents.executeJavaScript(code);
  const wait=async selector=>{for(let i=0;i<120;i++){if(await js(`!!document.querySelector(${JSON.stringify(selector)})`).catch(()=>false))return;await delay(100);}throw Error('Missing '+selector);};
  const click=async text=>{assert(await js(`(()=>{const button=[...document.querySelectorAll('button,[role=menuitem]')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button)return false;button.click();return true})()`),'Missing button '+text);await delay(150);};
  await wait('.access-submit:not(:disabled)');
  await js(`(()=>{for(const [id,value] of [['access-account','test-member'],['access-key','test-key']]){const input=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  await delay(100);await js("document.querySelector('.access-card form').requestSubmit()");await wait('.storyboard-row');await delay(400);
  const {exampleProject}=await import('../work/test/studio.mjs');const {newLine}=await import('../work/test/dialogue.mjs');
  const fixture=exampleProject();fixture.title='回收站与台词验收';fixture.script='第1场 店铺 白天\n人物：老王、小刘、年轻妈妈\n老王：第一条。\n小刘：答话。';
  fixture.assets=['老王','小刘','年轻妈妈'].map(name=>({id:crypto.randomUUID(),kind:'人物',name,description:'固定设定'}));
  fixture.shots=fixture.shots.slice(0,1);const shot=fixture.shots[0];shot.character='老王、小刘、年轻妈妈';shot.references=fixture.assets.map(a=>a.id);
  shot.lines=Array.from({length:7},(_,i)=>({...newLine(),speaker:i===0?'老王':'',text:i===1?'药片碰撞声，老王：第二条。':i===2?'妈妈（声音发颤）：第三条。':i===6?'小刘：先问。 老王：再答。':`老王：第${i+1}条。`}));shot.dialogue=shot.lines.map(l=>l.text).join('\n');
  const saved=await js(`fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(fixture)})}).then(r=>r.json())`);assert(saved.revision===1,JSON.stringify(saved));
  await js(`window.directorDesktop.auth('recovery-write',${JSON.stringify({project:saved,dirty:false})})`);win.webContents.reload();await delay(1200);await wait('.dialogue-stack');
  const layout=await js(`(()=>{const stack=document.querySelector('.dialogue-stack');return {display:getComputedStyle(stack).display,height:stack.clientHeight,scrollHeight:stack.scrollHeight,cards:[...stack.querySelectorAll('.dialogue-card')].map(c=>({height:c.getBoundingClientRect().height,textarea:c.querySelector('textarea').getBoundingClientRect().height})),selectors:[...stack.querySelectorAll('.dialogue-controls button')].map(b=>b.innerText),text:stack.innerText}})()`);
  assert.equal(layout.cards.length,7);assert(layout.cards.every(c=>c.height>=70&&c.textarea>=35),JSON.stringify(layout));assert(layout.scrollHeight>layout.height);assert(layout.text.includes('老王'));assert(layout.text.includes('妈妈'));assert(layout.text.includes('多说话人'));
  const beforeScroll=await js("document.querySelector('.dialogue-stack .dialogue-card').getBoundingClientRect().top");await js("document.querySelector('.dialogue-stack').scrollTop=200");const afterScroll=await js("document.querySelector('.dialogue-stack .dialogue-card').getBoundingClientRect().top");assert(afterScroll<beforeScroll);
  await fs.writeFile(path.join(root,'dialogue-scroll.png'),(await win.webContents.capturePage()).toPNG());
  await js("document.querySelector('.theme-toggle').click()");await js("[...document.querySelectorAll('.workflow button')].find(b=>b.querySelector('b')?.textContent==='剧本').click()");await wait('.formatted-script');
  const dark=await js("(()=>{const e=document.querySelector('.formatted-script'),s=getComputedStyle(e);return {dark:document.documentElement.classList.contains('dark'),background:s.backgroundColor,color:s.color};})()");assert(dark.dark);assert(!['rgb(255, 255, 255)','rgba(0, 0, 0, 0)'].includes(dark.background),JSON.stringify(dark));
  await fs.writeFile(path.join(root,'script-dark.png'),(await win.webContents.capturePage()).toPNG());
  await click('项目中心');await wait('.project-card-menu');await delay(350);
  assert.equal(await js("document.querySelectorAll('.project-card-shell button.project-card-menu').length"),1);
  await js("document.querySelector('.project-card-menu').click()");await wait('[data-slot=dropdown-menu-item]');await click('删除');await wait('[data-slot=dialog-title]');await click('取消');
  assert.equal((await js("fetch('/api/projects').then(r=>r.json())")).length,1);
  await js("document.querySelector('.project-card-menu').click()");await wait('[data-slot=dropdown-menu-item]');await click('删除');await click('确认删除');await wait('.project-trash-item');
  assert.equal(await js("document.querySelectorAll('.project-cards > .project-card-shell').length"),0);
  const trashed=await js("fetch('/api/projects/trash').then(r=>r.json())");assert.equal(trashed.length,1);assert.equal(trashed[0].project.script,fixture.script);assert.deepEqual(trashed[0].project.shots[0].lines.map(l=>l.text),shot.lines.map(l=>l.text));
  assert.equal(trashed[0].expiresAt-trashed[0].deletedAt,30*86400000);
  await fs.writeFile(path.join(root,'project-trash-dark.png'),(await win.webContents.capturePage()).toPNG());
  // Hold a periodic refresh across restore: stale response must not resurrect a trash item.
  await js(`(()=>{const original=window.fetch;window.fetch=async(...args)=>{const response=await original(...args);if(String(args[0])==='/api/projects/trash'){window.trashRefreshHeld=true;await new Promise(resolve=>window.releaseTrashRefresh=resolve);}return response;};window.dispatchEvent(new Event('focus'));})()`);
  for(let i=0;i<40&&!await js('!!window.trashRefreshHeld');i++)await delay(50);
  assert(await js('!!window.trashRefreshHeld'));
  await click('恢复');await wait('.project-card-menu');assert.equal(await js("document.querySelectorAll('.project-trash-item').length"),0);
  await js('window.releaseTrashRefresh()');await delay(350);assert.equal(await js("document.querySelectorAll('.project-trash-item').length"),0,'stale refresh must not overwrite restore');
  const restored=(await js("fetch('/api/projects').then(r=>r.json())"))[0];assert.equal(restored.id,fixture.id);assert.equal(restored.script,fixture.script);
  assert.deepEqual(restored.shots[0].lines.map(l=>l.id),shot.lines.map(l=>l.id));
  // Reload proves restored and recycled state is durable, not an in-memory list.
  await js(`window.directorDesktop.auth('recovery-write',${JSON.stringify({project:restored,dirty:false})})`);win.webContents.reload();await delay(1000);await wait('.storyboard-row');
  assert.equal(await js("document.querySelectorAll('.dialogue-card').length"),7);
  console.log(JSON.stringify({passed:true,layout,dark,projectRestored:true,periodDays:30,screenshots:root}));win.destroy();app.quit();
 }catch(error){console.error(error);if(win&&!win.isDestroyed())await fs.writeFile(path.join(root,'failure.png'),(await win.webContents.capturePage()).toPNG());console.error('Screenshots: '+root);app.exit(1);}
});
