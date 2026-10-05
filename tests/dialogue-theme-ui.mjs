// Run with the repository's Electron binary. This loads real CSS in a standalone
// hidden renderer; no application backend, account, project data, or model is used.
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-dialogue-layout-'));
app.setPath('userData', path.join(root, 'browser'));
app.on('window-all-closed', () => {});
let win;
void app.whenReady().then(async () => {
try {
  const styles = await Promise.all(['globals', 'creative', 'storyboard-sheet', 'dark-theme'].map(name => fs.readFile(`app/${name}.css`, 'utf8')));
  const controls = '<div class="dialogue-controls"><button data-slot="select-trigger">台词</button><button data-slot="select-trigger">师傅</button><button data-slot="select-trigger">音色</button><button>配</button><button>删</button></div>';
  const cards = Array.from({ length: 7 }, (_, index) => `<section class="dialogue-card">${controls}<textarea aria-label="台词${index + 1}">这是第${index + 1}条完整台词，正文和角色选择应同时可见。</textarea></section>`).join('');
  const fixture = `<html><head><style>*,::before,::after{box-sizing:border-box}button,textarea{font:inherit}textarea{display:block}</style>${styles.map(css => `<style>${css}</style>`).join('')}</head><body><div class="shot-sheet-mode"><div class="dialogue-column" style="width:280px"><div class="dialogue-stack">${cards}</div><button class="add-dialogue">添加台词</button></div></div><div class="creative-card creative-editor"><button class="formatted-script"><span class="script-scene">第一场：车内</span><span class="script-dialogue"><strong>师傅：</strong>慢一点。</span></button><textarea>师傅：慢一点。</textarea></div></body></html>`;
  win = new BrowserWindow({ show: false, width: 900, height: 900, webPreferences: { sandbox: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(fixture));
  const js = code => win.webContents.executeJavaScript(code);
  const layout = await js(`(() => { const stack=document.querySelector('.dialogue-stack');return {height:stack.clientHeight,scrollHeight:stack.scrollHeight,cards:Array.from(stack.children).map(card=>({height:card.getBoundingClientRect().height,controls:card.querySelector('.dialogue-controls').getBoundingClientRect().height,text:card.querySelector('textarea').getBoundingClientRect().height}))};})()`);
  assert(layout.height <= 132, JSON.stringify(layout));
  assert(layout.scrollHeight > layout.height * 3, 'seven complete cards should scroll inside the bounded column: ' + JSON.stringify(layout));
  assert(layout.cards.every(card => card.height >= card.controls + card.text), 'each card must fit its controls and textarea: ' + JSON.stringify(layout));
  const visibleLast = await js(`(() => { const stack=document.querySelector('.dialogue-stack');stack.scrollTop=stack.scrollHeight;const last=stack.lastElementChild.querySelector('textarea').getBoundingClientRect(),bounds=stack.getBoundingClientRect();return last.top<bounds.bottom && last.bottom<=bounds.bottom; })()`);
  assert(visibleLast, 'scrolling must reach the last complete textarea');
  const colors = await js(`(() => { const values=()=>{const preview=getComputedStyle(document.querySelector('.formatted-script')),editor=getComputedStyle(document.querySelector('.creative-editor textarea'));return {background:preview.backgroundColor,color:preview.color,editorBackground:editor.backgroundColor,editorColor:editor.color};};const light=values();document.documentElement.classList.add('dark');return {light,dark:values()}; })()`);
  assert.notEqual(colors.light.background, colors.dark.background, 'script preview background must switch with the theme');
  assert.equal(colors.dark.background, colors.dark.editorBackground, 'script reading and editing views must share a dark surface');
  assert.equal(colors.dark.color, colors.dark.editorColor, 'script reading and editing views must share readable dark text');
  console.log(JSON.stringify({ passed: true, layout, colors }));
  app.exit(0);
} catch (error) {
  console.error(error);
  app.exit(1);
}
});
