import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const {allowedMedia}=createRequire(import.meta.url)('../desktop/doubao-manager.cjs');
const context=vm.createContext({URL,atob});
vm.runInContext(await fs.readFile('browser-extension/media-extractor.js','utf8'),context);
const extract=value=>context.DirectorMedia.extract(value);
const signed='https://v9-videoweb.doubao.com/video/path?sig=a%2fb%2Bz&lr=video_gen_watermark_dyn&download=true';
const clean=signed.replace('video_gen_watermark_dyn','video_gen_no_watermark');
let result=extract({vid:'video-a',original_media_info:{main_url:btoa(signed)}});
assert.equal(result.media.length,0);assert.equal(result.blocked[0].videoId,'video-a');
assert.throws(()=>allowedMedia(signed),/水印/);
assert.equal(allowedMedia(clean),clean,'explicit clean URLs keep signature encoding intact');
const images={creations:[{image:{image_ori_raw:{url:'https://test.byteimg.com/raw-a.png'},image_ori:{original_url:'https://test.byteimg.com/display-a.png'},image_preview:{original_url:'https://test.byteimg.com/preview-a.png'},original_url:'https://test.byteimg.com/other-a.png'}},{image:{image_ori_raw:{url:'https://test.byteimg.com/raw-b.png'}}}]};
const before=JSON.stringify(images);result=extract({payload:JSON.stringify(images)});
assert.equal(JSON.stringify(images),before,'does not rewrite the provider page data');
assert.equal(result.media.length,2);assert(result.media.every(m=>m.kind==='image'&&m.source==='image_ori_raw'));
assert(result.media.every(m=>/raw-[ab]\.png$/.test(m.url)),'preview/original-display variants do not override raw images');
result=extract({vid:'video-b',original_url:'https://test.byteimg.com/fallback.mp4',no_watermark_url:'https://test.byteimg.com/clean.mp4'});
assert.equal(result.media[0].source,'no_watermark_url','explicit clean variant wins over generic original_url');
for(const url of ['https://v9-videoweb.doubao.com/a?lr=unknown_watermark','https://other.byteimg.com/a?lr=video_gen_watermark_dyn','https://test.byteimg.com/a?watermark=1']){
 assert.equal(extract({vid:'v',original_media_info:{main_url:url}}).media.length,0);
 assert.throws(()=>allowedMedia(url),/水印/);
}
assert.equal(extract({vid:'v',original_media_info:{has_watermark:true,main_url:clean}}).media.length,0);
assert.equal(extract({image:{image_ori_raw:{url:'https://test.byteimg.com/a~tplv-watermark.png'}}}).media.length,0);
assert.equal(extract({play_url:signed}).media.length,0,'unknown playback field alone never qualifies');
assert.throws(()=>allowedMedia('https://v9-videoweb.doubao.com.evil.example/a?lr=video_gen_watermark_dyn'));
// Both the manual download boundary and helper apply the same narrow rule.
const chrome={runtime:{getURL:()=>'',onMessage:{addListener(){}},onStartup:{addListener(){}}},action:{onClicked:{addListener(){}}},alarms:{onAlarm:{addListener(){}}},tabs:{}};
const worker=vm.createContext({chrome,URL,Map,Set});
vm.runInContext((await fs.readFile('browser-extension/background.js','utf8')).replace(/^import .*;\r?\n/gm,'')+'\nglobalThis.normalize=mediaURL;',worker);
assert.throws(()=>worker.normalize(signed),/水印/);assert.equal(worker.normalize(clean),clean);
assert.throws(()=>worker.normalize('https://test.byteimg.com/a?wm=1'),/水印/);
const display={creations:[{image:{has_watermark:true,image_ori_raw:{url:'https://test.byteimg.com/raw.png'},image_ori:{url:'https://test.byteimg.com/marked.png',width:100},image_preview:{url:'https://test.byteimg.com/thumb.png'}}}],prompt:'不改变用户的提示词',duration:10};
assert.equal(extract(display).media[0].url,'https://test.byteimg.com/raw.png','display flags do not hide independent raw image');
const wrapped={content:JSON.stringify(display)};context.DirectorMedia.preferRawImages(wrapped);
const patched=JSON.parse(wrapped.content);assert.equal(patched.creations[0].image.image_ori.url,'https://test.byteimg.com/raw.png');assert.equal(patched.creations[0].image.image_preview.url,'https://test.byteimg.com/raw.png');assert.equal(patched.creations[0].image.image_ori.width,100);assert.equal(patched.prompt,display.prompt);assert.equal(patched.duration,10);
const once=JSON.stringify(wrapped);context.DirectorMedia.preferRawImages(wrapped);assert.equal(JSON.stringify(wrapped),once,'patch is idempotent');
const unsafe={creations:[{image:{image_ori_raw:{url:'https://evil.example/raw.png'},image_ori:{url:'https://test.byteimg.com/view.png'}}}]};context.DirectorMedia.preferRawImages(unsafe);assert.equal(unsafe.creations[0].image.image_ori.url,'https://test.byteimg.com/view.png');
console.log('PASS raw-image preference, unmodified JSON, nested/Base64 responses, marked-video rejection, signature preservation, variant priority and identical manual/helper boundaries.');

// Native fetch JSON consumers also receive raw variants without request edits.
const requestCalls=[];
const win={addEventListener(){},postMessage(){},fetch:async(...args)=>{requestCalls.push(args);return Response.json(display);}};
class XHR{open(){}send(){}addEventListener(){}}
const ctx=vm.createContext({window:win,location:{origin:'https://www.doubao.com',href:'https://www.doubao.com/chat/create-image'},URL,atob,Request,Blob,FormData,ArrayBuffer,XMLHttpRequest:XHR,TextDecoder});
vm.runInContext(await fs.readFile('browser-extension/media-extractor.js','utf8'),ctx);
vm.runInContext(await fs.readFile('browser-extension/observer.js','utf8'),ctx);
const init={method:'POST',body:'unchanged'};
const response=await win.fetch('/image-history',init); const fetchPatched=await response.json();
assert.equal(fetchPatched.creations[0].image.image_ori.url,'https://test.byteimg.com/raw.png');
assert.equal(requestCalls[0][1],init);assert.equal(response.bodyUsed,true);
const external=await (await win.fetch('https://example.com/other')).json();
assert.equal(external.creations[0].image.image_ori.url,'https://test.byteimg.com/marked.png');
console.log('PASS same-origin native Response.json raw-image patch, unchanged requests and untouched external responses.');
