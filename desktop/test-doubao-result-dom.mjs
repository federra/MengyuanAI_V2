import {app,BrowserWindow} from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {probeResult} from '../browser-extension/probe-result.js';
import {readGenerationProgress} from '../browser-extension/generation-progress.js';
import {confirmVideo} from '../browser-extension/confirm-video.js';
app.setPath('userData',await fs.mkdtemp(path.join(os.tmpdir(),'director-result-dom-')));
app.whenReady().then(async()=>{
setTimeout(()=>{console.error('Result DOM test timed out');app.exit(1);},45000).unref();
const win=new BrowserWindow({show:false,webPreferences:{sandbox:true}});
let html='';
try{
 await win.webContents.session.protocol.handle('https',()=>new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
 const prompt='这是本条分镜的提示词，请使用参考图生成十秒视频。';
 const progress='本次使用 Seedance 2.0 Mini 生成，预计等待 5 分钟。视频生成好后，我会主动发送给你。本次生成将消耗每日免费额度。';
 const job={id:'task',requestId:'request',conversationUrl:'https://www.doubao.com/chat/123',task:{prompt},progressMessage:progress,generationAcceptedAt:1};
 const call=(func,j=job,extra=false)=>win.webContents.executeJavaScript(`(${func.toString()})(${JSON.stringify(j)},${JSON.stringify(extra)})`);
 for(const ids of [true,false,'mixed']){
   const message=(id,text)=>`<article ${ids&&!(ids==='mixed'&&id==='result')?`data-message-id="${id}"`:''}>${text}</article>`;
   const card=message('result','<p>你的视频生成好了。</p><div><button aria-label="播放视频" onclick="window.played++">播放</button></div>');
   html=`${message('user',prompt)}${message('progress',`<p>${progress}</p>`)}${card}<textarea></textarea><script>window.played=0</script>`;
   await win.loadURL(job.conversationUrl);
   assert.equal((await call(probeResult)).url,job.conversationUrl,`result with message IDs ${ids}`);
   assert.equal((await call(probeResult,{...job,generationAcceptedAt:undefined,progressMessage:''})).url,job.conversationUrl,'fast result can match the original prompt without a waiting acknowledgement');
   await call(probeResult,job,true);assert.equal(await win.webContents.executeJavaScript('window.played'),1);
   assert.equal(await call(probeResult,{...job,conversationUrl:'https://www.doubao.com/chat/456'}),null,'never harvest another conversation');
   assert.equal(await call(probeResult,{...job,task:{prompt:'完全不同的一条分镜提示词'},progressMessage:'另一条生成记录，这段文字足够长但不属于页面中这条任务的确认信息',generationMessageId:'wrong'}),null,'must match a task anchor');
   if(!ids){
     html+=card;await win.loadURL(job.conversationUrl);assert.equal(await call(probeResult),null,'ambiguous cards cannot select a random video');
   }
   html=message('user',prompt)+message('progress',`<p>${progress}</p>`);
   await win.loadURL(job.conversationUrl);
   const waiting=await call(readGenerationProgress);assert.equal(waiting.model,'Seedance 2.0 Mini');
   html=message('user',prompt)+message('error','<p>视频生成失败，请重试。</p>');await win.loadURL(job.conversationUrl);
   assert.equal((await call(readGenerationProgress)).failed,true,'only the scoped result reports failure');
   html=message('old','<p>视频生成失败，请重试。</p>')+message('user',prompt)+message('progress',`<p>${progress}</p>`);await win.loadURL(job.conversationUrl);
   assert.equal((await call(readGenerationProgress)).failed,undefined,'an old failure cannot fail the current task');
   html=message('user',prompt)+message('ask','<p>确认后我再开始生成视频。</p>')+'<textarea></textarea>';
   await win.loadURL(job.conversationUrl);assert.equal((await call(confirmVideo,job,'probe')).needed,true);
   html+=message('progress',`<p>${progress}</p>`);await win.loadURL(job.conversationUrl);assert.equal((await call(confirmVideo,job,'probe')).needed,false,'do not repeat an old confirmation');
 }
 console.log('PASS real Chromium result/progress/confirmation detection with and without message IDs, exact conversation+text anchoring, ambiguous video rejection, historical failure isolation and single playback. No external generation.');
 win.destroy();app.exit(0);
}catch(error){console.error(error);win.destroy();app.exit(1);}
});
