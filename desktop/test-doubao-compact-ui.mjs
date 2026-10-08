// Compiled renderer + real isolated model configuration API; no external model calls.
import { createRequire } from 'node:module';
import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const stage = path.resolve(process.env.DIRECTOR_ACCESS_STAGE);
app.getVersion = () => JSON.parse(require('node:fs').readFileSync(path.join(stage, 'package.json'), 'utf8')).version;
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-doubao-compact-ui-'));
app.setPath('userData', root);
const auth = require(path.join(stage, 'access-session.cjs'));
const Original = auth.AccessSession;
auth.AccessSession = class extends Original {
  constructor(options) { super({ ...options, request: async () => Response.json({ token: 'test-session', user: { id: '11111111-1111-4111-8111-111111111111', account: 'test-member', role: 'member', expires_at: Date.now() + 600000 }, server_time: Date.now(), session_expires_at: Date.now() + 600000 }) }); }
};
dialog.showMessageBox = async () => ({ response: 0 });
dialog.showMessageBoxSync = () => 1;
const updates = require(path.join(stage, 'software-update.cjs'));
const OriginalUpdate = updates.SoftwareUpdate;
updates.SoftwareUpdate = class extends OriginalUpdate {
  constructor(options) { super({ ...options, fetch: async () => { throw Error('isolated test: updates disabled'); } }); }
};

const { DoubaoManager, DEFAULTS } = require(path.join(stage, 'doubao-manager.cjs'));
const accounts = Array.from({length: 2}, (_, i) => ({id: 'a'+i, serial: i+1, name: '豆包测试'+i, group: '默认分组', enabled: true, connected: i===0, loginStatus: 'logged_in', points: null, remaining: null, dailyLimit: null, today: {submitted: 1, completed: 0, active: 1, failed: 0}, extensionSetup: {status: 'verified', version: '0.13.6'}, runtimeState: 'busy'}));
const fixture = {accounts, participatingAccountIds: ['a0'], paused: false, settings: DEFAULTS, helper: {version: '0.13.6', port: 1, pid: 1, root: '隔离测试', database: '隔离测试', address: '127.0.0.1'}, jobs: ['submitted','attention','failed','succeeded'].map((status, i) => ({id: 'j'+i, projectId:'project', shotId:'shot'+i, accountId:'a0', title:'测试分镜'+i, status, requestId:'request'+i, submittedAt: new Date().toISOString(), createdAt: new Date().toISOString(), promptExcerpt: '清晨街道，角色望向远方。', parameters: {model:'Seedance 2.0 Mini', ratio:'16:9',duration:10}, error: status==='failed'?'原任务生成失败':undefined}))};
const commands=[];
DoubaoManager.prototype.command = async function(action, data={}) {
  commands.push(action);
  if(action==='retrieve') { const j=fixture.jobs.find(j=>j.id===data.id); j.retrieval={status:'fetching',message:'正在获取原任务结果…', key:'fixture',startedAt:new Date().toISOString()}; }
  if(action!=='snapshot' && action!=='retrieve') throw Error('Fixture forbids browser/generation action: '+action);
  return structuredClone(fixture);
};

