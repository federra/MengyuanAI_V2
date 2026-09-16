import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile('browser-extension/watermark-policy.js','utf8');
let enabled=false,failSave=false,replyFlag=true,wrongVideo=false,preset='video_gen_watermark_unpaid';const calls=[];
const ctx=vm.createContext({location:{origin:'https://www.doubao.com'},URL,AbortSignal,fetch:async(path,init)=>{
 calls.push({path,body:JSON.parse(init.body)});
 if(path==='/creativity/user_config/get')return Response.json({code:0,data:{config_map:{1:{watermark_option:{is_on:enabled}}}}});
 if(path==='/creativity/user_config/set'){if(!failSave)enabled=true;return Response.json({code:0});}
 if(path==='/creativity/resource/get_without_watermark')return Response.json({code:0,data:{without_watermark:replyFlag,download_video:{v1:{vid:wrongVideo?'other':'v1',download_url:`https://v26-vdl.doubao.com/video.mp4?sig=a%2fb&lr=${preset}`}}}});
 throw Error('Unexpected request '+path);
}});
vm.runInContext(source,ctx);const api=ctx.DirectorWatermark;
await api.ensure();assert(enabled);assert.deepEqual(calls.map(c=>c.path),['/creativity/user_config/get','/creativity/user_config/set','/creativity/user_config/get']);assert.deepEqual(calls[1].body,{config_type:1,config_value:{watermark_option:{is_on:true}}});
calls.length=0;await api.ensure();assert.equal(calls.length,1,'already enabled must not toggle');
const video=await api.resolve('v1','m1');assert.equal(video.videoId,'v1');assert.equal(video.aiWatermarkRemoved,true);assert.equal(video.brandWatermark,true);assert.match(video.url,/sig=a%2fb&lr=video_gen_watermark_unpaid$/);
replyFlag=false;await assert.rejects(api.resolve('v1','m1'),/未确认/);replyFlag=true;
wrongVideo=true;await assert.rejects(api.resolve('v1','m1'),/匹配/);wrongVideo=false;
preset='video_gen_watermark_dyn';await assert.rejects(api.resolve('v1','m1'),/水印/);
enabled=false;failSave=true;await assert.rejects(api.ensure(),/未生效/);
assert(calls.every(c=>!c.path.includes('chat/completion')),'never regenerates');
ctx.location.origin='https://example.com';await assert.rejects(api.ensure(),/豆包/);
console.log('PASS official watermark setting, readback, exact video, unchanged signature, AI/brand distinction and failure guards');

// Official creation UI treats an absent preference as its initial off state.
for (const initial of [{},{config_map:{}},{config_map:{1:{}}},{config_map:{1:{watermark_option:{}}}}]) {
 let stored=false;const requests=[];
 const fresh=vm.createContext({location:{origin:'https://www.doubao.com'},URL,AbortSignal,fetch:async(path,init)=>{
  requests.push(path);
  if(path.endsWith('/set')){stored=true;return Response.json({code:0});}
  return Response.json({code:0,data:stored?{config_map:{1:{watermark_option:{is_on:true}}}}:initial});
 }});
 vm.runInContext(source,fresh);
 assert.equal((await fresh.DirectorWatermark.ensure()).verified,true);
 assert.deepEqual(requests,['/creativity/user_config/get','/creativity/user_config/set','/creativity/user_config/get']);
}
console.log('PASS unset official watermark preference initializes and verifies through readback.');
for (const data of [null, {config_map:null}, {config_map:[]}, {config_map:{1:null}}, {config_map:{1:{watermark_option:[]}}}, {config_map:{1:{watermark_option:{is_on:'false'}}}}]) {
 let writes=0;
 const malformed=vm.createContext({location:{origin:'https://www.doubao.com'},URL,AbortSignal,fetch:async(path)=>{if(path.endsWith('/set'))writes++;return Response.json({code:0,data});}});
 vm.runInContext(source,malformed);await assert.rejects(malformed.DirectorWatermark.ensure());assert.equal(writes,0);
}
const neverSaved=vm.createContext({location:{origin:'https://www.doubao.com'},URL,AbortSignal,fetch:async()=>Response.json({code:0,data:{config_map:{}}})});
vm.runInContext(source,neverSaved);await assert.rejects(neverSaved.DirectorWatermark.ensure(),/未生效/);
console.log('PASS malformed preference and unconfirmed initialization never pass generation guard.');
