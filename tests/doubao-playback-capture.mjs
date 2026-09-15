import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile('browser-extension/observer.js','utf8');
const media=await fs.readFile('browser-extension/media-extractor.js','utf8');
for(const transport of ['fetch','xhr'])for(const endpoint of ['video','media']){
  const messages=[],calls=[];let receive;
  const value={code:0,data:{original_media_info:{main_url:'https://test.byteimg.com/original.mp4'}}};
  class XHR{listeners={};open(_method,url){this.url=url;}addEventListener(type,fn){this.listeners[type]=fn;}send(){calls.push(this.url);this.responseText=JSON.stringify(value);this.listeners.load?.();this.listeners.loadend?.();}}
  const win={addEventListener:(_type,fn)=>receive=fn,postMessage:m=>messages.push(m),fetch:async(url)=>{calls.push(url);return Response.json(value);}};
  const location={origin:'https://www.doubao.com',href:'https://www.doubao.com/chat/123'};
  const ctx=vm.createContext({window:win,location,URL,Request,XMLHttpRequest:XHR,TextDecoder,crypto:{randomUUID:()=> 'read-only'},atob,console});
  vm.runInContext(media,ctx);vm.runInContext(source,ctx);
  const arm=()=>receive({source:win,origin:location.origin,data:{channel:'director-doubao-control',type:'resolveVideo',job:{id:'job',requestId:'request',url:location.href,messageId:'result'}}});
  const send=async(url,body)=>{if(transport==='fetch')await win.fetch(url,{method:'POST',body:JSON.stringify(body)});else{const x=new XHR();x.open('POST',url);x.send(JSON.stringify(body));}await new Promise(r=>setTimeout(r,20));};
  const path=`/samantha/${endpoint}/get_play_info`,body=endpoint==='video'?{vid:'vid-123'}:{key:'vid-123',type:'video'};
  arm();await send('https://example.com'+path,body);assert(!messages.some(m=>m.requestId==='request'));
  arm();location.href='https://www.doubao.com/chat/456';await send(path,body);assert(!messages.some(m=>m.requestId==='request'),'navigation invalidates pending playback');
  location.href='https://www.doubao.com/chat/123';arm();await send(path,body);
  const found=messages.find(m=>m.requestId==='request'&&m.media?.some(v=>v.videoId==='vid-123'));
  assert(found,`${transport}/${endpoint} must associate original playback with the pending task`);
  assert(calls.every(url=>url.includes('get_play_info')),'never submits generation');
}
console.log('PASS fetch/XHR playback capture for both endpoints, request association, navigation and origin guards.');
