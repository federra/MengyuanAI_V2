// Read-only response extraction plus a separate, scoped raw-image preference patch.
// Preserve signed URLs. Renaming a CDN watermark preset does not remove a
// watermark already encoded in the returned video bytes.
(function(root){
  const rawParse=JSON.parse.bind(JSON);
  function url(value){try{if(typeof value!=='string')return '';const text=value.startsWith('https:')?value:atob(value);const u=new URL(text);return u.protocol==='https:'?u.href:'';}catch{return '';}}
  function originalURL(value,kind){
    let href=url(value);if(!href)return '';
    const u=new URL(href);
    const parsed=new URL(href);
    if(/watermark/i.test(parsed.searchParams.get('lr')||'')&&parsed.searchParams.get('lr')!=='video_gen_no_watermark')return '';
    if(['watermark','water_mark','wm'].some(k=>['1','true'].includes(parsed.searchParams.get(k)?.toLowerCase())))return '';
    if(/~[^/]*watermark/i.test(parsed.pathname))return '';
    return href;
  }
  function extract(value){
    const media=[],identities=[],blocked=[];let nodes=0;
    function walk(n,ctx={},depth=0){
      if(depth>24||++nodes>30000)return;
      if(typeof n==='string'){if(n.length<2000000&&/^[\[{]/.test(n)){try{walk(rawParse(n),ctx,depth+1);}catch{}}return;}
      if(!n||typeof n!=='object')return;
      const next={messageId:String(n.message_id||n.msg_id||ctx.messageId||''),videoId:String(n.vid||n.video_id||n.video_key||n.video_vid||ctx.videoId||''),imageId:String(n.image_id||ctx.imageId||'')};
      if(next.videoId)identities.push(next);
      const marked=[n.has_watermark,n.is_watermarked,n.is_watermark].some(v=>v===true||v===1||v==='true'||v==='1');
      const add=(candidate,kind,source)=>{const href=originalURL(candidate,kind);if(href)media.push({...next,url:href,kind,original:true,source});};
      // A display-image watermark flag must not hide its separate raw variant.
      if(![n.image_ori_raw?.has_watermark,n.image_ori_raw?.is_watermark].some(v=>v===true||v===1||v==='true'||v==='1'))add(n.image_ori_raw?.url,'image','image_ori_raw');
      if(marked)return;
      if(!n.original_media_info?.has_watermark&&!n.original_media_info?.is_watermark)add(n.original_media_info?.main_url,'video','original_media_info');
      if(n.original_media_info?.main_url&&(!originalURL(n.original_media_info.main_url,'video')||[n.original_media_info.has_watermark,n.original_media_info.is_watermark].some(v=>v===true||v===1||v==='true'||v==='1')))blocked.push({...next,kind:'video',reason:'豆包返回的视频地址仍标记为带水印，尚未获得无水印视频源；可重新获取原任务，无需重新生成。'});
      const kind=ctx.kind||(next.videoId?'video':n.width||n.height||next.imageId?'image':'video');
      for(const key of ['no_watermark_url','original_url'])if(n[key]&&!(kind==='image'&&n.image_ori_raw?.url))add(n[key],kind,key);
      for(const [key,child] of Object.entries(n)){
        if(['image_preview','image_thumb','image_ori','watermark_info','watermarked_media_info'].includes(key))continue;
        walk(child,{...next,kind:/^image/.test(key)?'image':/^video/.test(key)?'video':ctx.kind},depth+1);
      }
    }
    walk(value);
    const priority={image_ori_raw:4,no_watermark_url:3,original_media_info:2,original_url:1};
    media.sort((a,b)=>(priority[b.source]||0)-(priority[a.source]||0));
    return {media:[...new Map(media.map(m=>[m.url,m])).values()],identities:[...new Map(identities.map(i=>[i.videoId,i])).values()],blocked};
  }
  // The reference downloader patches these three display/download variants.
  // Restrict this to creation images with a validated raw CDN URL; leave all
  // generation parameters, text and unrelated response fields unchanged.
  function preferRawImages(value){
    let nodes=0;
    function visit(n,depth=0){
      if(!n||typeof n!=='object'||depth>24||++nodes>30000)return false;
      let changed=false;
      if(Array.isArray(n.creations))for(const creation of n.creations){
        const img=creation?.image,raw=img?.image_ori_raw;
        if(!raw||[raw.has_watermark,raw.is_watermark].some(v=>v===true||v===1||v==='true'||v==='1'))continue;
        const href=originalURL(raw.url,'image');if(!href)continue;
        const u=new URL(href);
        if(u.username||u.password||u.port&&u.port!=='443'||!['byteimg.com','byteimg.cn','ibyteimg.com','doubaocdn.com','doubao.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))continue;
        for(const key of ['image_ori','image_preview','image_thumb'])if(img[key]&&img[key].url!==href){img[key].url=href;changed=true;}
      }
      for(const [key,child]of Object.entries(n)){
        if(typeof child==='string'&&child.length<2000000&&/^[\[{]/.test(child)&&child.includes('image_ori_raw')){
          try{const nested=rawParse(child);if(visit(nested,depth+1)){n[key]=JSON.stringify(nested);changed=true;}}catch{}
        }else if(child&&typeof child==='object')changed=visit(child,depth+1)||changed;
      }
      return changed;
    }
    visit(value);return value;
  }
  root.DirectorMedia={extract,preferRawImages};
})(globalThis);
