// Compiled renderer + real isolated model configuration API; no external model calls.
import { createRequire } from 'node:module';
import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const stage = path.resolve(process.env.DIRECTOR_ACCESS_STAGE);
const stagePackage = JSON.parse(await fs.readFile(path.join(stage, 'package.json'), 'utf8'));
app.getVersion = () => stagePackage.version;
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-text-budget-ui-'));
app.setPath('userData', root);
const auth = require(path.join(stage, 'access-session.cjs'));
const Original = auth.AccessSession;
auth.AccessSession = class extends Original {
  constructor(options) { super({ ...options, request: async () => Response.json({ token: 'test-session', user: { id: '11111111-1111-4111-8111-111111111111', account: 'test-member', role: 'member', expires_at: Date.now() + 600000 }, server_time: Date.now(), session_expires_at: Date.now() + 600000 }) }); }
};
dialog.showMessageBox = async () => ({ response: 0 });
dialog.showMessageBoxSync = () => 1;
const updates = require(path.join(stage, 'software-update.cjs'));
const OriginalUpdate = updates.SoftwareUpdate;
updates.SoftwareUpdate = class extends OriginalUpdate {
  constructor(options) { super({ ...options, fetch: async () => { throw Error('isolated test: updates disabled'); } }); }
};
require(path.join(stage, 'main.cjs'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('Text budget UI test timed out'); app.exit(1); }, 110000).unref();
void app.whenReady().then(async () => {
  try {
    let win;
    for (let i = 0; i < 180; i++) {
      win = BrowserWindow.getAllWindows()[0];
      if (win && await win.webContents.executeJavaScript("!!document.querySelector('#access-account')").catch(() => false)) break;
      await delay(100);
    }
    assert(win); win.setSize(1450, 950);
    const js = async code => { try { return await win.webContents.executeJavaScript(code); } catch(error) { throw Error('UI script failed: '+code.slice(0,160)+'; '+error.message); } };
    async function wait(code) { for (let i = 0; i < 180; i++) { if (await js(code).catch(() => false)) return; await delay(60); } throw Error('Missing: ' + code); }
    const click = async selector => { await js(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(130); };
    const fill = async (selector, value) => { await js(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`); await delay(100); };
    const navigate = async name => { await js(`[...document.querySelectorAll('.studio-navigation button')].find(button=>button.getAttribute('aria-label')===${JSON.stringify(name)}).click()`); await delay(180); };
    async function choose(text) {
      await click('#text-output-budget');
      await wait("document.querySelectorAll('[role=option]').length>0");
      await js(`[...document.querySelectorAll('[role=option]')].find(option=>option.textContent.includes(${JSON.stringify(text)})).click()`);
      await delay(130);
    }
    const save = async () => { await js("[...document.querySelector('details[open]').querySelectorAll('button')].find(button=>button.textContent==='保存配置').click()"); await delay(100); };
    const getConfig = () => js("fetch('/api/models').then(r=>r.json()).then(rows=>rows.find(row=>row.id==='text'))");
    await wait("!!document.querySelector('.access-submit:not(:disabled)')");
    await fill('#access-account', 'test-member'); await fill('#access-key', 'test-key');
    await js("document.querySelector('.access-card form').requestSubmit()"); await wait("!!document.querySelector('.topbar')");
    await js(`(async()=>{
      const response=await fetch('/api/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'text',kind:'text',name:'额度测试模型',baseUrl:'https://api.example.com/v1',model:'deepseek-flash',protocol:'chat',thinking:'auto',enabled:true,apiKey:'test-only-key'})});
      if(!response.ok)throw Error(await response.text());
      window.__textBudgetSaves=[];window.__textBudgetErrors=[];window.addEventListener('error',event=>window.__textBudgetErrors.push(event.message));
      const original=window.fetch.bind(window);window.fetch=(input,options)=>{if(typeof input==='string'&&input==='/api/models'&&options?.method==='POST')window.__textBudgetSaves.push(JSON.parse(options.body));if(typeof input==='string'&&['/api/ai','/api/director','/api/assets','/api/generations'].some(route=>input.startsWith(route)))throw Error('paid request forbidden in UI test');return original(input,options);};
    })()`);
    await navigate('模型设置'); await wait("document.querySelector('.model-config-disclosure')?.textContent.includes('额度测试模型')");
    await click('.model-config-disclosure summary'); await wait("!!document.querySelector('#text-output-budget')");
    assert.match(await js("document.querySelector('#text-output-budget').textContent"), /不限制/);
    assert.equal(await js("document.querySelector('input[aria-label=\"自定义最大输出预算（tokens）\"]')"), null);
    assert.equal((await getConfig()).maxOutputTokens, null);
    await choose('自定义'); await wait("!!document.querySelector('input[aria-label=\"自定义最大输出预算（tokens）\"]')");
    await save(); await wait("document.querySelector('output').textContent.includes('正整数')");
    assert.equal(await js('window.__textBudgetSaves.length'), 0, 'blank custom budget must not serialize NaN as unlimited');
    const inputSelector = 'input[aria-label="自定义最大输出预算（tokens）"]';
    for (const value of ['0', '-1', '1.5']) {
      await fill(inputSelector, value); await save(); await wait("document.querySelector('output').textContent.includes('正整数')");
      assert.equal(await js('window.__textBudgetSaves.length'), 0, 'invalid custom values are rejected before request');
    }
    await fill(inputSelector, '12345'); await save(); await wait("document.querySelector('output').textContent.includes('已保存')");
    assert.equal((await getConfig()).maxOutputTokens, 12345);
    await navigate('创作中心'); await navigate('模型设置'); await click('.model-config-disclosure summary');
    assert.match(await js("document.querySelector('#text-output-budget').textContent"), /自定义/);
    assert.equal(await js(`document.querySelector(${JSON.stringify(inputSelector)}).value`), '12345', 'remount reads persisted budget');
    for (const width of [1450, 1024, 760]) {
      win.setSize(width, 950); await delay(150);
      await js("document.querySelector('#text-output-budget').scrollIntoView({block:'center'})"); await delay(100);
      const bounds = await js("(()=>{const field=document.querySelector('#text-output-budget').closest('.field').getBoundingClientRect();return {left:field.left,right:field.right,viewport:innerWidth};})()");
      assert(bounds.left>=0 && bounds.right<=bounds.viewport, JSON.stringify(bounds));
      await fs.writeFile(path.join(root, `text-budget-custom-${width}.png`), (await win.webContents.capturePage()).toPNG());
    }
    await choose('不限制'); await save(); await wait("document.querySelector('output').textContent.includes('已保存')");
    assert.equal((await getConfig()).maxOutputTokens, null);
    for (const width of [1450, 1024, 760]) {
      win.setSize(width, 950); await delay(150);
      assert(await js("document.querySelector('#text-output-budget').getBoundingClientRect().width>0"));
      await js("document.querySelector('#text-output-budget').scrollIntoView({block:'center'})"); await delay(100);
      await fs.writeFile(path.join(root, `text-budget-${width}.png`), (await win.webContents.capturePage()).toPNG());
    }
    await click('.theme-toggle'); await fs.writeFile(path.join(root, 'text-budget-dark.png'), (await win.webContents.capturePage()).toPNG());
    for (const kind of ['image', 'video', 'audio']) { await click('#model-tab-' + kind); assert.equal(await js("document.querySelectorAll('[id$=\"-output-budget\"]').length"), 0, 'output limit applies only to text models'); }
    assert.deepEqual(await js('window.__textBudgetErrors'), []);
    console.log(JSON.stringify({ passed: true, screenshots: root, checks: ['old config defaults unlimited', 'custom selection', 'blank/zero/negative/fraction rejected without request', 'real API save and remount persistence', 'return unlimited', 'text-only controls', 'multiple widths and dark theme'], paidRequests: 0 }));
    win.destroy(); app.quit();
  } catch (error) { console.error(error); console.error('Screenshots: ' + root); app.exit(1); }
});
