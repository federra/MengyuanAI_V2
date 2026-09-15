import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const calls=[],messages=[];let receive,fail=false;
const win={addEventListener:(_type,fn)=>{receive=fn;},postMessage:msg=>messages.push(msg),fetch:async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body)});
  return Response.json(fail?{code:1}:{code:0,data:{original_media_info:{main_url:'https://test.byteimg.com/original.mp4'}}});
}};
class XHR {open(){} send(){} addEventListener(){}}
const ctx=vm.createContext({window:win,location:{origin:'https://www.doubao.com',href:'https://www.doubao.com/chat/create-image'},URL,atob,Request,XMLHttpRequest:XHR,TextDecoder,crypto:{randomUUID:()=> 'read-only-test'},console});
vm.runInContext(await fs.readFile('browser-extension/media-extractor.js','utf8'),ctx);
vm.runInContext(await fs.readFile('browser-extension/observer.js','utf8'),ctx);
const job={id:'job-1',videoId:'video-1',requestId:'original-request',recoveryKey:'attempt-1'};
const recover=(j,origin='https://www.doubao.com')=>receive({source:win,origin,data:{channel:'director-doubao-control',type:'recover',job:j}});
const settle=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));};
recover(job,'https://other.example');assert.equal(calls.length,0);
recover({...job,videoId:'../../another'});assert.equal(calls.length,0);
recover(job);recover(job);await settle();assert.equal(calls.length,1,'polling cannot repeat the same recovery');
assert.deepEqual(calls[0].body,{key:'video-1',type:'video'});
assert(calls[0].url.startsWith('/samantha/media/get_play_info?'),'only playback metadata is requested, never generation');
const found=messages.find(m=>m.type==='harvest'&&m.requestId==='original-request');
assert.equal(found.media[0].videoId,'video-1');assert.equal(found.media[0].original,true);
fail=true;recover({...job,recoveryKey:'attempt-2'});await settle();assert(messages.some(m=>m.type==='failed'&&m.jobId==='job-1'));
fail=false;recover({...job,recoveryKey:'attempt-3'});await settle();assert.equal(calls.length,3,'explicit retry can recover after an expired/login error');
assert(calls.every(c=>c.body.key==='video-1'&&!c.body.prompt));
console.log('PASS stored-video recovery, read-only playback query, exact identity, duplicate prevention, origin checks, failure and explicit retry.');
