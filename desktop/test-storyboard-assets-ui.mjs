import { createRequire } from 'node:module';
import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const stage = path.resolve(
  process.env.DIRECTOR_ACCESS_STAGE ||
    'desktop/test-results/workspace-adjust-preview',
);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-workspace-adjust-ui-'));
app.setPath('userData', root);
await fs.mkdir(path.join(root,'pictures'));app.setPath('pictures',path.join(root,'pictures'));
let pickedFile;dialog.showOpenDialog=async options=>pickedFile?{canceled:false,filePaths:[pickedFile]}:{canceled:true,filePaths:[]};
const mod = require(path.join(stage, 'access-session.cjs')),
  Original = mod.AccessSession;
let denied = '',
  offline = false;
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  account: 'test-member',
  role: 'member',
  expires_at: Date.now() + 600000,
};
mod.AccessSession = class extends Original {
  constructor(options) {
    super({
      ...options,
      request: async () => {
        if (offline) throw Error('offline');
        return Response.json(
          denied
            ? { error: { code: denied } }
            : {
                token: 'test-session',
                user,
                server_time: Date.now(),
                session_expires_at: Date.now() + 600000,
              },
          { status: denied ? 403 : 200 },
        );
      },
    });
  }
};
dialog.showMessageBox = async () => ({ response: 0 });
dialog.showMessageBoxSync = () => 1;
const updates = require(path.join(stage, 'software-update.cjs'));
const OriginalUpdate = updates.SoftwareUpdate;
let updateDownload = '';
updates.SoftwareUpdate = class extends OriginalUpdate {
  constructor(options) { super({...options, version:'0.1.72', platform:'darwin', arch:'arm64',
    fetch:async url=>{assert.equal(url,'https://121.199.40.214/updates/mac/release.json');return Response.json({version:'9.0.0',platform:'darwin',architectures:['arm64','x64'],releaseNotes:'Mac update fixture'});},
    openDownload:async url=>{updateDownload=url;},
  }); }
};
require(path.join(stage, 'main.cjs'));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => {
  console.error('UI test timeout');
  app.exit(1);
}, 70000).unref();
void app.whenReady().then(async () => {
  let win;
  try {
    for (let i = 0; i < 200; i++) {
      win = BrowserWindow.getAllWindows()[0];
      if (
        win &&
        (await win.webContents
          .executeJavaScript("!!document.querySelector('.access-card')")
          .catch(() => false))
      )
        break;
      await delay(100);
    }
    assert(win);
    const js = (code) => win.webContents.executeJavaScript(code);
    async function wait(selector) {
      for (let i = 0; i < 200; i++) {
        if (
          await js(
            `!!document.querySelector(${JSON.stringify(selector)})`,
          ).catch(() => false)
        )
          return;
        await delay(100);
      }
      throw Error('Missing ' + selector);
    }
    await wait('#access-account');
    assert.equal(await js("!!document.querySelector('.topbar')"), false);
    assert.equal(await js("fetch('/api/projects').then(r=>r.status)"), 401);
    assert.equal(
      await js(
        "window.directorDesktop.directories('get').then(()=>false,()=>true)",
      ),
      true,
    );
    await fs.writeFile(
      path.join(root, 'login-light.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js("document.querySelector('.theme-toggle').click()");
    await delay(150);
    await fs.writeFile(
      path.join(root, 'login-dark.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js(
      `(()=>{for(const [id,value] of [['access-account','test-member'],['access-key','Test-key-2026']]){const input=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}})()`,
    );
    await delay(100);
    await js("document.querySelector('.access-remember input').click()");
    await js("document.querySelector('.access-card form').requestSubmit()");
    await wait('.topbar');
    assert.equal(
      await js(
        "document.querySelector('.access-profile').textContent.includes('test-member')",
      ),
      true,
    );
    assert.equal(await js("fetch('/api/projects').then(r=>r.status)"), 200);

    await delay(500);
    const {exampleProject}=await import('../work/test/studio.mjs');
    const p=exampleProject();p.title='Asset UI test';
    const role=p.assets.find(a=>a.kind==='人物');
    for(let i=0;i<15;i++)p.assets.push({...role,id:crypto.randomUUID(),name:'角色'+i});
    const saved=await js(`fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(p)})}).then(r=>r.json())`);
    await js(`window.directorDesktop.auth('recovery-write',${JSON.stringify({project:saved,dirty:false})})`);
    win.webContents.reload();await delay(1800);await wait('.topbar');
    const media={id:crypto.randomUUID(),name:'test.png',type:'image/png',url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZb0AAAAASUVORK5CYII='};
    const job={id:crypto.randomUUID(),projectId:p.id,targetId:role.id,target:'asset',status:'succeeded',createdAt:new Date().toISOString(),model:'test',prompt:'test',media};
    await js(`window.testJobs=${JSON.stringify([job])};window.originalFetch=window.fetch;window.fetch=(url,opts)=>String(url).startsWith('/api/generations?')?Promise.resolve(Response.json(window.testJobs)):window.originalFetch(url,opts);void 0`);
    const click=async text=>{console.log('CLICK',text);assert(await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`),'missing '+text);await delay(250)};
    await click('创作工作台');await wait('.sheet-toolbar');await delay(3300);await click('角色管理');await wait('.project-assets-scroll');
    assert(await js("[...document.querySelectorAll('.project-assets-scroll label')].find(x=>x.textContent.includes('三视图')).querySelector('[role=checkbox]').getAttribute('aria-checked')==='true'"));
    assert(await js("document.querySelector('.project-assets-toolbar').textContent.includes('角色三视图生图')"));
    assert(await js("(()=>{const c=document.querySelector('.project-assets-scroll'),h=c.querySelector('th');c.scrollTop=300;return getComputedStyle(h).position==='sticky'})()"));
    await js("document.querySelector('.project-assets-scroll').scrollTop=0");
    await click('预览');await wait('.asset-result-dialog');await click('确认应用图片');
    assert.equal(await js("document.querySelectorAll('.asset-returned-image').length"),0);
    await js("(()=>{const row=document.querySelector('.project-assets-scroll tbody tr');const imageCell=row.children[5];[...imageCell.querySelectorAll('button')].find(b=>b.textContent.trim()==='清除').click()})()");await delay(250);
    assert.equal(await js("document.querySelector('.project-assets-scroll tbody tr').children[5].querySelectorAll('img').length"),0);
    await js(`window.testJobs=[{...window.testJobs[0],id:crypto.randomUUID(),createdAt:new Date(Date.now()+1000).toISOString(),media:{...window.testJobs[0].media,id:crypto.randomUUID()}}]`);await delay(3500);
    await click('应用');assert.equal(await js("!!document.querySelector('.asset-result-dialog')"),false);
    await js(`window.testJobs=[{...window.testJobs[0],id:crypto.randomUUID(),createdAt:new Date(Date.now()+2000).toISOString(),media:{...window.testJobs[0].media,id:crypto.randomUUID()}}]`);await delay(3500);
    await click('替换');assert.equal(await js("!!document.querySelector('.asset-result-dialog')"),false);
    await js("[...document.querySelectorAll('.project-assets-scroll label')].find(x=>x.textContent.includes('三视图')).querySelector('[role=checkbox]').click()");await delay(250);
    assert(await js("[...document.querySelectorAll('.project-assets-scroll label')].find(x=>x.textContent.includes('三视图')).querySelector('[role=checkbox]').getAttribute('aria-checked')==='false'"));
    await js("(()=>{const cell=document.querySelector('.project-assets-scroll tbody tr').children[5];[...cell.querySelectorAll('button')].find(b=>b.textContent.trim()==='清除').click()})()");await delay(250);
    const expectedFolder=path.join(await fs.realpath(root),'pictures',user.id,'AI短片导演',p.id);
    dialog.showOpenDialog=async(_window,options)=>{
      assert.equal(options.defaultPath,expectedFolder);
      return pickedFile?{canceled:false,filePaths:[pickedFile]}:{canceled:true,filePaths:[]};
    };
    await click('图片目录');
    assert.equal(await js("!!document.querySelector('.image-directory-dialog')"),false);
    assert.equal(await js("document.querySelector('.project-assets-scroll tbody tr').children[5].querySelectorAll('img').length"),0);
    pickedFile=path.join(root,'previous.png');await fs.writeFile(pickedFile,Buffer.from(media.url.split(',')[1],'base64'));
    await click('图片目录');await delay(500);
    assert.equal(await js("document.querySelector('.project-assets-scroll tbody tr').children[5].querySelectorAll('img').length"),1);
    const beforePick=await js("document.querySelector('.project-assets-scroll tbody tr').children[5].querySelector('img').getAttribute('src')");
    pickedFile=null;await click('图片目录');await delay(250);
    assert.equal(await js("document.querySelector('.project-assets-scroll tbody tr').children[5].querySelector('img').getAttribute('src')"),beforePick);
    console.log('PASS native dialog exact project directory, selected file application, cancellation, no custom directory UI.');
    await fs.writeFile(path.join(root,'asset-manager.png'),(await win.webContents.capturePage()).toPNG());
    console.log('PASS desktop defaults, sticky table header, preview/apply, clear, new result direct apply and replace; no provider calls. '+root);app.exit(0);
  } catch(e){console.error(e);if(win){console.error(await win.webContents.executeJavaScript('document.body.innerText').catch(()=>''));}app.exit(1);}
});
