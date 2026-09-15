import {app,BrowserWindow} from 'electron';
import {fork} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-theme-'));
app.setPath('userData',path.join(root,'browser'));
const token=crypto.randomBytes(24).toString('hex'),children=[];
const here=path.dirname(new URL(import.meta.url).pathname);
async function backend(version){
 const child=fork(path.join(here,'release',version,'backend.mjs'),[],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','ignore','pipe','ipc']});children.push(child);child.stderr.on('data',b=>process.stderr.write(b));
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('backend timeout')),30000);child.on('message',m=>{if(m.type==='ready'){clearTimeout(timer);resolve(m.url)}if(m.type==='error')reject(Error(m.message))});child.send({type:'start',dataDir:path.join(root,version),token,encryptionKey:crypto.randomBytes(32).toString('hex')})});
}
app.whenReady().then(async()=>{
const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{sandbox:true}});
const errors=[];win.webContents.on('console-message',(_e,level,message)=>{if(level===3&&!/favicon/.test(message))errors.push(message)});
const js=code=>win.webContents.executeJavaScript(code);
async function settle(selector){for(let i=0;i<100;i++){if(await js(`!!document.querySelector(${JSON.stringify(selector)})`))return;await new Promise(r=>setTimeout(r,100))}throw Error('UI missing '+selector)}
const styleProbe=`(()=>{const fixture=document.createElement('section');fixture.innerHTML='<div class="storyboard-row"><textarea>测试输入</textarea></div><div class="studio-note">提示文字</div><button class="tag">状态</button>';document.body.append(fixture);const nodes=[document.body,document.querySelector('.topbar'),...fixture.querySelectorAll('*')];const result=nodes.map(e=>{const s=getComputedStyle(e);return [s.color,s.backgroundColor,s.borderColor,s.fontSize,s.borderRadius]});fixture.remove();return result})()`;
try{
 const old=await backend('v0.1.63');await win.webContents.session.cookies.set({url:old,name:'director_session',value:token});await win.loadURL(old);await settle('.topbar');await new Promise(r=>setTimeout(r,800));const baseline=await js(styleProbe);
 const url=await backend('v0.1.64');await win.loadURL(url);await settle('.theme-toggle');await new Promise(r=>setTimeout(r,800));
 assert.equal(await js("document.documentElement.classList.contains('dark')"),false);
 assert.deepEqual(await js(styleProbe),baseline,'original light appearance stays unchanged');
 await fs.writeFile(path.join(root,'light.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.querySelector('.theme-toggle').click()");await new Promise(r=>setTimeout(r,100));assert.equal(await js("document.documentElement.classList.contains('dark')"),true);
 assert.equal(await js("document.querySelector('.theme-toggle').getAttribute('aria-label')"),'切换到浅色主题');
 await fs.writeFile(path.join(root,'dark.png'),(await win.webContents.capturePage()).toPNG());
 await win.loadURL(url);await settle('.theme-toggle');assert.equal(await js("document.documentElement.classList.contains('dark')"),true,'reload persists');
 for(const label of ['资产中心','模型设置']){
  await js(`Array.from(document.querySelectorAll('[data-sidebar="menu-button"]')).find(b=>b.textContent.trim()===${JSON.stringify(label)}).click()`);await new Promise(r=>setTimeout(r,500));await fs.writeFile(path.join(root,label+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 await js("document.querySelector('.theme-toggle').click()");await new Promise(r=>setTimeout(r,100));assert.deepEqual(await js(styleProbe),baseline);
 assert(!errors.some(e=>/hydration|Hydration|Minified React error/.test(e)),errors.join('\n'));
 console.log('PASS unchanged light computed styles, accessible toggle, dark mode, persisted reload and management pages; screenshots: '+root);
} catch(e){console.error(e);process.exitCode=1;}finally{win.destroy();for(const child of children)child.send({type:'stop'});setTimeout(()=>app.exit(process.exitCode||0),1200)}

});
