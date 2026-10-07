// Full compiled renderer, isolated account/data, deterministic director replies.
import { createRequire } from 'node:module';
import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const stage = path.resolve(process.env.DIRECTOR_ACCESS_STAGE);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-chat-ui-'));
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
setTimeout(() => { console.error('Director chat test timed out'); app.exit(1); }, 110000).unref();
void app.whenReady().then(async () => {
  try {
    let win;
    for (let i = 0; i < 180; i++) {
      win = BrowserWindow.getAllWindows()[0];
      if (win && await win.webContents.executeJavaScript("!!document.querySelector('#access-account')").catch(() => false)) break;
      await delay(100);
    }
    assert(win); win.setSize(1450, 950);
    const js = code => win.webContents.executeJavaScript(code);
    async function wait(code, label = code) {
      for (let i = 0; i < 180; i++) { if (await js(code).catch(() => false)) return; await delay(60); }
      throw Error('Missing: ' + label);
    }
    const click = async (selector) => { await js(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(130); };
    const navigate = async name => { await js(`[...document.querySelectorAll('.workflow button')].find(button=>button.textContent.includes(${JSON.stringify(name)})).click()`); await delay(180); };
    const fill = async text => { await js(`(()=>{const input=document.querySelector('.director-chat-input textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`); await delay(100); };
    const screenshot = async name => { await fs.writeFile(path.join(root, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
    const screenshotPanel = async name => {
      const rect = await js("(()=>{const r=document.querySelector('.director-chat').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()");
      await fs.writeFile(path.join(root, name + '.png'), (await win.webContents.capturePage(rect)).toPNG());
    };
    await wait("!!document.querySelector('.access-submit:not(:disabled)')");
    await js(`(()=>{for(const [id,value] of [['access-account','test-member'],['access-key','test-key']]){const input=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
    await delay(100); await js("document.querySelector('.access-card form').requestSubmit()");
    await wait("!!document.querySelector('.topbar')");
    await js(`(()=>{
      window.__directorRequests=[];window.__directorMode='question';window.__directorErrors=[];
      window.addEventListener('error',event=>window.__directorErrors.push(event.message));
      const original=window.fetch.bind(window);
      window.fetch=async(input,options)=>{
        if(typeof input!=='string'||!input.endsWith('/api/director'))return original(input,options);
        const body=JSON.parse(options.body);window.__directorRequests.push(body);
        if(window.__directorMode==='hold')await new Promise((resolve,reject)=>{window.__directorRelease=resolve;options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});
        const fields={'创意':'brief','故事':'story','剧本':'script','分场':'scenes'};
        let changes=[];
        if(window.__directorMode!=='question'){
          if(body.selection){
            const selected=body.selection;
            const target=selected.target==='project'?body.project:body.project.shots.find(shot=>shot.id===selected.id);
            const source=selected.field==='visual'?(!target.prompt?target.description:!target.description||target.prompt.includes(target.description)?target.prompt:target.description+'\\n\\n'+target.prompt):target[selected.field];
            const after=source.slice(0,selected.start)+'测试替换片段'+source.slice(selected.end);
            changes=(selected.field==='visual'?['description','prompt']:[selected.field]).map(field=>({target:selected.target,id:selected.id,field,before:target[field],after,reason:'测试局部修改'}));
          }else if(body.stage==='分镜'){
            const target=body.project.shots.find(shot=>shot.id===body.shotId)||body.project.shots[0];
            changes=[{target:'shot',id:target.id,field:'prompt',before:target.prompt,after:target.prompt+'测试优化',reason:'测试修改'}];
          }else if(fields[body.stage]){
            const field=fields[body.stage];changes=[{target:'project',id:body.project.id,field,before:body.project[field],after:body.project[field]+'\\n测试修改',reason:'测试修改'}];
          }
        }
        return Response.json({reply:changes.length?'已按你的要求调整了内容，其他内容保留。':'我检查了当前内容，可以继续告诉我希望加强哪一处。',changes});
      };
    })()`);

    await navigate('创意'); await click('.director-island-toggle');
    await wait("!document.querySelector('.director-chat').hidden");
    assert.equal(await js("document.querySelector('.director-chat').querySelectorAll('[role=combobox],select,[data-slot=select-trigger]').length"), 0, 'assistant must not ask for a Skill');
    await click('.director-chat-suggestions button');
    await wait("document.querySelectorAll('.director-message-assistant').length===1");
    assert.equal(await js("document.querySelectorAll('[role=dialog]').length"), 0, 'shortcut replies stay in the sidebar');
    await fill('再解释一下'); await js("document.querySelector('.director-chat-composer').requestSubmit()");
    await wait("document.querySelectorAll('.director-message-assistant').length===2");
    assert.equal(await js("window.__directorRequests.at(-1).history.length"), 2, 'follow-ups include the conversation');
    assert.equal(await js("'skillId' in window.__directorRequests.at(-1)"), false);
    await screenshot('conversation-light');

    const before = await js("(()=>{const r=document.querySelector('.director-chat').getBoundingClientRect(),h=document.querySelector('.director-resize-both').getBoundingClientRect();return {width:r.width,height:r.height,x:h.x+7,y:h.y+7};})()");
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(before.x), y: Math.round(before.y) });
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: Math.round(before.x), y: Math.round(before.y) });
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(before.x - 110), y: Math.round(before.y - 60) });
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: Math.round(before.x - 110), y: Math.round(before.y - 60) });
    await delay(180);
    const enlarged = await js("(()=>{const r=document.querySelector('.director-chat').getBoundingClientRect();return {width:r.width,height:r.height};})()");
    assert(enlarged.width >= before.width + 100 && enlarged.height >= before.height + 50, JSON.stringify({ before, enlarged }));
    const shrinkPoint = await js("(()=>{const r=document.querySelector('.director-resize-both').getBoundingClientRect();return {x:r.x+7,y:r.y+7};})()");
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: Math.round(shrinkPoint.x), y: Math.round(shrinkPoint.y) });
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(shrinkPoint.x + 60), y: Math.round(shrinkPoint.y + 30) });
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: Math.round(shrinkPoint.x + 60), y: Math.round(shrinkPoint.y + 30) });
    await delay(150);
    assert(await js(`document.querySelector('.director-chat').getBoundingClientRect().width < ${enlarged.width - 45}`));

    await navigate('故事');
    const originalStory = await js("document.querySelector('textarea[data-stage-field=story]').value");
    assert(originalStory.length > 15);
    await js("(()=>{const input=document.querySelector('textarea[data-stage-field=story]');input.focus();input.setSelectionRange(5,12);input.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:600,clientY:330}));})()");
    await wait("!!document.querySelector('.director-selection-action')"); await click('.director-selection-action');
    assert.equal(await js("document.querySelector('.director-context p').textContent"), originalStory.slice(5, 12));
    assert.equal(await js("document.querySelectorAll('[role=dialog]').length"), 0);
    await js("window.__directorMode='edit'"); await fill('只修改选中片段'); await screenshot('selected-story');
    await js("document.querySelector('.director-chat-composer').requestSubmit()");
    await wait("!!document.querySelector('.director-change-success')");
    assert.equal(await js("document.querySelector('textarea[data-stage-field=story]').value"), originalStory.slice(0, 5) + '测试替换片段' + originalStory.slice(12));
    assert.equal(await js("document.querySelector('.director-context p').textContent"), '测试替换片段', 'follow-up chat remains scoped to the edited passage');
    await screenshotPanel('assistant-preview');
    await js("[...document.querySelectorAll('.director-message button')].find(button=>button.textContent.includes('撤销')).click()"); await delay(150);
    assert.equal(await js("document.querySelector('textarea[data-stage-field=story]').value"), originalStory);
    assert.equal(await js("document.querySelector('.director-context p').textContent"), originalStory.slice(5, 12));
    await screenshot('story-undo');
    await fill('再次只改这段'); await js("document.querySelector('.director-chat-composer').requestSubmit()");
    await wait("document.querySelector('textarea[data-stage-field=story]').value!==" + JSON.stringify(originalStory));
    await click('.creative-undo button'); await delay(150);
    assert.equal(await js("document.querySelector('textarea[data-stage-field=story]').value"), originalStory, 'main undo uses the same scoped assistant undo');
    assert.equal(await js("document.querySelector('.director-context p').textContent"), originalStory.slice(5, 12), 'main undo restores the selected context');
    await fill('撤销后继续改这段'); await js("document.querySelector('.director-chat-composer').requestSubmit()");
    await wait("document.querySelector('textarea[data-stage-field=story]').value!==" + JSON.stringify(originalStory));
    await click('.creative-undo button'); await delay(150);
    assert.equal(await js("document.querySelector('textarea[data-stage-field=story]').value"), originalStory);

    await navigate('剧本');
    await js("(()=>{const preview=document.querySelector('.formatted-script'),line=preview.children[1];const range=document.createRange();range.selectNodeContents(line);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);preview.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:700,clientY:430}));})()");
    await wait("!!document.querySelector('.director-selection-action')"); await click('.director-selection-action');
    const scriptSelection = await js("document.querySelector('.director-context p').textContent");
    assert(scriptSelection.length > 0, 'formatted script selection must be captured');
    await fill('把这段改得更紧凑'); await screenshot('selected-script');
    await js("window.__directorMode='hold';document.querySelector('.director-chat-composer').requestSubmit()");
    await wait("!!document.querySelector('.director-thinking')");
    await navigate('故事');
    assert.equal(await js("document.querySelector('textarea[data-stage-field=story]').value"), originalStory, 'main workflow remains usable while the assistant is running');
    await js("window.__directorMode='question';if(window.__directorRelease)window.__directorRelease()"); await delay(200);
    await navigate('剧本');
    assert.equal(await js("document.querySelector('.formatted-script').textContent.includes('测试替换片段')"), false, 'late response after changing stage must not apply');

    await navigate('分镜');
    const promptText = await js("document.querySelector('.prompt-rich-editor').textContent");
    await js("(()=>{const root=document.querySelector('.prompt-rich-editor');const range=document.createRange();range.selectNodeContents(root);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:700,clientY:430}));})()");
    await wait("!!document.querySelector('.director-selection-action')"); await click('.director-selection-action');
    assert.equal(await js("document.querySelector('.director-context p').textContent"), promptText);
    await fill('优化这一小段'); await js("window.__directorMode='edit';document.querySelector('.director-chat-composer').requestSubmit()");
    await wait("!!document.querySelector('.director-change-success')");
    assert.equal(await js("document.querySelector('.prompt-rich-editor').textContent"), '测试替换片段');
    await js("[...document.querySelectorAll('.director-message button')].find(button=>button.textContent.includes('撤销')).click()"); await delay(150);
    assert.equal(await js("document.querySelector('.prompt-rich-editor').textContent"), promptText, 'undo restores the original prompt and description');
    const dialogueText = await js("document.querySelector('.dialogue-card textarea').value");
    await js("(()=>{const input=document.querySelector('.dialogue-card textarea');input.focus();input.setSelectionRange(0,3);input.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:800,clientY:500}));})()");
    await wait("!!document.querySelector('.director-selection-action')"); await click('.director-selection-action');
    await fill('只改这几个字'); await js("document.querySelector('.director-chat-composer').requestSubmit()");
    await wait("window.__directorRequests.at(-1).selection?.field==='dialogue' && document.querySelector('.dialogue-card textarea').value!==" + JSON.stringify(dialogueText));
    assert.equal(await js("document.querySelector('.dialogue-card textarea').value"), '测试替换片段' + dialogueText.slice(3));
    await js("[...document.querySelectorAll('.director-message button')].at(-1).click()"); await delay(150);
    assert.equal(await js("document.querySelector('.dialogue-card textarea').value"), dialogueText);
    await fill('再次只改台词片段'); await js("document.querySelector('.director-chat-composer').requestSubmit()");
    await wait("document.querySelector('.dialogue-card textarea').value!==" + JSON.stringify(dialogueText));
    await click('.creative-undo button'); await delay(150);
    assert.equal(await js("document.querySelector('.dialogue-card textarea').value"), dialogueText, 'main undo restores the structured dialogue');
    await js("window.__directorMode='question';document.querySelector('.sheet-prompt-actions button').click()");
    await wait("window.__directorRequests.at(-1).shotId!==undefined");
    assert.equal(await js("document.querySelectorAll('[role=dialog]').length"), 0, 'row optimization stays in chat');
    await click('.theme-toggle'); await screenshot('conversation-dark');
    for (const width of [1024, 760]) {
      win.setSize(width, 850); await delay(180);
      const bounds = await js("(()=>{const p=document.querySelector('.director-chat').getBoundingClientRect(),c=document.querySelector('.director-chat-composer').getBoundingClientRect();return {left:p.left,right:p.right,top:p.top,bottom:p.bottom,composerBottom:c.bottom,viewport:innerWidth};})()");
      assert(bounds.left >= 0 && bounds.right <= bounds.viewport && bounds.top >= 0 && Math.abs(bounds.bottom - bounds.composerBottom) < 2, JSON.stringify(bounds));
      await screenshot('conversation-' + width);
    }
    assert.deepEqual(await js("window.__directorErrors"), []);
    assert.equal(await js("getComputedStyle(document.querySelector('.director-chat-input textarea')).borderTopWidth"), '0px', 'dark composer has no duplicated textarea border');
    console.log(JSON.stringify({ passed: true, resize: { before, enlarged }, screenshots: root, checks: ['inline shortcut and follow-up conversation', 'no Skill picker or assistant modal', 'real mouse resize larger and smaller', 'story selection and exact undo', 'formatted script selection', 'navigation during pending request', 'rich prompt selection', 'row optimization scoped to one shot', 'dark theme and narrow windows'] }));
    win.destroy(); app.quit();
  } catch (error) { console.error(error); console.error('Screenshots: ' + root); app.exit(1); }
});
