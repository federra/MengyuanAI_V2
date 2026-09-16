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
    await js("document.querySelector('.access-card form').requestSubmit()");
    await wait('.topbar');
    assert.equal(
      await js(
        "document.querySelector('.access-profile').textContent.includes('test-member')",
      ),
      true,
    );
    assert.equal(await js("fetch('/api/projects').then(r=>r.status)"), 200);
    await delay(600);
    const click = async (text) => {
      await js(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('Missing button '+${JSON.stringify(text)});button.click();})()`);
      await delay(250);
    };
    await js("[...document.querySelectorAll('.workflow button')].find(b=>b.textContent.includes('故事')).click()");
    await wait('.creative-story-footer');
    assert.equal(await js("getComputedStyle(document.querySelector('.creative-story-footer')).justifyContent"),'space-between');
    await js("document.querySelector('.creative-story-footer').scrollIntoView({block:'end'})");await delay(400);
    await fs.writeFile(path.join(root,'story-footer.png'),(await win.webContents.capturePage()).toPNG());
    await js("[...document.querySelectorAll('[data-sidebar=menu-button]')].find(b=>b.textContent.trim()==='Skill 中心').click()");
    await wait('button[aria-label^="下载技能："]');
    const downloads=[];
    win.webContents.session.on('will-download',(_event,item)=>{
      const file=path.join(root,item.getFilename());item.setSavePath(file);
      item.once('done',(_e,status)=>downloads.push({file,status}));
    });
    for(const format of ['json','txt','md','zip']) {
      await js(`document.querySelector('button[aria-label^="下载技能："]').click()`);
      await wait('select[aria-label="Skill 下载格式"]');
      await js(`(()=>{const select=document.querySelector('select[aria-label="Skill 下载格式"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(format)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await delay(150);
      if(format==='zip')await fs.writeFile(path.join(root,'skill-download.png'),(await win.webContents.capturePage()).toPNG());
      await click('下载');
      for(let i=0;i<100&&downloads.length<['json','txt','md','zip'].indexOf(format)+1;i++)await delay(50);
      assert.equal(downloads.at(-1)?.status,'completed');assert(downloads.at(-1).file.endsWith('.'+format));
    }
    const encoded=(await fs.readFile(downloads.at(-1).file)).toString('base64');
    await js(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(encoded)}),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'skill-roundtrip.zip',{type:'application/zip'}));const input=document.querySelector('input[type=file][accept*=zip]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait('[role=dialog]');
    for(let i=0;i<100;i++){if(await js("document.body.innerText.includes('质检完成')"))break;await delay(100);}
    assert.equal(await js("document.body.innerText.includes('质检完成')"),true);
    await fs.writeFile(path.join(root,'skill-import-light.png'),(await win.webContents.capturePage()).toPNG());
    await js("document.querySelector('.theme-toggle').click()");await delay(150);
    await fs.writeFile(path.join(root,'skill-import-dark.png'),(await win.webContents.capturePage()).toPNG());
    await click('取消');
    await js("[...document.querySelectorAll('[data-sidebar=menu-button]')].find(b=>b.textContent.trim()==='系统设置').click()");
    await wait('.software-update');
    await js("[...document.querySelectorAll('.software-update button')].find(b=>b.textContent.trim()==='检查更新').click()");
    for(let i=0;i<100;i++){if(await js("document.querySelector('[data-update-available]')?.textContent==='v9.0.0'"))break;await delay(100);}
    for(let i=0;i<100;i++){if(await js("[...document.querySelectorAll('.software-update button')].some(b=>b.textContent.trim()==='下载 Mac 更新包'&&!b.disabled)"))break;await delay(50);}
    await click('下载 Mac 更新包');
    for(let i=0;i<100&&!updateDownload;i++)await delay(50);
    if(!updateDownload)console.error(await js("document.querySelector('.software-update').innerText"));
    assert.equal(updateDownload,'https://121.199.40.214/updates/mac/MengyuanAI-9.0.0-arm64.zip');
    await fs.writeFile(path.join(root,'mac-update.png'),(await win.webContents.capturePage()).toPNG());
    console.log('PASS Mac update UI opens the architecture-specific package with manual installation.');
    console.log('PASS story footer split left/right, four real downloads, ZIP import through actual API without model; screenshots: '+root);
    win.destroy();app.quit();
  } catch(error) {console.error(error);app.exit(1);}
});
