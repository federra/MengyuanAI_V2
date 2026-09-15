import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {EventEmitter, once} from 'node:events';
import {PassThrough} from 'node:stream';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const {createChromeLauncher} = createRequire(import.meta.url)('./doubao-chrome.cjs');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-install-'));
const extensionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../browser-extension');
const extensionVersion = JSON.parse(await fs.readFile(path.join(extensionDir,'manifest.json'),'utf8')).version;
const commands = [], launches = [];
let simulateRemoved=false,simulateContextNavigation=true;
function fakeSpawn(file,args,options) {
  assert(args.includes('--remote-debugging-pipe')); assert(args.includes('--enable-unsafe-extension-debugging'));
  assert(!args.some(a=>a.startsWith('--remote-debugging-port') || a.startsWith('--load-extension')));
  assert.equal(options.shell,false); assert(args.some(a=>a.startsWith('--user-data-dir=')));
  const child = new EventEmitter(); child.stdio=[null,null,null,new PassThrough(),new PassThrough()]; child.unref=()=>{};
  child.stdio[3].on('data',chunk=>{ for(const raw of String(chunk).split('\0').filter(Boolean)) {
    const msg=JSON.parse(raw);commands.push(msg);
    let result={};
    if(msg.method==='Extensions.loadUnpacked') {simulateRemoved=false;result={id:'a'.repeat(32)};}
    if(msg.method==='Extensions.getExtensions') result={extensions:simulateRemoved?[]:[{id:'a'.repeat(32),enabled:true,version:extensionVersion}]};
    if(msg.method==='Target.getTargets') result={targetInfos:[{type:'page',url:'about:blank',targetId:'blank'}]};
    if(msg.method==='Target.createTarget')result={targetId:'dev-mode'};
    if(msg.method==='Target.attachToTarget')result={sessionId:'dev-session'};
    if(msg.method==='Runtime.evaluate'){assert.equal(msg.sessionId,'dev-session');result={result:{value:msg.params.expression.includes("type:'version'")?{executionBuild:extensionVersion}:true}};}
    if(msg.method==='Target.createTarget'&&!msg.params.url.startsWith('chrome://extensions')) assert(commands.some(c=>c.method==='Extensions.loadUnpacked'),'install completes before account navigation');
    const destroyed=msg.method==='Runtime.evaluate'&&simulateContextNavigation;if(destroyed)simulateContextNavigation=false;
    const response=JSON.stringify({id:msg.id,...(destroyed?{error:{message:'Execution context was destroyed.'}}:{result})})+'\0';
    queueMicrotask(()=>{child.stdio[4].write(response.slice(0,10));child.stdio[4].write(response.slice(10));});
  }});
  launches.push(child);return child;
}
const launcher=createChromeLauncher({locate:async()=>'chrome.exe',spawnBrowser:fakeSpawn,timeout:100});
const url='http://127.0.0.1:1234/__director_connect#ticket='+'a'.repeat(64);
await Promise.all([launcher({profileDir:path.join(root,'A'),extensionDir,url}),launcher({profileDir:path.join(root,'A'),extensionDir,url})]);
assert.equal(launches.length,1);assert.equal(commands.filter(c=>c.method==='Extensions.loadUnpacked').length,1,'reopen must not reload a running extension');
assert(commands.findIndex(c=>c.method==='Runtime.evaluate'&&c.params.expression.includes('updateProfileConfiguration'))<commands.findIndex(c=>c.method==='Extensions.loadUnpacked'),'enable live developer mode before loading restored extensions');
assert.equal(commands.filter(c=>c.method==='Target.closeTarget' && c.params.targetId==='blank').length,1,'only close the initial empty tab');
await launcher({profileDir:path.join(root,'B'),extensionDir,url});assert.equal(launches.length,2);
await launcher({profileDir:path.join(root,'B'),extensionDir,url,viewExtensions:true});assert.equal(commands.filter(c=>c.method==='Target.createTarget').at(-1).params.url,'chrome://extensions/?id='+'a'.repeat(32));
simulateRemoved=true;
await assert.rejects(launcher({profileDir:path.join(root,'B'),extensionDir,url}),/原任务/);
assert(simulateRemoved,'must not repair/reload an extension while the account owns an active task');
await launcher({profileDir:path.join(root,'B'),extensionDir,url,allowRepair:true});assert(!simulateRemoved,'idle account automatically repairs a removed extension');
launches[0].emit('exit',0);await launcher({profileDir:path.join(root,'A'),extensionDir,url});assert.equal(launches.length,3);
await assert.rejects(launcher({profileDir:root,extensionDir,url:'https://example.com'}),/登录地址无效/);
await assert.rejects(launcher({profileDir:root,url}),/账号列表/);
let failedChild;
const failed=createChromeLauncher({locate:async()=>'chrome.exe',spawnBrowser:()=>{
  failedChild=new EventEmitter();failedChild.unref=()=>{};failedChild.stdio=[null,null,null,new PassThrough(),new PassThrough()];
  failedChild.stdio[3].on('data',chunk=>{const m=JSON.parse(String(chunk).replace('\0',''));failedChild.stdio[4].write(JSON.stringify({id:m.id,...(m.method==='Browser.getVersion'?{result:{}}:{error:{message:'Method not found'}})})+'\0');});return failedChild;
}});
await assert.rejects(failed({profileDir:root,extensionDir,url}),/更新到最新版/);
console.log('PASS install before navigation, private pipe, profile isolation, concurrent reopen, no active-worker reload, closed-session recovery and unsupported Chrome error.');

