import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {SoftwareUpdate,compareVersions,readRelease}=require('./software-update.cjs');
assert.equal(compareVersions('0.1.10','0.1.9'),1);
assert.throws(()=>compareVersions('oops','0.1.9'));
const release={version:'0.1.70',releaseNotes:'修复故事生成\n优化工作台',platform:'win32'};
let checks=0,downloads=0,closes=0,installs=0;
const updater=Object.assign(new EventEmitter(),{
 async checkForUpdates(){checks++;return {updateInfo:{version:'0.1.70'}}},
 async downloadUpdate(){downloads++;this.emit('download-progress',{percent:65});return ['/tmp/test-installer.exe']},
 quitAndInstall(silent,restart){assert(silent&&restart);installs++},
});
let response=()=>Response.json(release);
const update=new SoftwareUpdate({version:'0.1.69',canInstall:true,updater,fetch:async()=>response(),requestInstall:()=>closes++});
assert.equal(update.snapshot().status,'idle');
await update.check();assert.equal(update.snapshot().availableVersion,'0.1.70');
await update.downloadAndInstall();assert.equal(downloads,1);assert.equal(closes,1);assert.equal(installs,0,'installer cannot run before windows accept closing and services stop');
update.cancelInstall();assert.equal(update.snapshot().status,'downloaded');
await update.downloadAndInstall();assert.equal(downloads,1,'cancelled closing reuses verified download');
update.installDownloaded();assert.equal(installs,1);
response=()=>Response.json({...release,version:'0.1.68'});
const mac=new SoftwareUpdate({version:'0.1.69',canInstall:false,fetch:async()=>response()});
await mac.check();assert.equal(mac.snapshot().status,'current');assert.equal(mac.snapshot().message,'当前已是最新版。');
response=()=>Response.json(release);await mac.check();assert.equal(mac.snapshot().status,'available');await assert.rejects(()=>mac.downloadAndInstall(),/Windows安装版/);
response=()=>new Response('not found',{status:404});await mac.check();assert.equal(mac.snapshot().status,'unpublished');assert.equal(mac.snapshot().availableVersion,null);
response=()=>Response.json({version:'bad',releaseNotes:'x'});await mac.check();assert.equal(mac.snapshot().status,'error');assert.equal(mac.snapshot().availableVersion,null);
response=()=>{throw Error('offline')};await mac.check();assert.equal(mac.snapshot().status,'error');
response=()=>Response.json(release);
updater.downloadUpdate=async()=>{throw Error('checksum mismatch')};
const fail=new SoftwareUpdate({version:'0.1.69',canInstall:true,updater,fetch:async()=>response(),requestInstall:()=>{throw Error('must not close')}});
await fail.check();await fail.downloadAndInstall();assert.equal(fail.snapshot().status,'error');assert(!fail.snapshot().downloaded);
await assert.rejects(()=>readRelease(async()=>new Response('x'.repeat(70000)),'https://example.com/release.json'),/过大/);
console.log('PASS update versions, check states, unsupported host, verified download, canceled close, safe installer handoff and failure recovery');
let opened='';
const macRelease={...release,platform:'darwin',architectures:['arm64','x64']};
const macDownload=new SoftwareUpdate({version:'0.1.69',platform:'darwin',arch:'arm64',openDownload:url=>{opened=url},fetch:async url=>{assert.equal(url,'https://121.199.40.214/updates/mac/release.json');return Response.json(macRelease)}});
await macDownload.check();assert.equal(macDownload.snapshot().status,'available');
await macDownload.downloadAndInstall();assert.equal(opened,'https://121.199.40.214/updates/mac/MengyuanAI-0.1.70-arm64.zip');
assert.equal(macDownload.snapshot().canInstall,false);
await assert.rejects(()=>readRelease(async()=>Response.json(release),undefined,'darwin','arm64'),/格式无效/);
await assert.rejects(()=>readRelease(async()=>Response.json({...macRelease,architectures:['arm64']}),undefined,'darwin','x64'),/架构/);
console.log('PASS Mac platform channel, architecture-specific fixed download URL, manual install, mismatched manifests rejected');
