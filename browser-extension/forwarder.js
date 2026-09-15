(() => {
  let job=null,settings=null,baseline='',lastFailure='',rendered=new Set(),rawImages=[];
  const request=data=>chrome.runtime.sendMessage(data).catch(()=>{});
  window.addEventListener('message',e=>{
    if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='director-doubao-v2')return;
    const {type,media,identities,blocked,requestId,jobId,error}=e.data;
    if(type==='uploadActivity'){const active=Number(e.data.active);if(Number.isSafeInteger(active)&&active>=0)globalThis.__directorUploadActivity={active,at:Date.now()};return;}
    if(type==='harvest'){void request({type:'harvest',media,identities,blocked,requestId});for(const m of media||[])if(m.original&&!rendered.has(m.url)){rendered.add(m.url);showDownload(m);}}
    else if(['submitted','failed'].includes(type))void request({type:'event',event:{type,jobId,requestId,error}});
  });
  function showDownload(m){
    if(!document.body){setTimeout(()=>showDownload(m),500);return;}
    let panel=document.getElementById('director-original-downloads');
    if(!panel){panel=document.createElement('details');panel.id='director-original-downloads';panel.style.cssText='position:fixed;right:20px;bottom:20px;z-index:2147483647;max-width:300px;max-height:45vh;overflow:auto;background:white;color:#183154;padding:12px;border:1px solid #c4d6f3;border-radius:12px;box-shadow:0 6px 24px #1233;font:13px system-ui';const title=document.createElement('summary');title.textContent='导演助手 · 原始文件下载';panel.append(title);document.body.append(panel);}
    const item=document.createElement('div');
    if(m.kind==='image'){
      rawImages.push(m);
      if(!panel.querySelector('[data-director-download-images]')){
        const all=document.createElement('button');all.dataset.directorDownloadImages='true';all.textContent='批量下载已识别原图';all.style.cssText='display:block;margin:8px 0;padding:8px';
        all.onclick=async()=>{
          all.disabled=true;const batch=[...rawImages];let success=0;
          for(const media of batch){const result=await request({type:'downloadOriginal',media});if(result?.ok)success++;all.textContent=`已提交下载 ${success}/${batch.length}`;}
          if(success!==batch.length)all.textContent+= '，部分失败，可重试';
          all.disabled=false;
        };panel.append(all);
      }
      const preview=document.createElement('img');preview.src=m.url;preview.alt='原始图片预览';preview.loading='lazy';preview.referrerPolicy='no-referrer';preview.style.cssText='display:block;width:120px;max-height:120px;object-fit:contain;margin-top:10px';item.append(preview);
    }
    const b=document.createElement('button');b.textContent=`下载${m.kind==='image'?'原始图片':'原始视频'} ${rendered.size}`;b.style.cssText='display:block;padding:8px;margin-top:8px;background:#edf4ff;color:#1857ad;border:1px solid #c4d6f3;border-radius:6px;cursor:pointer';b.onclick=async()=>{b.disabled=true;const r=await request({type:'downloadOriginal',media:m});b.textContent=r?.ok?'已开始下载':r?.error||'下载失败';b.disabled=false;};item.append(b);panel.append(item);
  }
  chrome.runtime.onMessage.addListener((message,_sender,reply)=>{
    if(message.type==='probeVideo'&&message.job?.requestId&&message.url===location.href){
      window.postMessage({channel:'director-doubao-control',type:'resolveVideo',job:{id:message.job.id,requestId:message.job.requestId,messageId:message.messageId,url:message.url,videoId:message.videoId}},location.origin);reply({ok:true});return;
    }
    if(message.type==='confirmVideo'&&message.job?.status==='submitted'&&message.url===location.href){
      window.postMessage({channel:'director-doubao-control',type:'arm',job:{id:message.job.id,prompt:message.prompt,status:'prepared',requestId:message.job.requestId,continuation:true,url:message.url}},location.origin);reply({ok:true});return;
    }
    if(message.type==='arm'){
      const changed=job?.id!==message.job.id||job?.recoveryKey!==message.job.recoveryKey;job=message.job;settings=message.settings;if(changed){baseline=regionText();lastFailure='';}
      window.postMessage({channel:'director-doubao-control',type:'arm',job:{id:job.id,prompt:job.task.prompt,status:job.status}},location.origin);
      if(job.status==='submitted'&&job.recoveryKey&&job.videoId)window.postMessage({channel:'director-doubao-control',type:'recover',job:{id:job.id,videoId:job.videoId,messageId:job.messageId,requestId:job.requestId,recoveryKey:job.recoveryKey}},location.origin);
      reply({ok:true});
    }
  });
  function regionText(){try{return settings?.resultSelector?document.querySelector(settings.resultSelector)?.innerText||'':'';}catch{return '';}}
  setInterval(()=>{
    if(!job||!settings)return;
    const text=regionText();const failureWords=job.generationAcceptedAt?['视频生成失败','生成失败','审核失败','内容违规','余额不足','额度不足']:settings.failureKeywords||[];const keyword=failureWords.find(k=>text.includes(k)&&!baseline.includes(k));
    if(keyword&&keyword!==lastFailure){lastFailure=keyword;void request({type:'event',event:{type:'failed',terminal:true,jobId:job.id,error:`当前任务区域出现：${keyword}`}});}
    const number=selector=>{if(!selector)return null;try{const text=document.querySelector(selector)?.textContent?.trim()||'';const m=text.replace(/,/g,'').match(/\d+(?:\.\d+)?/g);return m?.length===1?Number(m[0]):null;}catch{return null;}};
    const points=number(settings.pointsSelector),remaining=number(settings.remainingSelector);
    if(points!==null||remaining!==null)void request({type:'event',event:{type:'balance',...(points!==null?{points}:{}),...(remaining!==null?{remaining}:{})}});
  },10000);
})();
