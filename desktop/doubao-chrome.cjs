const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {ChromePipe}=require('./chrome-pipe.cjs');
const {enableDeveloperMode}=require('./chrome-developer-mode.cjs');
const {reloadExtension,verifyExtensionBuild}=require('./reload-doubao-extension.cjs');
let chromeSettingsFile='',customChrome='',cachedChrome='',cacheUntil=0;
const {execFile}=require('node:child_process');
async function configureChrome(settingsFile){
  chromeSettingsFile=settingsFile;customChrome='';cachedChrome='';cacheUntil=0;
  try{const data=JSON.parse(await fs.readFile(settingsFile,'utf8'));if(typeof data.path==='string')customChrome=data.path;}
  catch(error){if(error.code!=='ENOENT')throw Error('Chrome路径设置读取失败：'+error.message);}
}
async function validateChrome(file){
  if(typeof file!=='string'||!path.isAbsolute(file)||file.includes('\0'))throw Error('请选择 Chrome 程序的完整路径');
  if(process.platform==='win32'&&path.basename(file).toLowerCase()!=='chrome.exe')throw Error('请选择 chrome.exe，不要选择快捷方式');
  if(process.platform==='darwin'&&path.basename(file)!=='Google Chrome')throw Error('请选择 Google Chrome.app');
  try{if(!(await fs.stat(file)).isFile())throw Error('not a file');await fs.access(file);}
  catch{throw Error('Chrome程序不存在或无法读取，请重新选择');}
  return file;
}
async function saveChromePath(file){
  if(!chromeSettingsFile)throw Error('Chrome设置尚未就绪');
  if(file)await validateChrome(file);
  await fs.mkdir(path.dirname(chromeSettingsFile),{recursive:true});
  await fs.writeFile(chromeSettingsFile+'.tmp',JSON.stringify({path:file||''}),{mode:0o600});
  await fs.rename(chromeSettingsFile+'.tmp',chromeSettingsFile);
  customChrome=file||'';cachedChrome='';cacheUntil=0;
}
function registryChrome(key,view){
  const systemRoot=process.env.SystemRoot||process.env.SYSTEMROOT||'C:\\Windows';
  return new Promise(resolve=>execFile(path.join(systemRoot,'System32','reg.exe'),['query',key,'/ve',`/reg:${view}`],{windowsHide:true,timeout:1500,maxBuffer:32768,encoding:'utf8',shell:false},(error,stdout)=>{
    if(error)return resolve('');
    const value=String(stdout).match(/REG_(?:EXPAND_)?SZ\s+([^\r\n]+)/i)?.[1]?.trim()||'';
    const expanded=value.replace(/%([^%]+)%/g,(match,name)=>Object.entries(process.env).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1]||match);
    resolve(expanded.replace(/^"(.*)"$/,'$1'));
  }));
}
async function findChrome(){
  if(customChrome){try{return await validateChrome(customChrome);}catch{throw Error('手动设置的Chrome路径已失效，请在豆包插件 → Helper 中重新选择或恢复自动查找。');}}
  if(Date.now()<cacheUntil){if(cachedChrome){try{return await validateChrome(cachedChrome);}catch{}}else throw Error('未找到 Google Chrome，请在豆包插件 → Helper 中选择 Chrome 程序。');}
  const env=name=>Object.entries(process.env).find(([key])=>key.toLowerCase()===name.toLowerCase())?.[1];
  const candidates=process.platform==='darwin'
    ? ['/Applications',path.join(os.homedir(),'Applications')].map(root=>path.join(root,'Google Chrome.app','Contents','MacOS','Google Chrome'))
    : [env('ProgramW6432'),env('ProgramFiles'),env('ProgramFiles(x86)'),env('LocalAppData')].filter(Boolean).map(root=>path.join(root,'Google','Chrome','Application','chrome.exe'));
  for(const file of candidates){try{await validateChrome(file);cachedChrome=file;cacheUntil=Date.now()+30000;return file;}catch{}}
  if(process.platform==='win32')for(const hive of ['HKCU','HKLM'])for(const view of [64,32]){
    const file=await registryChrome(hive+'\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',view);
    try{await validateChrome(file);cachedChrome=file;cacheUntil=Date.now()+30000;return file;}catch{}
  }
  cachedChrome='';cacheUntil=Date.now()+30000;
  throw Error('未找到 Google Chrome，请在豆包插件 → Helper 中选择 Chrome 程序；尚未安装时请先安装 Google Chrome。');
}
function validateUrl(url) {
  const target = new URL(url);
  if (target.username || target.password || (!(target.origin === 'https://www.doubao.com' && target.pathname === '/chat/create-image') && !(target.protocol === 'http:' && target.hostname === '127.0.0.1' && target.port && target.pathname === '/__director_connect'))) throw Error('登录地址无效');
  return target.href;
}
function createChromeLauncher({locate = findChrome, spawnBrowser = spawn, timeout = 15000} = {}) {
  const sessions = new Map(), opening = new Map();
  async function launch({profileDir, extensionDir, viewExtensions = false, allowRepair = false, updateOnly = false, forceRefresh = false, url = 'https://www.doubao.com/chat/create-image'} = {}) {
    const href = validateUrl(url);
    if (!profileDir && !extensionDir && href === 'https://www.doubao.com/chat/create-image') {
      const file = await locate();
      await new Promise((resolve,reject) => { const child=spawnBrowser(file,[href],{shell:false,detached:true,stdio:'ignore',windowsHide:false}); child.once('error',reject); child.once('spawn',()=>{child.unref();resolve();}); });
      return {ok:true};
    }
    if (!profileDir || !extensionDir) throw Error('请从豆包插件的账号列表点击“打开登录”，以便自动安装并连接插件。');
    const profile = path.resolve(profileDir), extension = path.resolve(extensionDir);
    const manifest = JSON.parse(await fs.readFile(path.join(extension, 'manifest.json'), 'utf8'));
    if (manifest.manifest_version !== 3 || !manifest.background?.service_worker) throw Error('豆包助手文件不完整，请重新安装桌面程序。');
    const key = process.platform === 'win32' ? profile.toLowerCase() : profile;
    const run = (opening.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
      let session = sessions.get(key);
      if (session?.pipe.closed) { sessions.delete(key); session = null; }
      if (updateOnly && !session) return {ok:false, updateDeferred:true};
      if (!session) {
        const file = await locate(); await fs.mkdir(profile, {recursive:true});
        // Chrome 137+ supports Extensions.loadUnpacked over a private pipe instead of --load-extension.
        const child = spawnBrowser(file, [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', 'about:blank'], {shell:false, detached:true, stdio:['ignore','ignore','ignore','pipe','pipe'], windowsHide:false});
        const pipe = new ChromePipe(child, timeout);
        session = {pipe, loaded:false, coldStart:true}; sessions.set(key, session);
        child.unref(); child.stdio[3].unref?.(); child.stdio[4].unref?.();
      }
      let initialTabs = [];
      let stage='开启扩展开发者模式';
      try {
      // Chrome's live profile setting can disagree with cached/file values.
      // Enable it BEFORE checking/loading restored unpacked extensions.
      try { await enableDeveloperMode(session.pipe); }
      catch(error){throw Error('自动开启开发者模式失败：'+error.message+'；请检查 Chrome 设置或更新到最新版。');}
      stage='安装并检查扩展';
      if (!session.loaded) {
        await session.pipe.send('Browser.getVersion');
        try {
          const installed = await session.pipe.send('Extensions.loadUnpacked', {path:extension});
          if (!/^[a-p]{32}$/.test(installed?.id || '')) throw Error('Chrome 未确认插件安装成功');
          session.extensionId = installed.id; session.loaded = true;
          initialTabs = (await session.pipe.send('Target.getTargets')).targetInfos.filter(t => t.type === 'page' && t.url === 'about:blank');
        } catch {
          throw Error('未能自动安装豆包助手。请将 Google Chrome 更新到最新版，再关闭此账号窗口并重新打开登录。');
        }
      }
      // Verify the actual extension registration when supported by the installed Chrome version.
      try {
        const {extensions} = await session.pipe.send('Extensions.getExtensions');
        let installed = extensions.find(item=>item.id===session.extensionId);
        if(!installed?.enabled || installed.version!==manifest.version) {
          if(!allowRepair&&!session.coldStart)throw Error('豆包助手需恢复或更新，请先核对该账号的原任务，避免中断正在生成的视频。');
          const repaired=await session.pipe.send('Extensions.loadUnpacked',{path:extension});
          installed=(await session.pipe.send('Extensions.getExtensions')).extensions.find(item=>item.id===repaired.id);
          if(!installed?.enabled || installed.version!==manifest.version)throw Error('豆包助手自动恢复未成功，请关闭此账号窗口后重试。');
          session.extensionId=repaired.id;
        }
      } catch(error) {
        if(!/wasn't found|not found|not supported/i.test(error.message))throw error;
      }
      // Reuse the account session without reloading the extension or interrupting an active task.
      let refreshed=false;
      // Enable before reload: otherwise Chrome may block an unpacked extension
      // immediately after its initial debugger-assisted installation.
      // A new browser process has no live page operation to interrupt. Chrome
      // can still restore cached worker code from the persistent profile.
      if(session.coldStart||(allowRepair&&(forceRefresh||session.refreshedVersion!==manifest.version))){
        stage='重载并核对扩展实际版本';
        await reloadExtension(session.pipe,session.extensionId);
        await enableDeveloperMode(session.pipe);
        await verifyExtensionBuild(session.pipe,session.extensionId,manifest.version);
        session.refreshedVersion=manifest.version;session.coldStart=false;refreshed=true;
      }
      const navigation=new URL(href);if(refreshed&&navigation.pathname==='/__director_connect')navigation.hash+='&fresh=1';
      stage='连接工作台并打开豆包';
      const target=await session.pipe.send('Target.createTarget', {url:viewExtensions ? `chrome://extensions/?id=${session.extensionId}` : navigation.href, ...(updateOnly?{background:true}:{})});
      if(target.targetId&&!updateOnly){
        await session.pipe.send('Target.activateTarget',{targetId:target.targetId});
        // Restore an account window that was minimized in its saved profile.
        try{const window=await session.pipe.send('Browser.getWindowForTarget',{targetId:target.targetId});await session.pipe.send('Browser.setWindowBounds',{windowId:window.windowId,bounds:{windowState:'normal'}});}catch{}
      }
      for (const tab of initialTabs) {
        await session.pipe.send('Target.closeTarget', {targetId:tab.targetId}).catch(() => {});
      }
      return {ok:true, extensionInstalled:true, extensionId:session.extensionId, extensionVersion:manifest.version, developerMode:true};
      } catch(error) {
        // Explain startup failures in the otherwise empty account window.
        // Never navigate a user's existing conversation or draft.
        const message=`${stage}失败：${error.message}`;
        try {
          const tabs=(await session.pipe.send('Target.getTargets')).targetInfos;
          const blank=tabs.find(t=>t.type==='page'&&t.url==='about:blank');
          if(blank){
            const {sessionId}=await session.pipe.send('Target.attachToTarget',{targetId:blank.targetId,flatten:true});
            try {
              const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
              await session.pipe.send('Runtime.evaluate',{expression:`document.title='豆包启动未完成';document.body.innerHTML=${JSON.stringify('<main style="max-width:680px;margin:80px auto;font:16px/1.8 system-ui;color:#173154"><h2>豆包启动未完成</h2><p>'+escape(message)+'</p><p>本次尚未提交生成。请返回工作台查看任务记录，修复后可继续原队列。</p></main>')}`},sessionId);
            }finally{await session.pipe.send('Target.detachFromTarget',{sessionId}).catch(()=>{});}
          }
        }catch{}
        throw Error(message);
      }
    });
    opening.set(key, run);
    try { return await run; } finally { if (opening.get(key) === run) opening.delete(key); }
  }
  return launch;
}
const openChrome = createChromeLauncher();
module.exports={openChrome,findChrome,createChromeLauncher,configureChrome,saveChromePath,validateChrome};
