import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { app, BrowserWindow, dialog, Menu } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-admin-ui-'));
const stage = path.resolve(
  process.env.DIRECTOR_ACCESS_STAGE ||
    'desktop/test-results/access-stage4-build',
);
app.setPath('userData', root);
// Real central HTTP implementation on an isolated DB. Credentials are fixtures only.
const child = spawn(
  process.env.DIRECTOR_NODE || 'node',
  [
    '--input-type=module',
    '-e',
    `
import {openStore} from './services/access-control/src/store.ts';
import {AccessService} from './services/access-control/src/service.ts';
const db=openStore(process.env.ACCESS_DB);const service=new AccessService(db);
await service.bootstrap('test-admin','Admin-fixture-key-2026');db.close();
await import('./services/access-control/src/server.ts');
`,
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ACCESS_DB: path.join(root, 'central.sqlite'),
      ACCESS_PORT: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
child.stderr.on('data', (data) => process.stderr.write(data));
const port = await new Promise((resolve, reject) => {
  let text = '';
  child.stdout.on('data', (data) => {
    text += data;
    const line = text.split('\n').find((l) => l.includes('"listening"'));
    if (line) resolve(JSON.parse(line).port);
  });
  child.on('error', reject);
  child.on('exit', (code) => reject(Error('Fixture exited ' + code)));
});
const require = createRequire(import.meta.url),
  mod = require(path.join(stage, 'access-session.cjs')),
  Original = mod.AccessSession;
mod.AccessSession = class extends Original {
  constructor(options) {
    super({
      ...options,
      request: async (url, init) => {
        const path =
          new URL(url).pathname.replace(/^\/access/, '') + new URL(url).search;
        return fetch('http://127.0.0.1:' + port + path, init);
      },
    });
  }
};
dialog.showMessageBox = async () => ({ response: 0 });
dialog.showMessageBoxSync = () => 1;
require(path.join(stage, 'main.cjs'));
app.on('will-quit', () => child.kill());
setTimeout(() => {
  child.kill();
  console.error('Admin UI timeout');
  app.exit(1);
}, 120000).unref();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
void app.whenReady().then(async () => {
  let win;
  try {
    for (let i = 0; i < 250; i++) {
      win = BrowserWindow.getAllWindows()[0];
      if (
        win &&
        (await win.webContents
          .executeJavaScript("!!document.querySelector('#access-account')")
          .catch(() => false))
      )
        break;
      await delay(100);
    }
    assert(win);
    const js = (code) => win.webContents.executeJavaScript(code);
    const wait = async (code) => {
      for (let i = 0; i < 200; i++) {
        if (await js(code).catch(() => false)) return;
        await delay(100);
      }
      throw Error('Missing: ' + code);
    };
    const click = async (text, scope = 'document') => {
      await js(
        `Array.from(${scope}.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`,
      );
      await delay(120);
    };
    const fill = async (selector, value) => {
      await js(
        `(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
    };
    assert.equal(
      (await js("window.directorDesktop.admin('users')")).error,
      'UNAUTHENTICATED',
    );
    await fill('#access-account', 'test-admin');
    await fill('#access-key', 'Admin-fixture-key-2026');
    await js("document.querySelector('.access-card form').requestSubmit()");
    await wait("!!document.querySelector('.topbar')");
    await delay(600);
    await click('管理员后台');
    await wait(
      "document.querySelector('.admin-console')?.textContent.includes('暂无会员记录')",
    );
    assert.equal(
      await js("document.querySelectorAll('.admin-console .stat').length"),
      5,
    );
    assert.equal(
      await js(
        "document.querySelector('.admin-console').textContent.includes('尚未接入')",
      ),
      true,
    );
    await fs.writeFile(
      path.join(root, 'overview-light.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js("document.querySelector('.theme-toggle').click()");
    await delay(150);
    assert.equal(
      await js(
        "getComputedStyle(document.querySelector('.admin-console')).getPropertyValue('--ad-bg').trim()",
      ),
      '#111923',
    );
    await fs.writeFile(
      path.join(root, 'overview-dark.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await click('增加用户');
    await wait("!!document.querySelector('dialog[open]')");
    await fill('dialog input[pattern]', 'test-member');
    await fill(
      'dialog input[autocomplete="new-password"]',
      'Member-fixture-key-2026',
    );
    await fill('dialog textarea', 'UI fixture create');
    await fs.writeFile(
      path.join(root, 'create-dark.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js("document.querySelector('dialog form').requestSubmit()");
    await wait("!document.querySelector('dialog[open]')");
    const login = await fetch('http://127.0.0.1:' + port + '/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        account: 'test-member',
        key: 'Member-fixture-key-2026',
        client_type: 'desktop',
      }),
    });
    const memberSession = await login.json();
    assert.equal(login.status, 200);
    const events = [
      ['idea', 1, 'project'],
      ['story', 3, 'ai'],
      ['script', 1, 'ai'],
      ['asset', 3, 'upload'],
      ['video_export', 1, 'video_export'],
    ].map(([metric, quantity, source], i) => ({
      event_id: 'ui-event-' + i,
      operation_id: 'ui-op-' + i,
      output_id: 'ui-output-' + i,
      metric,
      quantity,
      source,
      video_kind: metric === 'video_export' ? 'shot' : '',
      occurred_at: Date.now(),
    }));
    events.push({
      ...events[0],
      event_id: 'ui-bad-clock',
      operation_id: 'ui-bad-clock',
      occurred_at: 0,
    });
    const ingested = await fetch('http://127.0.0.1:' + port + '/usage/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + memberSession.token,
      },
      body: JSON.stringify({ events }),
    });
    assert.equal(ingested.status, 200);
    await click('用户管理');
    await wait(
      "document.querySelector('.admin-console tbody')?.textContent.includes('test-member')",
    );
    await fs.writeFile(
      path.join(root, 'users-dark.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await click('封禁', "document.querySelector('.admin-console')");
    await fill('dialog textarea', 'UI fixture ban');
    await js("document.querySelector('dialog form').requestSubmit()");
    await wait(
      "!document.querySelector('dialog[open]') && document.querySelector('.admin-console tbody')?.textContent.includes('已封禁')",
    );
    await click('恢复', "document.querySelector('.admin-console')");
    await fill('dialog textarea', 'UI fixture restore');
    await js("document.querySelector('dialog form').requestSubmit()");
    await wait(
      "!document.querySelector('dialog[open]') && document.querySelector('.admin-console tbody')?.textContent.includes('授权有效')",
    );
    await click('使用详情', "document.querySelector('.admin-console')");
    await wait(
      "document.querySelector('dialog tbody')?.textContent.includes('文本生成')",
    );
    assert.deepEqual(
      await js(
        "Array.from(document.querySelector('dialog .stats').querySelectorAll('.stat strong')).map(n=>n.textContent)",
      ),
      ['1', '3', '1', '3', '1'],
    );
    assert.equal(
      await js(
        "document.querySelector('dialog').textContent.includes('异常时间记录：1')",
      ),
      true,
    );
    await fs.writeFile(
      path.join(root, 'usage-dark.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js(
      "document.querySelector('dialog button[aria-label=关闭]').click()",
    );
    await click('操作日志');
    await wait(
      "document.querySelector('.admin-console tbody')?.textContent.includes('UI fixture restore')",
    );
    assert.equal(
      await js(
        "document.querySelector('.admin-console').textContent.includes('Member-fixture-key-2026')",
      ),
      false,
    );
    await fs.writeFile(
      path.join(root, 'logs-dark.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js("document.querySelector('.theme-toggle').click()");
    await delay(120);
    await fs.writeFile(
      path.join(root, 'logs-light.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await click('数据概览');
    await wait(
      "document.querySelector('.admin-console .stat strong')?.textContent==='1' && !document.querySelector('.admin-console .loading')",
    );
    assert.deepEqual(
      await js(
        "Array.from(document.querySelectorAll('.admin-console .stats .stat strong')).map(n=>n.textContent)",
      ),
      ['1', '3', '1', '3', '1'],
    );
    await fs.writeFile(
      path.join(root, 'statistics-light.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    await js("document.querySelector('.theme-toggle').click()");
    await delay(150);
    await fs.writeFile(
      path.join(root, 'statistics-dark.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    // Exercise the actual desktop import menu; inspect its durable local marker.
    const projectFile = path.join(root, 'import-project.json');
    await fs.writeFile(
      projectFile,
      JSON.stringify({
        id: '11111111-1111-4111-8111-111111111111',
        title: '旧项目',
        brief: '历史创意',
        story: '',
        script: '',
        scenes: '',
        style: '电影感',
        ratio: '16:9',
        shots: [],
        assets: [],
        revision: 1,
        updatedAt: new Date().toISOString(),
      }),
    );
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [projectFile],
    });
    const importItem = Menu.getApplicationMenu()
      .items.flatMap((item) => item.submenu?.items || [])
      .find((item) => item.label === '导入项目JSON（文字与设定）');
    assert(importItem);
    await importItem.click();
    await wait("!!document.querySelector('.topbar')");
    const readMarkers = spawn(
      process.env.DIRECTOR_NODE || 'node',
      [
        '--input-type=module',
        '-e',
        `
      import fs from 'node:fs/promises';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
      const root=process.argv[1],rows=[];
      for(const file of await fs.readdir(root,{recursive:true})){if(!file.endsWith('.sqlite')||!file.includes('accounts/'))continue;const db=new DatabaseSync(path.join(root,file),{readOnly:true});try{rows.push(...db.prepare("SELECT state,quantity FROM desktop_usage_events WHERE metric='idea'").all());}catch{}finally{db.close();}}
      console.log(JSON.stringify(rows));
    `,
        root,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let markerOutput = '';
    readMarkers.stdout.on('data', (data) => {
      markerOutput += data;
    });
    const code = await new Promise((resolve) =>
      readMarkers.on('exit', resolve),
    );
    assert.equal(code, 0);
    const markers = JSON.parse(markerOutput.trim());
    assert.equal(markers.length, 1);
    assert.equal(markers[0].state, 'ignored');
    assert.equal(markers[0].quantity, 0);
    console.log(
      'PASS real central HTTP + Electron admin creation, ban/restore, usage, logs, themes. Screenshots: ' +
        root,
    );
    win.destroy();
    child.kill();
    app.quit();
  } catch (error) {
    console.error(error);
    child.kill();
    app.exit(1);
  }
});
