import {app,BrowserWindow,ipcMain} from 'electron';
import {fork} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {SoftwareUpdate}=require('./software-update.cjs');
const here=path.dirname(new URL(import.meta.url).pathname),root=await fs.mkdtemp(path.join(os.tmpdir(),'director-update-ui-'));
app.setPath('userData',path.join(root,'profile'));app.on('window-all-closed',()=>{});
let child,win,exitCode=0;
app.whenReady().then(async()=>{
 try{
  const token=crypto.randomBytes(24).toString('hex');
  child=fork(path.join(here,'release/v0.1.69/backend.mjs'),[],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','ignore','pipe','ipc']});child.stderr.on('data',b=>process.stderr.write(b));
  const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('backend timeout')),30000);child.on('message',m=>{if(m.type==='ready'){clearTimeout(timer);resolve(m.url)}if(m.type==='error')reject(Error(m.message))});child.send({type:'start',dataDir:path.join(root,'data'),token,encryptionKey:crypto.randomBytes(32).toString('hex')})});
  let mode='current',downloadCalls=0,installCalls=0,allowClose=false;
  const fake=Object.assign(new EventEmitter(),{async checkForUpdates(){return {updateInfo:{version:'0.1.70'}}},async downloadUpdate(){downloadCalls++;this.emit('download-progress',{percent:42});await new Promise(r=>setTimeout(r,200));return ['verified.exe']},quitAndInstall(silent,restart){assert(silent&&restart);installCalls++}});
  const manager=new SoftwareUpdate({version:'0.1.69',canInstall:true,updater:fake,fetch:async()=>{if(mode==='offline')throw Error('连接失败');if(mode==='unpublished')return new Response('',{status:404});return Response.json({version:mode==='current'?'0.1.69':'0.1.70',platform:'win32',releaseNotes:'修复故事生成\n优化更新流程 <b>纯文本</b>'})},requestInstall:()=>{if(allowClose)manager.installDownloaded();else manager.cancelInstall()}});
  ipcMain.handle('test:updates',(_event,action)=>action==='check'?manager.check():action==='install'?manager.downloadAndInstall():manager.snapshot());
  manager.on('state',state=>win?.webContents.send('test:update-state',state));
  const preload=path.join(root,'preload.cjs');await fs.writeFile(preload,`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('directorDesktop',{getVersion:async()=>'0.1.69',directories:async()=>({workspaceDir:'C:/Users/Test/workspace',jianyingDraftDir:'C:/Users/Test/Jianying'}),updates:a=>ipcRenderer.invoke('test:updates',a),onUpdateState:cb=>{const f=(_,s)=>cb(s);ipcRenderer.on('test:update-state',f);return()=>ipcRenderer.removeListener('test:update-state',f)}});`);
  win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload,sandbox:true}});await win.webContents.session.cookies.set({url,name:'director_session',value:token});
  const js=code=>win.webContents.executeJavaScript(code);const wait=async(code)=>{for(let i=0;i<120;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,100))}throw Error('Timeout '+code)};
  const click=async(text,scope='document')=>{await js(`Array.from(${scope}.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);await new Promise(r=>setTimeout(r,100))};
  await win.loadURL(url);await wait("document.querySelector('.topbar') && !document.querySelector('fieldset').disabled");await click('系统设置');await wait("document.querySelector('[data-update-current]')?.textContent==='v0.1.69'");
  await click('检查更新');await wait("document.querySelector('.software-update').textContent.includes('当前已是最新版。')");
  mode='offline';await click('检查更新');await wait("document.querySelector('.software-update').textContent.includes('检查更新失败')");
  mode='unpublished';await click('检查更新');await wait("document.querySelector('.software-update').textContent.includes('尚未发布版本')");
  mode='available';await click('检查更新');await wait("document.querySelector('[data-update-available]').textContent==='v0.1.70'");
  assert.equal(await js("document.querySelector('[data-update-notes] b')"),null,'release notes are rendered as text');
  await fs.writeFile(path.join(root,'settings-light.png'),(await win.webContents.capturePage()).toPNG());
  await click('下载并安装');await wait("document.querySelector('.software-update').textContent.includes('已保留下载')");assert.equal(downloadCalls,1);assert.equal(installCalls,0);
  allowClose=true;await click('下载并安装');await wait("document.querySelector('.software-update').textContent.includes('正在安装更新')");assert.equal(downloadCalls,1);assert.equal(installCalls,1);
  // Exercise the same UI in Mac/check-only mode after reopening settings.
  await js("document.querySelector('[data-slot=dialog-close]').click()");await new Promise(r=>setTimeout(r,200));manager.set({status:'available',canInstall:false,message:'发现新版本。'});await js("document.querySelector('.theme-toggle').click()");await click('系统设置');await wait("document.querySelector('.software-update') && document.documentElement.classList.contains('dark')");
  assert(await js("Array.from(document.querySelectorAll('.software-update button')).find(b=>b.textContent.trim()==='下载并安装').disabled"));
  await fs.writeFile(path.join(root,'settings-dark.png'),(await win.webContents.capturePage()).toPNG());
  console.log('PASS settings update UI: current/new version, notes, offline/unpublished, cancel/retry installation without redownload, Mac check-only and light/dark. Mock installer, no real installation. '+root);
 }catch(e){console.error(e);exitCode=1;if(win)console.error(await win.webContents.executeJavaScript('document.body.innerText.slice(-4000)'));}
 finally{win?.destroy();child?.send({type:'stop'});setTimeout(()=>app.exit(exitCode),1200)}
});