require(path.join(stage, 'main.cjs'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
setTimeout(()=>{console.error('Doubao compact UI timeout');app.exit(1);},85000).unref();
void app.whenReady().then(async()=>{
 try {
  let win;
  for(let i=0;i<200;i++){win=BrowserWindow.getAllWindows()[0];if(win&&await win.webContents.executeJavaScript("!!document.querySelector('.access-submit:not(:disabled)')").catch(()=>false))break;await delay(100);}
  assert(win);win.setSize(1450,950);
  const js=code=>win.webContents.executeJavaScript(code);
  async function wait(code){for(let i=0;i<180;i++){if(await js(code).catch(()=>false))return;await delay(70);}throw Error('Missing: '+code);}
  async function button(label,scope='document'){await js(`[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`);await delay(150);}
  await js(`(()=>{for(const [id,value] of [['access-account','test-member'],['access-key','test-key']]){const input=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
  await delay(100);await js("document.querySelector('.access-card form').requestSubmit()");await wait("!!document.querySelector('.topbar')");
  await js("[...document.querySelectorAll('.workflow button')].find(b=>b.textContent.includes('分镜')).click()");await delay(200);
  await button('豆包插件');await wait("!!document.querySelector('.doubao-manager .doubao-usage-help')");
  assert.equal(await js("document.querySelector('.doubao-usage-help').open"),false);
  async function checkAccountAlignment(width) {
   win.setSize(width,950);await delay(150);
   const geometry=await js(`(()=>{const manager=document.querySelector('.doubao-manager');const toolbar=manager.querySelector(':scope > .actions');const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};return {toolbar:[...toolbar.querySelectorAll(':scope > button,:scope > label > select,:scope > .doubao-file-button')].map(box),rows:[...manager.querySelectorAll('.doubao-row-actions')].map(row=>[...row.children].map(e=>box(e.tagName==='DETAILS'?e.querySelector('summary'):e)))};})()`);
   assert.equal(geometry.toolbar.length,5,'measure all five visible account controls');
   const same=(a,b)=>Math.abs(a-b)<1;
   for(const b of geometry.toolbar)assert(same(b.y,geometry.toolbar[0].y)&&b.height===34,'account toolbar controls align: '+JSON.stringify(geometry.toolbar));
   for(const row of geometry.rows) {
    assert.equal(row.length,6);
    row.forEach((b,i)=>{assert(same(b.width,row[0].width)&&b.height===34,'account actions equal sizing: '+JSON.stringify(row));assert(same(b.x,row[i%2].x),'account action columns align: '+JSON.stringify(row));if(i%2)assert(same(b.y,row[i-1].y),'account action pairs align: '+JSON.stringify(row));});
   }
   await fs.writeFile(path.join(root,'accounts-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
   return {viewport:width,...geometry};
  }
  const accountChecks=[];
  for(const width of [1450,1024,760])accountChecks.push(await checkAccountAlignment(width));
  await js("document.querySelector('.doubao-row-actions details summary').click()");
  assert(await js("document.querySelector('.doubao-row-actions details').open"),'connection help remains accessible');
  assert(await js("document.querySelector('.doubao-row-actions details button').getBoundingClientRect().width>0"),'manual connection action remains available');
  await js("document.querySelector('.doubao-row-actions details summary').click()");
  win.setSize(1450,950);await delay(150);
  await fs.writeFile(path.join(root,'accounts-light.png'),(await win.webContents.capturePage()).toPNG());
  await button('任务',"document.querySelector('.doubao-tabs')");await wait("document.querySelectorAll('.doubao-record-actions button').length>0");
  assert.equal(await js("[...document.querySelectorAll('.doubao-record-actions button')].filter(b=>b.textContent==='重新获取').length"),2);
  await button('重新获取',"document.querySelector('.doubao-records')");await wait("!![...document.querySelectorAll('.doubao-record-actions button')].find(b=>b.textContent==='获取中…'&&b.disabled)");
  assert.equal(commands.filter(a=>a==='retrieve').length,1);
  assert(!commands.some(a=>['enqueue','regenerate'].includes(a)));
  const target=fixture.jobs.find(j=>j.retrieval);target.retrieval={...target.retrieval,status:'failed',message:'原任务仍在生成'};
  await js("window.dispatchEvent(new Event('director-doubao-change'))");await wait("document.querySelector('.doubao-records').textContent.includes('获取失败：原任务仍在生成')");
  const checks=[];
  for(const width of [1450,1024,760]) {
   win.setSize(width,950);await delay(200);
   const state=await js(`(()=>{const manager=document.querySelector('.doubao-manager');const page=manager.querySelector('.doubao-record-pagination');const r=page.querySelector('label').getBoundingClientRect();const select=page.querySelector('select').getBoundingClientRect();const buttons=[...manager.querySelectorAll('[data-slot=button]')].map(b=>({height:b.getBoundingClientRect().height,size:getComputedStyle(b).fontSize}));const dialog=manager.closest('[role=dialog]').getBoundingClientRect();return {width:dialog.width,viewport:innerWidth,labelHeight:r.height,selectHeight:select.height,buttons:buttons.filter(b=>b.height>0)};})()`);
   assert(state.width<=state.viewport,'dialog must fit viewport');assert(state.labelHeight<=state.selectHeight+2,'pagination label remains one line');assert(state.buttons.every(b=>b.height===34&&b.size==='13px'),JSON.stringify(state));
   checks.push({viewport:width,...state});await fs.writeFile(path.join(root,'tasks-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  await js("document.querySelector('[data-slot=dialog-close]').click()");await delay(150);await js("document.querySelector('.theme-toggle').click()");await delay(150);await button('豆包插件');await wait("!!document.querySelector('.doubao-manager')");await button('任务',"document.querySelector('.doubao-tabs')");await delay(150);
  await fs.writeFile(path.join(root,'tasks-dark.png'),(await win.webContents.capturePage()).toPNG());
  await button('账号',"document.querySelector('.doubao-tabs')");await delay(100);
  accountChecks.push({theme:'dark',...await checkAccountAlignment(1450)});
  await fs.writeFile(path.join(root,'accounts-dark.png'),(await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({passed:true,checks,accountChecks,screenshots:root}));win.destroy();app.quit();
 }catch(error){console.error(error);console.error('Screenshots: '+root);app.exit(1);}
});
