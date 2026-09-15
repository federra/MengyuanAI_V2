export function probeResult(job,open=false){
  const visible=e=>e.getClientRects().length&&!e.closest('[hidden],[aria-hidden="true"]');
  if(!['https://www.doubao.com','https://doubao.com'].includes(location.origin)||!/^\/chat\/\d+$/.test(location.pathname))return null;
  const messages=[...document.querySelectorAll('[data-message-id]')].filter(visible);
  const normalize=s=>(s||'').replace(/\s+/g,'');
  // Long chats can unmount the original prompt. The acknowledged response is
  // another durable anchor, but only in the conversation recorded for this job.
  if(job.conversationUrl&&job.conversationUrl!==location.href)return null;
  const prompt=normalize(job.task?.prompt).slice(0,80);
  const progress=normalize(job.progressMessage);
  const associated=!!job.requestId&&!!job.generationAcceptedAt&&job.conversationUrl===location.href;
  function withoutMessageIds(){
    // Some Doubao views omit data-message-id entirely. Use the saved response
    // text in this exact conversation; absence of an ID is not absence of video.
    if(!job.requestId||job.conversationUrl!==location.href)return null;
    const textNodes=[...document.querySelectorAll('p,span,div,article')].filter(e=>visible(e)&&!e.closest('aside,nav,[contenteditable="true"],textarea'));
    const anchor=associated&&progress.length>=30?progress:prompt;
    if(anchor.length<12)return null;
    const anchors=textNodes.filter(e=>normalize(e.innerText).includes(anchor)&&![...e.children].some(c=>normalize(c.innerText).includes(anchor)));
    if(anchors.length!==1)return null;
    const complete=/你的视频生成好了|视频(?:已)?生成(?:完成|成功)|视频已完成/;
    const controls='[class*="play-icon-wrapper"], video, [aria-label="播放"], [aria-label="播放视频"], [aria-label="Play"], [aria-label="Play video"]';
    const cards=new Set();
    for(const node of textNodes.filter(e=>complete.test(e.innerText||'')&&![...e.children].some(c=>complete.test(c.innerText||'')))){
      if(!(anchors[0].compareDocumentPosition(node)&4)||anchors[0].contains(node))continue;
      let parent=node;
      for(let depth=0;parent&&depth<6;depth++,parent=parent.parentElement){
        if(parent.contains(anchors[0])||parent.querySelector('[contenteditable="true"],textarea,[data-streaming="true"]'))break;
        const buttons=[...parent.querySelectorAll(controls)].filter(visible);
        const unique=buttons.filter(e=>!buttons.some(other=>other!==e&&other.contains(e)));
        if(unique.length===1){cards.add(unique[0]);break;}
        if(unique.length>1)break;
      }
    }
    if(cards.size!==1)return null;
    if(open)[...cards][0].click();
    return {messageId:'',url:location.href};
  }
  const start=messages.findLastIndex(e=>
    (prompt.length>=12&&normalize(e.innerText).includes(prompt))||
    (associated&&((job.generationMessageId&&e.getAttribute('data-message-id')===job.generationMessageId)||
      (progress.length>=30&&normalize(e.innerText).includes(progress)))));
  if(start<0)return withoutMessageIds();
  const latest=messages.at(-1);
  if(!latest||latest.querySelector('[data-streaming="true"]'))return null;
  if(!messages.some(e=>prompt.length>=12&&normalize(e.innerText).includes(prompt))&&messages.length-1-start>1)return null;
  // Never click a thumbnail in the sidebar, an older result, or a later user
  // attachment. Semantic controls cover both inline players and video cards.
  if(messages.indexOf(latest)<start||!/(?:你的视频生成好了|视频(?:已)?生成(?:完成|成功)|视频已完成)/.test(latest.innerText||''))return withoutMessageIds();
  const controls=[...latest.querySelectorAll('[class*="play-icon-wrapper"], video, [aria-label="播放"], [aria-label="播放视频"], [aria-label="Play"], [aria-label="Play video"]')].filter(visible);
  const roots=controls.filter(e=>!controls.some(other=>other!==e&&other.contains(e)));
  if(roots.length!==1)return withoutMessageIds();
  const play=roots[0];
  if(open)play.click();
  return {messageId:latest.getAttribute('data-message-id'),url:location.href};
}
