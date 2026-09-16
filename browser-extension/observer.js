(() => {
  if(window.__directorObserver)return;window.__directorObserver=true;
  window.__directorObserverBuild='0.13.5';
  const nativeFetch=window.fetch.bind(window),parse=JSON.parse.bind(JSON);
  let armed=null,pendingPlayback=null;const resolved=new Set(),recoveries=new Set();
  const send=(type,data)=>window.postMessage({channel:'director-doubao-v2',type,...data},location.origin);
  let activeUploads=0;
  const binaryBody=body=>(typeof Blob!=='undefined'&&body instanceof Blob)||(typeof FormData!=='undefined'&&body instanceof FormData)||(typeof ArrayBuffer!=='undefined'&&(body instanceof ArrayBuffer||ArrayBuffer.isView(body)));
  const trackUpload=body=>{
    if(!binaryBody(body))return ()=>{};
    activeUploads++;send('uploadActivity',{active:activeUploads});let ended=false;
    return ()=>{if(ended)return;ended=true;activeUploads=Math.max(0,activeUploads-1);send('uploadActivity',{active:activeUploads});};
  };
  window.addEventListener('message',e=>{
    if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='director-doubao-control')return;
    if(e.data.type==='arm')armed=e.data.job?.status==='prepared'?e.data.job:null;
    if(e.data.type==='resolveVideo'&&e.data.job?.requestId&&e.data.job.url===location.href){
      const j=e.data.job;
      if(globalThis.DirectorWatermark&&/^[-\w]{1,150}$/.test(j.videoId||'')){
        void resolveOfficial(j);return;
      }
      if(/^[-\w]{1,150}$/.test(j.videoId||'')){
        void nativeFetch('/samantha/media/get_play_info?aid=497858&device_platform=web&samantha_web=1&use-olympus-account=1&version_code=20800&pkg_type=release_version&web_tab_id='+crypto.randomUUID(),{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({key:j.videoId,type:'video'})})
          .then(r=>r.json()).then(value=>{
            if(value.code!==0)throw Error('播放信息接口返回 '+value.code);
            const payload={...value.data,vid:j.videoId,message_id:j.messageId};
            const found=DirectorMedia.extract(payload);
            if(!found.media.some(m=>m.kind==='video')&&!found.blocked?.length)throw Error('播放接口没有返回可识别的视频下载地址');
            harvest(payload,j.requestId);
          }).catch(error=>send('failed',{jobId:j.id,requestId:j.requestId,error:'原视频取回失败：'+error.message}));
      }else pendingPlayback={...j,at:Date.now()};
    }
    if(e.data.type==='recover'){
      const j=e.data.job;
      if(!j?.id||!j.recoveryKey||!j.requestId||!/^[-\w]{1,150}$/.test(j.videoId||'')||recoveries.has(j.recoveryKey))return;
      recoveries.add(j.recoveryKey);
      if(globalThis.DirectorWatermark){void resolveOfficial(j);return;}
      // Query only the stored video identity. This endpoint fetches playback
      // metadata; never replay the generation request during result recovery.
      void nativeFetch('/samantha/media/get_play_info?aid=497858&device_platform=web&samantha_web=1&use-olympus-account=1&version_code=20800&pkg_type=release_version&web_tab_id='+crypto.randomUUID(),{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({key:j.videoId,type:'video'})})
        .then(r=>r.json()).then(value=>{
          const found=value.code===0?DirectorMedia.extract({...value.data,vid:j.videoId,message_id:j.messageId}):null;
          if(found?.blocked?.length&&!found.media.some(m=>m.kind==='video')){send('harvest',{...found,requestId:j.requestId});return;}
          if(!found?.media.some(m=>m.kind==='video'&&m.original&&m.videoId===j.videoId))throw Error('未返回该视频的原始链接，请确认当前账号登录及原任务状态后重取');
          send('harvest',{...found,requestId:j.requestId});
        }).catch(error=>send('failed',{jobId:j.id,requestId:j.requestId,error:'重新获取失败：'+error.message}));
    }
  });
  async function resolveOfficial(j){
    try {
      const media=await globalThis.DirectorWatermark.resolve(j.videoId,j.messageId);
      send('harvest',{media:[media],identities:[{videoId:j.videoId,messageId:j.messageId}],blocked:[],requestId:j.requestId});
    }catch(error){send('failed',{jobId:j.id,requestId:j.requestId,error:'官方去水印视频取回失败：'+error.message});}
  }
  function harvest(value,requestId=''){
    const result=DirectorMedia.extract(value);if(result.media.length||result.identities.length||result.blocked?.length)send('harvest',{...result,...(globalThis.DirectorWatermark?{media:result.media.filter(m=>m.kind!=='video'),blocked:[]}:{}),requestId});
    for(const item of result.identities){
      if(!requestId||resolved.has(item.videoId))continue;resolved.add(item.videoId);
      if(globalThis.DirectorWatermark){
        void globalThis.DirectorWatermark.resolve(item.videoId,item.messageId).then(media=>send('harvest',{media:[media],identities:[item],blocked:[],requestId})).catch(()=>resolved.delete(item.videoId));
        continue;
      }
      // Read only the authenticated account's original playback information.
      void nativeFetch('/samantha/media/get_play_info?aid=497858&device_platform=web&samantha_web=1&use-olympus-account=1&version_code=20800&pkg_type=release_version&web_tab_id='+crypto.randomUUID(),{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({key:item.videoId,type:'video'})}).then(r=>r.json()).then(j=>{if(j.code===0)harvest({...j.data,vid:item.videoId,message_id:item.messageId},requestId);else resolved.delete(item.videoId);}).catch(()=>resolved.delete(item.videoId));
    }
  }
  async function consume(response,id){
    const ct=response.headers.get('content-type')||'';
    if(ct.includes('application/json')){const text=await response.text();if(text.length<10000000)harvest(parse(text),id);return;}
    if(!ct.includes('text/event-stream')||!response.body)return;
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    try{while(true){const r=await reader.read();if(r.done)break;buffer+=decoder.decode(r.value,{stream:true});if(buffer.length>2000000){buffer='';continue;}let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(line.startsWith('data:'))try{harvest(parse(line.slice(5).trim()),id);}catch{}}}}finally{reader.releaseLock();}
  }
  function matches(body,prompt){let found=false,video=false,nodes=0;const inspect=(n,depth=0)=>{if(depth>20||++nodes>20000)return;if(typeof n==='string'){if(n.includes(prompt))found=true;else if(/^[\[{]/.test(n))try{inspect(parse(n),depth+1);}catch{}}else if(n&&typeof n==='object'){if(Number(n.chat_ability?.ability_type)===17)video=true;Object.values(n).forEach(v=>inspect(v,depth+1));}};try{inspect(parse(body));}catch{}return found&&video;}
  function takePlayback(href,body){
    if(!pendingPlayback||Date.now()-pendingPlayback.at>=30000||pendingPlayback.url!==location.href)return null;
    try{
      const u=new URL(href,location.href),data=parse(body);
      if(u.origin!==location.origin)return null;
      const vid=u.pathname==='/samantha/video/get_play_info'?data.vid:
        u.pathname==='/samantha/media/get_play_info'&&data.type==='video'?data.key:null;
      if(!/^[-\w]{1,150}$/.test(vid||''))return null;
      const playback={...pendingPlayback,vid};pendingPlayback=null;return playback;
    }catch{return null;}
  }
  window.fetch=async function(input,init){
    const href=typeof input==='string'?input:input instanceof URL?input.href:input?.url;
    const same=(()=>{try{return new URL(href,location.href).origin===location.origin;}catch{return false;}})();
    let body=init?.body;
    if(same&&!body&&input instanceof Request&&input.method==='POST')try{body=await input.clone().text();}catch{}
    const playback=takePlayback(href,body);
    const continuation=armed?.continuation===true&&armed.url===location.href&&!!armed.requestId;
    const task=armed&&same&&typeof body==='string'&&(matches(body,armed.prompt)||(continuation&&body.includes(armed.prompt)))?{...armed,requestId:continuation?armed.requestId:crypto.randomUUID()}:null;
    // Forward the original request once, without modifying durations or retrying generation.
    let response;const finishUpload=trackUpload(init?.body);
    try{response=await nativeFetch(input,init);}catch(error){if(task)send('failed',{jobId:task.id,requestId:task.requestId,error:'生成提交网络错误，请核对网站任务后重试'});throw error;}finally{finishUpload();}
    if(task){send(response.ok?'submitted':'failed',{jobId:task.id,requestId:task.requestId,error:response.ok?'':`豆包提交返回 HTTP ${response.status}`});if(response.ok)armed=null;}
    if(same){
      if(playback&&response.ok)void response.clone().json().then(value=>{
        if(value.code===0)harvest({...value.data,vid:playback.vid,message_id:playback.messageId},playback.requestId);
      }).catch(()=>{});
      void consume(response.clone(),task?.requestId||'').catch(()=>{});
      // Response.json uses the browser parser, bypassing the JSON.parse hook.
      const nativeJSON=response.json.bind(response);
      response.json=async()=>{const value=await nativeJSON();try{DirectorMedia.preferRawImages(value);}catch{}return value;};
    }
    return response;
  };
  const originalParse=JSON.parse;
  JSON.parse=function(...args){const value=originalParse.apply(this,args);try{if(value&&typeof value==='object'){harvest(value);DirectorMedia.preferRawImages(value);}}catch{}return value;};
  const open=XMLHttpRequest.prototype.open,sendXHR=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(method,url,...rest){this.__directorURL=url;return open.call(this,method,url,...rest);};
  XMLHttpRequest.prototype.send=function(body){
    const finishUpload=trackUpload(body),playback=takePlayback(this.__directorURL,body);
    this.addEventListener('loadend',finishUpload,{once:true});
    this.addEventListener('load',()=>{try{if(new URL(this.__directorURL,location.href).origin===location.origin&&typeof this.responseText==='string'){
      const value=parse(this.responseText);harvest(value);
      if(playback&&value.code===0)harvest({...value.data,vid:playback.vid,message_id:playback.messageId},playback.requestId);
    }}catch{}});try{return sendXHR.call(this,body);}catch(error){finishUpload();throw error;}
  };
})();
