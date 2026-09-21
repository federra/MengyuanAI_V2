const {app, BrowserWindow, Menu, dialog, shell, session, safeStorage, ipcMain, Notification} = require('electron');
const {exportImage} = require('./image-files.cjs');
const {exportVideo} = require('./video-files.cjs');
const {exportJianying} = require('./jianying-export.cjs');
const {DirectorySettings} = require('./directory-settings.cjs');
const {openChrome,configureChrome,saveChromePath} = require('./doubao-chrome.cjs');
const {DoubaoManager} = require('./doubao-manager.cjs');
const {attachCloseGuard} = require('./close-window.cjs');
const {createShutdown} = require('./shutdown.cjs');
const {adminCommand} = require('./admin-bridge.cjs');
const {AccessSession} = require('./access-session.cjs');
const {AccountWorkspace} = require('./account-workspace.cjs');
const {SoftwareUpdate, UPDATE_BASE} = require('./software-update.cjs');
const {fork} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
app.setName('AI Director Desktop');
const smoke = process.argv.includes('--smoke-test');
const smokeDir = process.env.DIRECTOR_SMOKE_DIR;
if (smoke && smokeDir) app.setPath('userData',path.resolve(smokeDir));
let window, backend, origin, token, doubaoManager, shuttingDown = false;
const userRoot=app.getPath('userData');
const rememberedLogin=require('./remembered-login.cjs').createRememberedLogin({file:path.join(userRoot,'remembered-login.enc'),safeStorage});
let accountRoot=path.join(userRoot,'login-shell'), boundUserId='', workspaceReady=false, internalToken='';
const owners=new AccountWorkspace(userRoot);
let dataDir=path.join(accountRoot,'workspace');
let directories = new DirectorySettings(accountRoot,process.env.LOCALAPPDATA || path.join(app.getPath('home'),'AppData','Local'));
let exportingDraft = false, activeRequests=0;
let recoveryWrites=Promise.resolve();
let usageSequence=0;
const usageCommands=new Map();
function usageCommand(action,data){
  return new Promise((resolve,reject)=>{
    if(!backend?.connected)return reject(Error('统计记录服务尚未就绪'));
    const id=++usageSequence;const timeout=setTimeout(()=>{usageCommands.delete(id);reject(Error('统计记录写入超时'));},15000);
    usageCommands.set(id,{resolve,reject,timeout});backend.send({type:'usage-command',id,action,...data});
  });
}
let softwareUpdate, pendingUpdateInstall = false, updateInstallHandoff = false;
const auth=new AccessSession({onState:()=>{if(backend?.connected)backend.send({type:'access-state',authorized:authState().authorized});if(window&&!window.isDestroyed()){window.webContents.send('director:auth-state',authState());menu();}}});
function authState(){const state=auth.snapshot();return {...state,authorized:state.authorized&&workspaceReady,boundUserId,workspaceReady};}
async function authorized(){const user=await auth.authorize();if(!workspaceReady||user.id!==boundUserId)throw Error('UNAUTHENTICATED');return user;}
const logPath = path.join(app.getPath('userData'),'desktop.log');
async function log(message) {
  await fs.mkdir(app.getPath('userData'),{recursive:true});
  // Diagnostic events only. API credentials are never logged.
  await fs.appendFile(logPath, `${new Date().toISOString()} ${message}\n`).catch(()=>{});
}
const shutdown = createShutdown({getBackend:()=>backend, stopHelper:()=>doubaoManager?.stop(), log, exit:code=>{
  if(pendingUpdateInstall){
    updateInstallHandoff=true;
    try{softwareUpdate.installDownloaded();}catch(error){recoverUpdateInstall(error);}
  } else app.exit(code);
}});
function recoverUpdateInstall(error) {
  void log('Update installer could not start: '+error.message);
  dialog.showErrorBox('更新安装未完成','将重新打开当前版本，请稍后重试。已保存项目会保留。');
  app.relaunch();app.exit(1);
}
async function encryptionKey() {
  if (!safeStorage.isEncryptionAvailable()) throw Error('Windows密钥保护不可用，无法安全保存模型配置。');
  const filename = path.join(accountRoot,'model-key.bin');
  try { return safeStorage.decryptString(await fs.readFile(filename)); }
  catch(error) {
    if (error.code !== 'ENOENT') throw Error('无法读取本机加密密钥，请保留数据目录并检查Windows账户是否变更。');
    const key = crypto.randomBytes(32).toString('base64');
    await fs.writeFile(filename,safeStorage.encryptString(key),{flag:'wx'});
    return key;
  }
}
async function startBackend() {
  await fs.mkdir(accountRoot,{recursive:true});
  token = crypto.randomBytes(32).toString('hex');
  const key = await encryptionKey();
  backend = fork(path.join(__dirname,'backend.mjs'),[],{
    execPath:process.execPath, env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},
    stdio:['ignore','pipe','pipe','ipc'], windowsHide:true,
  });
  const child=backend;
  backend.stdout.on('data',()=>{});
  backend.stderr.on('data',()=>log('Local worker emitted a diagnostic; see startup error if loading fails.'));
  backend.on('exit',(code)=>{
    log(`Local backend exited (${code}).`);
    if (!shuttingDown && child===backend && origin && !smoke) {
      dialog.showErrorBox('本地服务已停止','请重新启动桌面版。已经保存的项目仍在本地数据目录中。');
      app.quit();
    }
  });
  return new Promise((resolve,reject)=>{
    const timeout = setTimeout(()=>reject(Error('本地服务启动超时，请查看“帮助 → 打开日志”。')),60000);
    backend.once('error',error=>{clearTimeout(timeout);reject(error);});
    backend.once('exit',()=>{clearTimeout(timeout);reject(Error('本地服务未能启动。'));});
    backend.on('message',async message=>{
      if(message.type==='usage-command-result'){
        const pending=usageCommands.get(message.id);if(pending){clearTimeout(pending.timeout);usageCommands.delete(message.id);if(message.error)pending.reject(Error('统计记录写入失败'));else pending.resolve();}return;
      }
      if(message.type==='usage-upload'){
        try{const user=await auth.authorize();if(child!==backend||user.id!==boundUserId||message.ownerId!==boundUserId)throw Error('UNAUTHENTICATED');const data=await auth.call('/usage/events',{events:message.events});if(child.connected)child.send({type:'usage-upload-result',id:message.id,data});}
        catch{if(child.connected)child.send({type:'usage-upload-result',id:message.id,error:'UPLOAD_UNAVAILABLE'});}return;
      }
      if(message.type==='activity-finished'){activeRequests=Math.max(0,activeRequests-1);return;}
      if(message.type==='authorize'){
        let state;try{const user=await authorized();state={authorized:true,user};activeRequests++;}catch(error){state={authorized:false,code:error.message};}
        if(child.connected)child.send({type:'authorization',id:message.id,state});
        return;
      }
      if (message.type === 'error') {clearTimeout(timeout);reject(Error(message.message));}
      if (message.type === 'ready') {clearTimeout(timeout);resolve(message.url);}
    });
    backend.send({type:'start',dataDir,encryptionKey:key,token,ownerId:boundUserId,ownerRole:auth.snapshot().user?.role,internalToken});
  });
}
async function activateWorkspace(){
  const user=await auth.authorize();
  let claim=false;
  const existing=await fs.access(path.join(owners.path(user.id),'owner.json')).then(()=>true).catch(()=>false);
  if(!existing&&await owners.hasLegacy()){
    const choice=await dialog.showMessageBox(window,{type:'question',title:'本机已有旧工作区',message:`是否将旧项目和模型、豆包资料归入账号 ${user.account}？`,detail:'认领会复制到该账号的独立目录，原目录保留。请先关闭旧版工作台和旧豆包浏览器，再认领属于你的数据；选择新建则使用空工作区。',buttons:['新建空工作区','认领旧工作区','取消登录'],defaultId:0,cancelId:2});
    if(choice.response===2){await auth.logout();throw Error('LOGIN_CANCELLED');}claim=choice.response===1;
  }
  const prepared=await owners.prepare(user.id,claim);
  const previous=backend;backend=null;
  if(previous?.connected){const stopped=new Promise(resolve=>previous.once('exit',resolve));previous.send({type:'stop'});await stopped;}
  accountRoot=prepared;boundUserId=user.id;
  directories=new DirectorySettings(accountRoot,process.env.LOCALAPPDATA || path.join(app.getPath('home'),'AppData','Local'));
  await directories.load();await directories.applyPending();dataDir=directories.value.workspaceDir;
  internalToken=crypto.randomBytes(32).toString('hex');
  origin=await startBackend();
  await fs.cp(path.join(__dirname,'doubao-extension'),path.join(accountRoot,'doubao-extension'),{recursive:true});
  doubaoManager=await new DoubaoManager({root:path.join(accountRoot,'doubao-data'),backend:()=>({origin,token,internalToken}),authorize:()=>authorized(),log,notify:job=>{
    if(auth.snapshot().authorized&&Notification.isSupported())new Notification({title:job.status==='succeeded'?'豆包视频已完成':'豆包任务需要处理',body:'请返回工作台查看任务。'}).show();
  }}).start();
  workspaceReady=true;menu();
  await window.webContents.session.cookies.set({url:origin,name:'director_session',value:token,httpOnly:true,sameSite:'strict',path:'/'});
  await window.loadURL(origin);
}
async function importProject() {
  try{await authorized();}catch{return;}
  const result = await dialog.showOpenDialog(window,{title:'导入项目JSON（文字与设定）',filters:[{name:'项目JSON',extensions:['json']}],properties:['openFile']});
  if (result.canceled) return;
  try {
    const file = result.filePaths[0];
    if ((await fs.stat(file)).size > 2000000) throw Error('项目JSON不能超过2MB。');
    const project = JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
    if (!Array.isArray(project.shots) || !Array.isArray(project.assets)) throw Error('请选择“下载项目JSON”导出的文件。分镜JSON请在工作台内导入。');
    project.id = crypto.randomUUID(); project.revision=0;
    project.title = `${String(project.title || '导入项目').slice(0,140)}（导入）`;
    delete project.changeLog;
    let mediaCount=0;
    for (const item of [...project.shots,...project.assets]) {
      for (const line of item.lines || []) { if(line.audio) mediaCount++; delete line.audio; delete line.speechPendingId; delete line.speechGenerationId; }
      for (const key of ['image','video','audio','referenceImage','firstFrame','firstFrameSource','blockingImage','versions']) {
        if (item[key]) {mediaCount++;delete item[key];}
      }
    }
    for (const asset of project.assets) asset.inLibrary=false;
    const response = await fetch(origin+'/api/projects',{method:'POST',headers:{'Content-Type':'application/json','x-director-import':'1',Origin:origin,Cookie:`director_session=${token}`},body:JSON.stringify(project)});
    const body = await response.json();
    if (!response.ok) throw Error(body.error || '项目导入失败');
    window.webContents.reload();
    await dialog.showMessageBox(window,{type:'info',title:'项目已导入',message:'已作为新项目保存到本机。',detail:mediaCount?'文字、分镜、Skill与资产设定已导入。JSON不包含图片、视频和音频文件，请在本机重新上传素材。':'原项目保持不变。'});
  } catch(error) { dialog.showErrorBox('导入失败',error.message); }
}
function menu() {
  if(!authState().authorized){Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'登录',submenu:[{role:'quit',label:'退出软件'}]},{label:'编辑',submenu:[{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'}]}]));return;}
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'工作台',submenu:[
      {label:'导入项目JSON（文字与设定）',click:importProject},
      {label:'打开本地数据目录',click:()=>{void authorized().then(()=>shell.openPath(dataDir)).catch(()=>{});}},
      {label:'系统设置 · 文件位置',click:()=>{void authorized().then(()=>window?.webContents.send('director:open-settings')).catch(()=>{});}},
      {type:'separator'}, {role:'quit',label:'退出'},
    ]},
    {label:'编辑',submenu:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]},
    {label:'视图',submenu:[{role:'reload',label:'刷新工作台'},{role:'resetZoom',label:'实际大小'},{role:'zoomIn',label:'放大'},{role:'zoomOut',label:'缩小'},{role:'togglefullscreen',label:'全屏'},{role:'toggleDevTools',label:'开发者工具'}]},
    {label:'帮助',submenu:[
      {label:'打开使用说明',click:()=>shell.openPath(path.join(__dirname,'使用说明.txt'))},
      {label:'打开日志',click:()=>shell.openPath(logPath)},
      {label:'关于桌面测试版',click:()=>dialog.showMessageBox(window,{type:'info',message:`AI短片导演 · 桌面测试版 ${app.getVersion()}`,detail:'本地工作台、本地数据库与素材存储。支持文本、图片、视频和声音服务配置；豆包 Chrome 插件支持任务导入与结果包回传。'})},
    ]},
  ]));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.whenReady().then(async()=>{
    await configureChrome(path.join(userRoot,'chrome-path.json')).catch(error=>log(error.message));
    const trusted=(event)=>{if(!window || event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame || !origin || new URL(event.senderFrame.url).origin!==origin)throw Error('请从本地工作台操作豆包插件');};
    ipcMain.handle('director:admin',async(event,action,input)=>{try{trusted(event);return {data:await adminCommand(auth,authorized,action,input)};}catch(error){return {error:error.message};}});
    ipcMain.handle('director:auth',async(event,action,input)=>{
      trusted(event);
      try {
        if(action==='state'){if(auth.token)await auth.authorize().catch(()=>{});const state=authState();return {...state,completedResults:state.authorized?(await fs.readdir(path.join(dataDir,'completed-results')).catch(()=>[])).length:0};}
        if(action==='credentials-load')return rememberedLogin.read();
        if(action==='credentials-clear'){await rememberedLogin.clear();return {ok:true};}
        if(action==='login'){
          await auth.login(input?.account,input?.key,boundUserId||undefined);
          try{if(input?.remember)await rememberedLogin.save(input.account,input.key);else await rememberedLogin.clear();}
          catch{await auth.logout();throw Error('REMEMBER_FAILED');}
          if(!workspaceReady)await activateWorkspace();
          return authState();
        }
        if(action==='logout'){
          if(activeRequests||exportingDraft||doubaoManager?.state.jobs.some(j=>['prepared','submitted','downloading'].includes(j.status)))throw Error('TASKS_ACTIVE');
          await auth.logout();return authState();
        }
        if(action==='restart'){
          if(activeRequests||exportingDraft||doubaoManager?.state.jobs.some(j=>['prepared','submitted','downloading'].includes(j.status)))throw Error('TASKS_ACTIVE');
          await auth.logout();app.relaunch();app.quit();return {authorized:false};
        }
        if(action==='recovery-write'){
          if(!boundUserId||!workspaceReady)throw Error('UNAUTHENTICATED');
          const body=JSON.stringify(input);if(body.length>8_000_000)throw Error('RECOVERY_TOO_LARGE');
          const target=path.join(accountRoot,'recovery.json');
          const write=recoveryWrites.then(async()=>{await fs.writeFile(target+'.tmp',body,{mode:0o600});await fs.rename(target+'.tmp',target);});recoveryWrites=write.catch(()=>{});await write;return {ok:true};
        }
        if(action==='open-results'){await authorized();await fs.mkdir(path.join(dataDir,'completed-results'),{recursive:true});await shell.openPath(path.join(dataDir,'completed-results'));return {ok:true};}
        if(action==='recovery-read'){await authorized();await recoveryWrites;try{return JSON.parse(await fs.readFile(path.join(accountRoot,'recovery.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
        throw Error('INVALID_ACTION');
      }catch(error){return {...authState(),error:error.message};}
    });
    ipcMain.handle('director:version',event=>{trusted(event);return app.getVersion();});
    const canInstall=process.platform==='win32' && app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE && require('node:fs').existsSync(path.join(process.resourcesPath,'app-update.yml'));
    const nativeUpdater=canInstall ? new (require('electron-updater').NsisUpdater)({provider:'generic',url:UPDATE_BASE}) : undefined;
    softwareUpdate=new SoftwareUpdate({
      version:app.getVersion(),canInstall,platform:process.platform,arch:process.arch,openDownload:url=>shell.openExternal(url),updater:nativeUpdater,
      requestInstall:async()=>{
        if(exportingDraft)throw Error('剪映草稿正在导出，请完成后再安装');
        const active=!!doubaoManager?.state.jobs.some(j=>['queued','prepared','submitted','downloading'].includes(j.status));
        if(active){
          const answer=await dialog.showMessageBox(window,{type:'question',message:'豆包任务尚未结束，安装更新将暂时停止本机追踪。',detail:'建议等待任务完成后再安装。已保存的任务记录会保留。',buttons:['稍后安装','继续安装'],defaultId:0,cancelId:0});
          if(answer.response!==1){softwareUpdate.cancelInstall();return;}
        }
        pendingUpdateInstall=true;app.quit();
      },onInstallError:recoverUpdateInstall,
    });
    softwareUpdate.on('state',state=>{if(window && !window.isDestroyed())window.webContents.send('director:update-state',state);});
    ipcMain.handle('director:updates',async(event,action)=>{
      trusted(event);await authorized();
      if(action==='get')return softwareUpdate.snapshot();
      if(action==='check')return softwareUpdate.check();
      if(action==='install')return softwareUpdate.downloadAndInstall();
      throw Error('未知的软件更新操作');
    });

    ipcMain.handle('director:directories',async(event,action,input)=>{
      trusted(event);await authorized();
      if(action==='get')return directories.value;
      if(action==='save')return directories.save(input);
      if(action==='choose'){
        const key=input?.key;if(!['workspaceDir','jianyingDraftDir'].includes(key))throw Error('目录类型不正确');
        const result=await dialog.showOpenDialog(window,{title:key==='workspaceDir'?'选择项目文件目录':'选择剪映草稿目录',defaultPath:directories.value[key],properties:['openDirectory','createDirectory']});
        return {path:result.canceled?null:result.filePaths[0]};
      }
      throw Error('不支持的设置操作');
    });
    ipcMain.handle('director:export-jianying',async(event,input)=>{
      trusted(event);await authorized();if(exportingDraft)throw Error('正在导出剪映草稿，请等待完成');
      exportingDraft=true;
      try{const result=await exportJianying(input,{draftDir:directories.value.jianyingDraftDir,origin,token});await shell.openPath(result.path);return result;}
      finally{exportingDraft=false;}
    });
    ipcMain.handle('director:open-doubao',async(event)=>{trusted(event);await authorized();return openChrome();});
    ipcMain.handle('director:doubao',async(event,action,data)=>{trusted(event);await authorized();if(!doubaoManager)throw Error('豆包管理服务尚未启动');if(action==='chrome-select'){
      const picked=await dialog.showOpenDialog(window,{title:'选择 Google Chrome',properties:['openFile'],...(process.platform==='win32'?{filters:[{name:'Chrome 程序',extensions:['exe']}]}:{})});
      if(!picked.canceled&&picked.filePaths[0]){let file=picked.filePaths[0];if(process.platform==='darwin'&&file.endsWith('.app'))file=path.join(file,'Contents','MacOS','Google Chrome');await saveChromePath(file);}
      return doubaoManager.snapshot();
    }
    if(action==='chrome-auto'){await saveChromePath('');return doubaoManager.snapshot();}
    return doubaoManager.command(action,data);});
    ipcMain.handle('director:open-doubao-extension',async(event)=>{trusted(event);await authorized();const error=await shell.openPath(path.join(accountRoot,'doubao-extension'));if(error)throw Error(error);return {ok:true};});
    ipcMain.handle('director:reveal-image', async (event, input) => {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !origin || new URL(event.senderFrame.url).origin !== origin)
        throw Error('请从本地工作台打开图片目录');
      await authorized();
      const filename = await exportImage(input, {picturesDir: path.join(app.getPath('pictures'),boundUserId), origin, token});
      shell.showItemInFolder(filename);
      return {ok: true};
    });
    ipcMain.handle('director:reveal-video', async (event, input) => {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !origin || new URL(event.senderFrame.url).origin !== origin)
        throw Error('请从本地工作台打开视频目录');
      await authorized();
      const {filename} = await exportVideo(input, {videosDir: path.join(app.getPath('videos'),boundUserId), origin, token, journal:{begin:(event,details)=>usageCommand('file-begin',{event,details}),complete:(eventId,created)=>usageCommand('file-complete',{eventId,created})}});
      shell.showItemInFolder(filename);
      return {ok: true};
    });
    await log(`Desktop started. Version=${app.getVersion()} PID=${process.pid}`);
    window = new BrowserWindow({width:1500,height:960,minWidth:1024,minHeight:700,show:!smoke,
      title:'AI短片导演 · 本地测试版',backgroundColor:'#f4f7fd',icon:path.join(__dirname,'icon.ico'),
      webPreferences:{backgroundThrottling:false,preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,partition:'persist:director-desktop'},
    });
    attachCloseGuard(window, {dialog, log,onCancelClose:()=>{if(pendingUpdateInstall){pendingUpdateInstall=false;softwareUpdate.cancelInstall();}}});
    window.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
    window.webContents.on('will-navigate',(event,url)=>{if(origin && new URL(url).origin!==origin)event.preventDefault();});
    window.webContents.on('page-title-updated',event=>event.preventDefault());
    const ses=window.webContents.session;
    ses.setPermissionRequestHandler((webContents,permission,callback)=>callback(
      permission==='clipboard-sanitized-write' && !!origin && webContents.getURL().startsWith(origin+'/')
    ));
    await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<meta charset="utf-8"><title>启动中</title><body style="font:18px system-ui;background:#f4f7fd;color:#173568;display:grid;place-content:center;height:90vh"><h1>AI短片导演</h1><p>正在打开登录页面…</p></body>'));
    try {
      await directories.load();
      try{await directories.applyPending();}catch(error){await log('Workspace migration stopped: '+error.message);if(!smoke)await dialog.showMessageBox(window,{type:'warning',message:'项目目录迁移未完成，将继续使用原目录',detail:error.message});}
      dataDir=directories.value.workspaceDir;
      origin=await startBackend();
      if(shuttingDown || window.isDestroyed()) return;
      await ses.cookies.set({url:origin,name:'director_session',value:token,httpOnly:true,sameSite:'strict',path:'/'});
      menu();
      await window.loadURL(origin);
      window.setTitle(`AI短片导演 · v${app.getVersion()}`);
      await log('Local workspace ready.');
      if (smoke) {
        await new Promise(resolve=>setTimeout(resolve,1800));
        const result=await window.webContents.executeJavaScript(`(async()=>({title:document.title,text:document.body.innerText.slice(0,3000),projects:(await fetch('/api/projects')).status,nodeAccess:typeof window.require,imageDirectoryBridge:typeof window.directorDesktop?.revealImage}))()`);
        await fs.writeFile(path.join(app.getPath('userData'),'smoke-result.json'),JSON.stringify(result,null,2));
        if(process.env.DIRECTOR_DIRECTORY_SMOKE==='1'){
          window.webContents.send('director:open-settings');
          const checks=await window.webContents.executeJavaScript(require('./test-directory-ui.cjs'));
          await fs.writeFile(path.join(app.getPath('userData'),'directory-ui-result.json'),JSON.stringify(checks,null,2));
        }
        if (process.env.DIRECTOR_NAV_SMOKE === '1') {
          const navigation = await window.webContents.executeJavaScript(require('./test-navigation.cjs'));
          await fs.writeFile(path.join(app.getPath('userData'),'navigation-result.json'),JSON.stringify(navigation,null,2));
        }
        await fs.writeFile(path.join(app.getPath('userData'),'smoke.png'),(await window.webContents.capturePage()).toPNG());
        window.destroy();
        app.quit();
      }
    } catch(error) {
      if(shuttingDown || window.isDestroyed()) return;
      await log('Startup failed: '+error.message);
      if(smoke) await fs.writeFile(path.join(app.getPath('userData'),'smoke-error.txt'),error.stack || error.message);
      else dialog.showErrorBox('桌面工作台启动失败',error.message+'\n日志位置：'+logPath);
      app.quit();
    }
  });
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>{void log('Application quit requested; checking windows first.');});
  app.on('will-quit',event=>{
    if(updateInstallHandoff)return;
    event.preventDefault(); shuttingDown=true;
    void shutdown();
  });
}
