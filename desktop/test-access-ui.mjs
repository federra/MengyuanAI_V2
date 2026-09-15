import { createRequire } from 'node:module';
import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const stage = path.resolve(
  process.env.DIRECTOR_ACCESS_STAGE ||
    'desktop/test-results/access-stage2-build',
);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-access-ui-'));
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
    await js(
      "Array.from(document.querySelectorAll('[data-sidebar=menu-button]')).find(b=>b.textContent.trim()==='收益中心').click()",
    );
    await delay(150);
    assert.equal(
      await js(
        "document.querySelector('.breadcrumb').textContent.includes('收益中心')",
      ),
      true,
    );
    assert.equal(await js("Array.from(document.querySelectorAll('[data-sidebar=menu-button]')).some(b=>b.textContent.includes('管理员后台'))"),false);
    assert.equal((await js("window.directorDesktop.admin('users')")).error,'FORBIDDEN');
    denied = 'BANNED';
    await js("window.directorDesktop.auth('state')");
    await wait('.access-card');
    assert.equal(await js("!!document.querySelector('.topbar')"), false);
    assert.equal(await js("fetch('/api/projects').then(r=>r.status)"), 401);
    assert.equal(await js("document.body.textContent.includes('封禁')"), true);
    offline = true;
    denied = '';
    await js("window.directorDesktop.auth('state')");
    assert.equal(await js("document.body.textContent.includes('网络')"), true);
    await delay(150);
    const recoveryPath=path.join(root,'accounts',user.id,'recovery.json');
    const recovered=JSON.parse(await fs.readFile(recoveryPath,'utf8'));
    assert.equal(recovered.dirty,true);assert.ok(recovered.project.id);
    offline=false;
    await js("window.confirm=()=>true; window.directorDesktop.auth('login',{account:'test-member',key:'Test-key-2026'})");
    await wait('.topbar');await delay(650);
    assert.equal(JSON.parse(await fs.readFile(recoveryPath,'utf8')).project.id,recovered.project.id);
    console.log(
      'PASS Electron: login only, real form login, protected HTTP/IPC, both themes, member business retained, ban/offline hide UI and recovery survives re-login. Screenshots: ' +
        root,
    );
    win.destroy();
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
