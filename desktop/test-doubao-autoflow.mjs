import {app,BrowserWindow} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
app.setPath('userData',await fs.mkdtemp(path.join(os.tmpdir(),'director-autoflow-')));
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {inspectComposer} from '../browser-extension/composer.js';
import {configureWatermark} from '../browser-extension/configure-watermark.js';
import {configureVideo} from '../browser-extension/configure-video.js';
import {prepareTask} from '../browser-extension/prepare.js';
import {readPageState} from '../browser-extension/page-state.js';
import {enterCreation} from '../browser-extension/enter-creation.js';
import {confirmVideo} from '../browser-extension/confirm-video.js';
import {probeResult} from '../browser-extension/probe-result.js';
import {readLoginState,labelAccount} from '../browser-extension/login-state.js';
// Real Chromium DOM, native file inputs and input/change events; no Doubao
// account, real uploads or paid generation. The production preparation code
// is invoked through the same scripting interface used by the extension.
app.whenReady().then(async()=>{
  setTimeout(()=>{console.error('Autoflow did not settle; possible page event loop lock');app.exit(1);},60000).unref();
  const win=new BrowserWindow({show:false,width:1200,height:900,webPreferences:{sandbox:true}});
  try{
    let html=`<!doctype html><style>section{width:700px;margin:100px auto}textarea{width:600px;height:100px}#menu{display:none}img{width:50px;height:50px}</style>
    <button id="ai">AI 创作</button><div id="chat"><textarea aria-label="普通对话"></textarea></div><section hidden><div id="uploads"></div><textarea placeholder="描述你想要的图片"></textarea><div><button>图像</button><div role="button"><span id="video">视频</span></div><button>模型 Seedance 2.0 Mini</button><button id="ratio">16:9 · 10s</button><input type="file" accept="image/*" multiple hidden><button data-testid="chat_input_send_button" disabled>发送</button></div>
    <div id="menu"><button id="r16">16:9</button><label>时长<input type="range" min="4" max="15" value="10"></label></div></section>
    <script>const editor=document.querySelector('section textarea'),file=document.querySelector('[type=file]'),send=document.querySelector('[data-testid]');window.clicks=0;window.names=[];document.querySelector('#ai').onclick=()=>{document.querySelector('#chat').hidden=true;document.querySelector('section').hidden=false;history.pushState({},'', '/chat/create-image')};
    document.querySelector('#video').onclick=()=>editor.placeholder='描述你想要的视频';document.querySelector('#ratio').onclick=()=>{const m=document.querySelector('#menu');m.style.display=m.style.display==='block'?'none':'block'};
    file.onchange=()=>{window.names=[...file.files].map(f=>f.name);for(const f of file.files){const d=document.createElement('div'),img=document.createElement('img'),del=document.createElement('button');img.src=URL.createObjectURL(f);del.setAttribute('aria-label','删除参考图');del.textContent='×';d.append(img,del);document.querySelector('#uploads').append(d)}send.disabled=false};send.onclick=()=>{window.clicks++;window.sent=editor.value};</script>`;
    // Use a local protocol response with the expected origin, without contacting Doubao.
    await win.webContents.session.protocol.handle('https',()=>new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
    for(const variant of ['textarea','richtext-portal','delayed-mode-without-placeholder','mousedown-tab-sibling-attachments','lazy-hover-overflow']){
    if(variant==='richtext-portal'){
      html=html.replace('<textarea placeholder="描述你想要的图片"></textarea>','<div contenteditable="true" data-slate-editor="true" placeholder="描述你想要的图片" style="width:600px;min-height:100px"></div>')
        .replace("document.querySelector('section textarea')","document.querySelector('[contenteditable]')")
        .replace("editor.placeholder='描述你想要的视频'","editor.setAttribute('placeholder','描述你想要的视频')")
        .replace('window.sent=editor.value','window.sent=editor.innerText')
        .replace('<input type="file" accept="image/*" multiple hidden>','')
        .replace('</section>','</section><input type="file" accept="image/*" multiple hidden>')
        .replace('data-testid="chat_input_send_button"','id="flow-end-msg-send"')
        .replace("document.querySelector('[data-testid]')","document.querySelector('#flow-end-msg-send')");
    }
    if(variant==='delayed-mode-without-placeholder'){
      html=html.replace('模型 Seedance 2.0 Mini','模型 Seedream 4.5')
        .replace("editor.setAttribute('placeholder','描述你想要的视频')","setTimeout(()=>{[...document.querySelectorAll('button')].find(e=>e.textContent.startsWith('模型')).textContent='模型 Seedance 2.0 Mini'},800)");
    }
    if(variant==='mousedown-tab-sibling-attachments'){
      html=html.replace('id="uploads"','class="guidance-input-surface" id="uploads"').replace('<section hidden><div class="guidance-input-surface" id="uploads"></div>','<section hidden class="guidance-input-surface"><div id="uploads"></div><div>')
        .replace('</section>','</div></section>')
        .replace("document.querySelector('#video').onclick=", "document.querySelector('#video').onmousedown=")
        .replace("del.textContent='×'", "del.style.visibility='hidden';del.textContent='×'")
        .replace("window.clicks=0;", "window.fetch=()=>Promise.reject(Error('page CSP blocks data URL fetch'));window.clicks=0;");
    }
    await win.loadURL('https://www.doubao.com/chat/main');
    await win.webContents.executeJavaScript('globalThis.DirectorWatermark={ensure:async()=>({verified:true})};void 0');
    if(variant==='lazy-hover-overflow') await win.webContents.executeJavaScript(`(() => {
      document.querySelector('#video').setAttribute('aria-selected','true');
      const ratio=document.querySelector('#ratio'),toolbar=document.createElement('div');toolbar.className='bp5-overflow-list';
      ratio.before(toolbar);ratio.remove();
      const placeholder=document.createElement('button');placeholder.setAttribute('aria-hidden','false');toolbar.append(placeholder);
      placeholder.onmouseover=()=>setTimeout(()=>{
        const trigger=document.createElement('button');trigger.id='overflow';trigger.dataset.slot='dropdown-menu-trigger';
        trigger.onpointerdown=()=>{
          let portal=document.querySelector('#overflow-menu');
          if(portal){portal.remove();return;}
          portal=document.createElement('div');portal.id='overflow-menu';portal.setAttribute('role','menu');portal.setAttribute('aria-labelledby','overflow');portal.append(ratio);document.body.append(portal);
        };placeholder.replaceWith(trigger);
      },400);
    })()`);
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6k0AAAAASUVORK5CYII=';
    const job={id:'fixture-job',status:'prepared',settings:{automaticPage:true,autoSubmit:true},task:{prompt:'严格原台词：妈，今天一定要回来呀。',model:'Seedance 2.0 Mini',ratio:'16:9',duration:10,references:[{mediaId:'one',label:'参考图1_角色'},{mediaId:'two',label:'参考图2_场景'}]},bundle:{media:[{id:'one',dataUrl:png},{id:'two',dataUrl:png}]}};
    let navigated=false;
    const storage={activeJob:null,connection:{url:'http://127.0.0.1:1234',token:'fixture'}};
    const chrome={runtime:{getURL:()=>'',onMessage:{addListener(){}},onStartup:{addListener(){}}},action:{onClicked:{addListener(){}}},alarms:{create:async()=>{},clear:async()=>{},onAlarm:{addListener(){}}},tabs:{query:async()=>[{id:1,url:win.webContents.getURL(),active:true}],sendMessage:async()=>({ok:true})},storage:{local:{get:async keys=>Object.fromEntries(keys.map(k=>[k,structuredClone(storage[k])])),set:async values=>Object.assign(storage,structuredClone(values))}},scripting:{executeScript:async r=>[{result:await win.webContents.executeJavaScript('('+r.func.toString()+')(...'+JSON.stringify(r.args||[])+')')}]} };
    chrome.tabs.create=async({url})=>{assert.equal(url,'https://www.doubao.com/chat/create-image');await win.webContents.executeJavaScript("document.querySelector('#ai').click()");return {id:1,url};};
    const ctx=vm.createContext({chrome,URL,AbortSignal,Map,Date,configureWatermark,inspectComposer,configureVideo,prepareTask,readPageState,enterCreation,confirmVideo,probeResult,readLoginState,labelAccount,fetch:async url=>Response.json(url.endsWith('/next')?{job:navigated?job:null,waiting:!navigated,settings:job.settings,enabled:true,paused:false}:{ok:true})});
    vm.runInContext((await fs.readFile(new URL('../browser-extension/background.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'')+'\nglobalThis.runPreparation=prepareCurrent;globalThis.runPoll=poll;',ctx);
    await win.webContents.executeJavaScript("document.querySelector('#chat textarea').value='保留草稿'");await ctx.runPoll();assert.equal(new URL(win.webContents.getURL()).pathname,'/chat/main','preserve an unsent draft');
    await win.webContents.executeJavaScript("document.querySelector('#chat textarea').value=''");
    if(variant==='lazy-hover-overflow')await win.webContents.executeJavaScript("document.querySelector('#ai').textContent='创作入口已折叠'");
    await ctx.runPoll();assert.equal(new URL(win.webContents.getURL()).pathname,'/chat/create-image','queued task navigates before video controls exist');navigated=true;
    await ctx.runPoll();const result={ok:(await win.webContents.executeJavaScript('window.clicks'))===1,error:storage.bridgeStatus};if(!result.ok)console.log(await win.webContents.executeJavaScript('({body:document.body.innerText,probe:globalThis.__directorInspectComposer?.({automaticPage:true}),controls:[...document.querySelectorAll("button")].map(e=>({text:e.innerText,rect:e.getClientRects().length}))})'));assert.equal(result.ok,true,result.error);
    const state=await win.webContents.executeJavaScript('({clicks,names,sent})');
    assert.equal(state.clicks,1);assert.equal(state.sent,job.task.prompt);assert.deepEqual(state.names,['参考图1_角色.png','参考图2_场景.png']);
    await ctx.runPreparation(job,1);assert.equal(await win.webContents.executeJavaScript('window.clicks'),1,'repeating preparation cannot click generate twice');
    await win.webContents.executeJavaScript('globalThis.__directorUploadActivity={active:1}');
    const uploading=await win.webContents.executeJavaScript('globalThis.__directorInspectComposer({automaticPage:true})');
    assert.equal(uploading.canSend,false,'active reference upload must block submission');
    console.log('Fixture:',variant);
    }
    html=`<!doctype html><div data-message-id="u">本条分镜 10 秒</div><div data-message-id="a"><div data-streaming="false">确认后我再开始生成视频。</div></div><div contenteditable="true"></div><button id="flow-end-msg-send" disabled>发送</button><script>window.clicks=0;document.querySelector('[contenteditable]').oninput=()=>document.querySelector('button').disabled=false;document.querySelector('button').onclick=()=>{window.clicks++;window.sent=document.querySelector('[contenteditable]').innerText;const m=document.createElement('div');m.dataset.messageId='confirmation';m.textContent='正在处理视频';document.body.append(m);document.querySelector('[contenteditable]').innerText=''}</script>`;
    await win.loadURL('https://www.doubao.com/chat/123');
    const confirmedJob={task:{prompt:'本条分镜10秒'}};
    const confirm=phase=>win.webContents.executeJavaScript('('+confirmVideo.toString()+')('+JSON.stringify(confirmedJob)+','+JSON.stringify(phase)+')');
    assert.equal((await confirm('probe')).needed,true);
    assert.equal((await win.webContents.executeJavaScript('('+confirmVideo.toString()+')({task:{prompt:"另一个项目"}})')).needed,false);
    await confirm('prepare');await confirm('submit');assert.equal(await win.webContents.executeJavaScript('window.clicks'),1);
    assert.equal((await confirm('probe')).needed,false,'new response cannot trigger the old confirmation again');
    console.log('PASS real Chromium ordinary chat→queued navigation→video/model/aspect/duration→ordered file upload→exact prompt→one automatic submit; scoped confirmation continuation. No external generation.');
    win.destroy();app.exit(0);
  }catch(error){console.error(error);win.destroy();app.exit(1);}
});
