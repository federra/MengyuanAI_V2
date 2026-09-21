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
    await delay(600);
    const click = async text=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('missing '+${JSON.stringify(text)});b.click();})()`);await delay(300);};
    const stored=await js("window.directorDesktop.auth('credentials-load')");
    assert.equal(stored.account,'test-member');assert.equal(stored.key,'Test-key-2026');
    assert(!(await fs.readFile(path.join(root,'remembered-login.enc'))).includes(Buffer.from('Test-key-2026')));
    await js("window.directorDesktop.auth('credentials-clear')");assert.equal((await js("window.directorDesktop.auth('credentials-load')")).account,undefined);
    await js("document.querySelector('[data-sidebar=trigger]').click()");await delay(350);
    assert.equal(await js("!!document.querySelector('[data-collapsible=icon]')"),true);
    assert.equal(await js("getComputedStyle(document.querySelector('[data-sidebar=menu-button] > span')).display"),'none');
    const bounds=await js("(()=>{const r=document.querySelector('[aria-label=\"模型设置\"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()");
    win.focus();win.webContents.focus();win.webContents.sendInputEvent({type:'mouseMove',x:2,y:2});await delay(100);
    win.webContents.sendInputEvent({type:'mouseMove',...bounds});await delay(500);
    await js("(()=>{const el=document.querySelector('[aria-label=\"模型设置\"]');el.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));})()");await delay(1200);
    await fs.writeFile(path.join(root,'tooltip-check.png'),(await win.webContents.capturePage()).toPNG());
    console.log('Tooltip:',await js("[...document.querySelectorAll('[data-slot=tooltip-content]')].map(t=>({text:t.textContent,role:t.getAttribute('role')}))"));
    assert.equal(await js("[...document.querySelectorAll('[data-slot=tooltip-content]')].some(t=>t.textContent.includes('模型设置')&&t.getBoundingClientRect().width>0)"),true);
    await fs.writeFile(path.join(root,'sidebar-collapsed.png'),(await win.webContents.capturePage()).toPNG());
    await js("document.querySelector('[data-sidebar=trigger]').click()");await delay(350);
    await click('模型设置');await wait('.model-kind-tabs');await delay(400);
    assert.equal(await js("document.querySelectorAll('.model-kind-tabs [role=tab]').length"),4);
    await js("document.querySelector('.model-config-disclosure > summary').click()");await delay(100);
    await js("(()=>{const el=document.querySelector('.model-config-disclosure[open] input[type=url]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'https://example.com/v1');el.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await js("document.getElementById('model-tab-image').click()");await delay(100);
    await js("document.getElementById('model-tab-text').click()");await delay(100);
    assert.equal(await js("document.querySelector('.model-config-disclosure[open] input[type=url]').value"),'https://example.com/v1');
    await fs.writeFile(path.join(root,'models-expanded.png'),(await win.webContents.capturePage()).toPNG());
    await js("document.querySelector('.model-config-disclosure > summary').click()");await delay(150);
    await fs.writeFile(path.join(root,'models-compact.png'),(await win.webContents.capturePage()).toPNG());
    await js("document.querySelector('.theme-toggle').click()");await delay(200);
    await fs.writeFile(path.join(root,'models-light.png'),(await win.webContents.capturePage()).toPNG());
    await click('创作工作台');await js("[...document.querySelectorAll('.workflow button')].find(b=>b.textContent.includes('分镜')).click()");await wait('.sheet-head-sticky');
    await js("document.querySelector('.sheet-head-sticky').scrollIntoView({block:'start'})");await delay(100);
    const before=await js("document.querySelector('.sheet-head-sticky').getBoundingClientRect().top");
    await js("window.scrollBy(0,200)");await delay(100);
    const after=await js("document.querySelector('.sheet-head-sticky').getBoundingClientRect().top");
    assert(Math.abs(after)<3,`header top ${before} -> ${after}`);
    assert.equal(await js("getComputedStyle(document.querySelector('.sheet-column-head > span')).textAlign"),'center');
    await js("document.querySelector('.sheet-scroll').scrollLeft=100");await delay(100);
    assert.equal(await js("document.querySelector('.sheet-head-scroll').scrollLeft"),await js("document.querySelector('.sheet-scroll').scrollLeft"));
    await fs.writeFile(path.join(root,'sticky-header.png'),(await win.webContents.capturePage()).toPNG());
    console.log('PASS encrypted remembered login and clear; icon sidebar; model tabs/disclosure preserve edits; centered sticky header and horizontal sync. Screenshots: '+root);
    win.destroy();app.quit();
  } catch(error) {console.error(error);app.exit(1);}
});
