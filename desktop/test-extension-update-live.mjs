import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createChromeLauncher}=require('./doubao-chrome.cjs');
const {ChromePipe}=require('./chrome-pipe.cjs');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'director-live-update-'));
const extensionDir=path.join(root,'extension');
await fs.cp(new URL('../browser-extension/',import.meta.url),extensionDir,{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(extensionDir,'manifest.json'),'utf8'));
const background=await fs.readFile(path.join(extensionDir,'background.js'),'utf8');
async function writeVersion(version){
 await fs.writeFile(path.join(extensionDir,'manifest.json'),JSON.stringify({...manifest,version}));
 await fs.writeFile(path.join(extensionDir,'background.js'),background.replace(/const EXECUTION_BUILD='[^']+';/,`const EXECUTION_BUILD='${version}';`)+`\nglobalThis.__updateProbe='${version}';\n`);
}
const server=http.createServer((req,res)=>{if(req.url==='/connect/redeem'){res.writeHead(401,{'Content-Type':'application/json'});res.end('{"error":"Isolated test"}');}else res.end('<p id="director-connect-status">Isolated test</p>');});
server.listen(0,'127.0.0.1');await once(server,'listening');
let child,pipe,extensionId;
const launch=createChromeLauncher({spawnBrowser:(file,args,opts)=>{child=spawn(file,[...args,...(process.env.DIRECTOR_CHROME_HEADFUL==='1'?[]:['--headless=new'])],{...opts,windowsHide:true});pipe=new ChromePipe(child);pipe.sequence=100000;return child;}});
const opts={profileDir:path.join(root,'profile'),extensionDir,url:`http://127.0.0.1:${server.address().port}/__director_connect#ticket=${'a'.repeat(64)}`,allowRepair:true};
async function actualBuild(expected){
 const {verifyExtensionBuild}=require('./reload-doubao-extension.cjs');
 return verifyExtensionBuild(pipe,extensionId,expected);
}

try {
 await writeVersion('0.11.99');extensionId=(await launch(opts)).extensionId;assert.equal(await actualBuild('0.11.99'),'0.11.99');
 const pid=child.pid;
 await writeVersion(manifest.version);
 await launch({...opts,updateOnly:true,forceRefresh:true});
 assert.equal(child.pid,pid,'browser remains open during update');
 assert.equal(await actualBuild(manifest.version),manifest.version,'new service worker code is actually running');
 // Regression: Chrome's live setting may be off although the launcher cached
 // developerMode=true. The restored extension is then marked unsupported.
 const settingsTab=await pipe.send('Target.createTarget',{url:'chrome://extensions/',background:true});
 const settingsSession=(await pipe.send('Target.attachToTarget',{targetId:settingsTab.targetId,flatten:true})).sessionId;
 await pipe.send('Runtime.evaluate',{expression:'chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:false})',awaitPromise:true,returnByValue:true},settingsSession);
 const off=await pipe.send('Runtime.evaluate',{expression:'chrome.developerPrivate.getProfileConfiguration()',awaitPromise:true,returnByValue:true},settingsSession);
 assert.equal(off.result.value.inDeveloperMode,false);
 await launch({...opts,forceRefresh:true});
 const on=await pipe.send('Runtime.evaluate',{expression:'chrome.developerPrivate.getProfileConfiguration()',awaitPromise:true,returnByValue:true},settingsSession);
 assert.equal(on.result.value.inDeveloperMode,true,'re-read and restore live developer mode before repairing the disabled extension');
 assert.equal(await actualBuild(manifest.version),manifest.version);
 await pipe.send('Target.closeTarget',{targetId:settingsTab.targetId});
 const other=await launch({...opts,profileDir:path.join(root,'unopened'),updateOnly:true});assert.equal(other.updateDeferred,true);assert.equal(child.pid,pid,'background updater does not open inactive accounts');
 const stopped=once(child,'exit');await pipe.send('Browser.close');await stopped;
 await writeVersion('0.11.98');await launch({...opts,allowRepair:false});
 assert.equal(await actualBuild('0.11.98'),'0.11.98','cold restart refreshes cached worker even when an old task prohibits live repair');
 console.log('PASS LIVE Chrome: changed extension files reload into new worker code, same browser process/profile retained; unopened profiles stay closed. No Doubao account or generation used.');
} finally {
 if(child&&child.exitCode===null){const stopped=once(child,'exit');await pipe.send('Browser.close').catch(()=>{});await stopped;}
 await new Promise(r=>server.close(r));
 assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));
 await fs.rm(root,{recursive:true,force:true});
}
