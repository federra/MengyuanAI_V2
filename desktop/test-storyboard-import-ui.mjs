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
    const original=JSON.parse(await fs.readFile(process.env.DIRECTOR_IMPORT_SOURCE,'utf8'));
    const click=async text=>{assert(await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)return false;b.click();return true})()`),'missing '+text);await delay(250);};
    await click('创作工作台');await wait('.sheet-toolbar');await click('导入分镜 JSON');
    await wait('.director-dialog textarea');
    await js(`(()=>{const el=document.querySelector('.director-dialog textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(JSON.stringify(original))});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await delay(150);await click('检查并预览导入');
    for(let i=0;i<100;i++){if(await js("document.querySelector('.director-dialog').textContent.includes('确认应用导入')"))break;await delay(100);}
    const content=await js("document.querySelector('.director-dialog').textContent");assert(content.includes('6 个分镜通过校验'));assert(content.includes('60 秒'));
    await fs.writeFile(path.join(root,'import-preview.png'),(await win.webContents.capturePage()).toPNG());
    await click('确认应用导入');
    assert.equal(await js("!!document.querySelector('.director-dialog')"),false);
    console.log('PASS real desktop import UI: provided JSON previewed as 6 segments / 60 seconds and applied without configured AI model. '+root);
    app.exit(0);
  } catch(e){console.error(e);if(win){console.error(await win.webContents.executeJavaScript('document.body.innerText').catch(()=>''));}app.exit(1);}
});