if(process.env.DIRECTOR_CHROME_INSTALL_LIVE==='1') {
  let redeemed=0;const children=[];const liveCommands=[];
  // Reject pairing deliberately: exercise the real extension without opening Doubao or using any account.
  const server=http.createServer((req,res)=>{if(req.url==='/connect/redeem'){redeemed++;res.writeHead(401,{'Content-Type':'application/json'});res.end('{"error":"Isolated install test"}');}else{res.end('<!doctype html><p id="director-connect-status">Install test</p>');}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const live=createChromeLauncher({spawnBrowser:(file,args,opts)=>{
    const child=spawn(file,[...args,'--headless=new'],{...opts,windowsHide:true});children.push(child);
    const write=child.stdio[3].write.bind(child.stdio[3]);child.stdio[3].write=(data,...rest)=>{liveCommands.push(JSON.parse(String(data).replace('\0','')).method);return write(data,...rest);};return child;
  }});
  const options={profileDir:path.join(root,'real-account'),extensionDir,allowRepair:true,url:`http://127.0.0.1:${server.address().port}/__director_connect#ticket=${'b'.repeat(64)}`};
  try {
    const installed=await live(options);assert.equal(installed.extensionInstalled,true);assert.equal(installed.developerMode,true);
    for(let i=0;i<40&&!redeemed;i++)await new Promise(r=>setTimeout(r,200));
    assert(redeemed>0,'actual auto-connect content script and service worker must reach the loopback pairing endpoint');
    await live(options);assert.equal(children.length,1);assert.equal(liveCommands.filter(m=>m==='Extensions.loadUnpacked').length,1);
    const stopped=once(children[0],'exit');children[0].stdio[3].write(JSON.stringify({id:999998,method:'Browser.close'})+'\0');await stopped;
    const preferences=JSON.parse(await fs.readFile(path.join(options.profileDir,'Default','Preferences'),'utf8'));
    const securePreferences=JSON.parse(await fs.readFile(path.join(options.profileDir,'Default','Secure Preferences'),'utf8'));
    assert.equal(securePreferences.extensions?.ui?.developer_mode ?? preferences.extensions?.ui?.developer_mode,true,'Chrome persists developer mode in the isolated account profile');
    await live(options);assert.equal(children.length,2,'closed browser reopens the same persistent profile');
    assert.equal(liveCommands.filter(m=>m==='Extensions.loadUnpacked').length,2,'existing profile automatically reloads the installed extension on browser restart');
    console.log('PASS LIVE: real Chrome extension, pairing, isolated developer-mode setting persisted across browser restart, and session reuse. No Doubao account or generation used.');
  } finally {
    for(const child of children) if(child.exitCode===null) {
      const exit=once(child,'exit');child.stdio[3].write(JSON.stringify({id:999999,method:'Browser.close'})+'\0');
      await Promise.race([exit,new Promise(r=>setTimeout(r,5000))]);
    }
    await new Promise(r=>server.close(r));
  }
}
