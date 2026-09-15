const {app, BrowserWindow, Menu, dialog, shell, session, safeStorage, ipcMain, Notification} = require('electron');
const {exportImage} = require('./image-files.cjs');
const {exportVideo} = require('./video-files.cjs');
const {exportJianying} = require('./jianying-export.cjs');
const {DirectorySettings} = require('./directory-settings.cjs');
const {openChrome} = require('./doubao-chrome.cjs');
const {DoubaoManager} = require('./doubao-manager.cjs');
const {attachCloseGuard} = require('./close-window.cjs');
const {createShutdown} = require('./shutdown.cjs');
const {fork} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
app.setName('AI Director Desktop');
const smoke = process.argv.includes('--smoke-test');
const smokeDir = process.env.DIRECTOR_SMOKE_DIR;
if (smoke && smokeDir) app.setPath('userData',path.resolve(smokeDir));
let window, backend, origin, token, doubaoManager, shuttingDown = false;
let dataDir = path.join(app.getPath('userData'),'workspace');
const directories = new DirectorySettings(app.getPath('userData'),process.env.LOCALAPPDATA || path.join(app.getPath('home'),'AppData','Local'));
let exportingDraft = false;
const logPath = path.join(app.getPath('userData'),'desktop.log');
async function log(message) {
  await fs.mkdir(app.getPath('userData'),{recursive:true});
  // Diagnostic events only. API credentials are never logged.
  await fs.appendFile(logPath, `${new Date().toISOString()} ${message}\n`).catch(()=>{});
}
const shutdown = createShutdown({getBackend:()=>backend, stopHelper:()=>doubaoManager?.stop(), log, exit:code=>app.exit(code)});
async function encryptionKey() {
  if (!safeStorage.isEncryptionAvailable()) throw Error('Windows密钥保护不可用，无法安全保存模型配置。');
  const filename = path.join(app.getPath('userData'),'model-key.bin');
  try { return safeStorage.decryptString(await fs.readFile(filename)); }
  catch(error) {
    if (error.code !== 'ENOENT') throw Error('无法读取本机加密密钥，请保留数据目录并检查Windows账户是否变更。');
    const key = crypto.randomBytes(32).toString('base64');
    await fs.writeFile(filename,safeStorage.encryptString(key),{flag:'wx'});
    return key;
  }
}
async function startBackend() {
  token = crypto.randomBytes(32).toString('hex');
  const key = await encryptionKey();
  backend = fork(path.join(__dirname,'backend.mjs'),[],{
    execPath:process.execPath, env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},
    stdio:['ignore','pipe','pipe','ipc'], windowsHide:true,
  });
  backend.stdout.on('data',()=>{});
  backend.stderr.on('data',()=>log('Local worker emitted a diagnostic; see startup error if loading fails.'));
  backend.on('exit',(code)=>{
    log(`Local backend exited (${code}).`);
    if (!shuttingDown && origin && !smoke) {
      dialog.showErrorBox('本地服务已停止','请重新启动桌面版。已经保存的项目仍在本地数据目录中。');
      app.quit();
    }
  });
  return new Promise((resolve,reject)=>{
    const timeout = setTimeout(()=>reject(Error('本地服务启动超时，请查看“帮助 → 打开日志”。')),60000);
    backend.once('error',error=>{clearTimeout(timeout);reject(error);});
    backend.once('exit',()=>{clearTimeout(timeout);reject(Error('本地服务未能启动。'));});
    backend.on('message',message=>{
      if (message.type === 'error') {clearTimeout(timeout);reject(Error(message.message));}
      if (message.type === 'ready') {clearTimeout(timeout);resolve(message.url);}
    });
    backend.send({type:'start',dataDir,encryptionKey:key,token});
  });
}
async function importProject() {
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
    const response = await fetch(origin+'/api/projects',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:`director_session=${token}`},body:JSON.stringify(project)});
    const body = await response.json();
    if (!response.ok) throw Error(body.error || '项目导入失败');
    window.webContents.reload();
    await dialog.showMessageBox(window,{type:'info',title:'项目已导入',message:'已作为新项目保存到本机。',detail:mediaCount?'文字、分镜、Skill与资产设定已导入。JSON不包含图片、视频和音频文件，请在本机重新上传素材。':'原项目保持不变。'});
  } catch(error) { dialog.showErrorBox('导入失败',error.message); }
}
function menu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'工作台',submenu:[
      {label:'导入项目JSON（文字与设定）',click:importProject},
      {label:'打开本地数据目录',click:()=>shell.openPath(dataDir)},
      {label:'系统设置 · 文件位置',click:()=>window?.webContents.send('director:open-settings')},
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
    const trusted=(event)=>{if(!window || event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame || !origin || new URL(event.senderFrame.url).origin!==origin)throw Error('请从本地工作台操作豆包插件');};
    ipcMain.handle('director:version',event=>{trusted(event);return app.getVersion();});
    ipcMain.handle('director:directories',async(event,action,input)=>{
      trusted(event);
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
      trusted(event);if(exportingDraft)throw Error('正在导出剪映草稿，请等待完成');
      exportingDraft=true;
      try{const result=await exportJianying(input,{draftDir:directories.value.jianyingDraftDir,origin,token});await shell.openPath(result.path);return result;}
      finally{exportingDraft=false;}
    });
    ipcMain.handle('director:open-doubao',async(event)=>{trusted(event);return openChrome();});
    ipcMain.handle('director:doubao',async(event,action,data)=>{trusted(event);if(!doubaoManager)throw Error('豆包管理服务尚未启动');return doubaoManager.command(action,data);});
    ipcMain.handle('director:open-doubao-extension',async(event)=>{trusted(event);const error=await shell.openPath(path.join(app.getPath('userData'),'doubao-extension'));if(error)throw Error(error);return {ok:true};});
    ipcMain.handle('director:reveal-image', async (event, input) => {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !origin || new URL(event.senderFrame.url).origin !== origin)
        throw Error('请从本地工作台打开图片目录');
      const filename = await exportImage(input, {picturesDir: app.getPath('pictures'), origin, token});
      shell.showItemInFolder(filename);
      return {ok: true};
    });
    ipcMain.handle('director:reveal-video', async (event, input) => {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !origin || new URL(event.senderFrame.url).origin !== origin)
        throw Error('请从本地工作台打开视频目录');
      const filename = await exportVideo(input, {videosDir: app.getPath('videos'), origin, token});
      shell.showItemInFolder(filename);
      return {ok: true};
    });
    await log(`Desktop started. Version=${app.getVersion()} PID=${process.pid}`);
    window = new BrowserWindow({width:1500,height:960,minWidth:1024,minHeight:700,show:!smoke,
      title:'AI短片导演 · 本地测试版',backgroundColor:'#f4f7fd',icon:path.join(__dirname,'icon.ico'),
      webPreferences:{backgroundThrottling:false,preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,partition:'persist:director-desktop'},
    });
    attachCloseGuard(window, {dialog, log});
    window.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
    window.webContents.on('will-navigate',(event,url)=>{if(origin && new URL(url).origin!==origin)event.preventDefault();});
    window.webContents.on('page-title-updated',event=>event.preventDefault());
    const ses=window.webContents.session;
    ses.setPermissionRequestHandler((webContents,permission,callback)=>callback(
      permission==='clipboard-sanitized-write' && !!origin && webContents.getURL().startsWith(origin+'/')
    ));
    await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<meta charset="utf-8"><title>启动中</title><body style="font:18px system-ui;background:#f4f7fd;color:#173568;display:grid;place-content:center;height:90vh"><h1>AI短片导演</h1><p>正在启动本地工作台与数据库…</p></body>'));
    try {
      await directories.load();
      try{await directories.applyPending();}catch(error){await log('Workspace migration stopped: '+error.message);if(!smoke)await dialog.showMessageBox(window,{type:'warning',message:'项目目录迁移未完成，将继续使用原目录',detail:error.message});}
      dataDir=directories.value.workspaceDir;
      origin=await startBackend();
      if(shuttingDown || window.isDestroyed()) return;
      await fs.cp(path.join(__dirname,'doubao-extension'),path.join(app.getPath('userData'),'doubao-extension'),{recursive:true});
      doubaoManager = await new DoubaoManager({root:path.join(app.getPath('userData'),'doubao-data'),backend:()=>({origin,token}),log,notify:(job)=>{
        if(Notification.isSupported())new Notification({title:job.status==='succeeded'?'豆包视频已完成':'豆包任务需要处理',body:`${job.title}：${job.status==='succeeded'?'已下载，可返回原分镜':job.error}`}).show();
      }}).start();
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
    event.preventDefault(); shuttingDown=true;
    void shutdown();
  });
}
