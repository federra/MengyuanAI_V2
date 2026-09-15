// Inspect only the response following this job's prompt, never sidebar/history text.
export function readGenerationProgress(job) {
  if (!['https://www.doubao.com','https://doubao.com'].includes(location.origin)) return null;
  if(job.conversationUrl&&job.conversationUrl!==location.href)return null;
  const visible=e=>e.getClientRects().length&&!e.closest('[hidden],[aria-hidden="true"]');
  const messages=[...document.querySelectorAll('[data-message-id]')].filter(visible);
  const norm=s=>(s||'').replace(/\s+/g,'');
  const anchor=norm(job.task?.prompt).slice(0,80);
  if(anchor.length<12)return null;
  const start=messages.findLastIndex(e=>norm(e.innerText).includes(anchor));
  let latest=start>=0&&start<messages.length-1?messages.at(-1):null;
  if(!latest&&job.requestId&&job.conversationUrl===location.href){
    const nodes=[...document.querySelectorAll('p,span,div,article')].filter(e=>visible(e)&&!e.closest('aside,nav,[contenteditable="true"],textarea'));
    const anchors=nodes.filter(e=>norm(e.innerText).includes(anchor)&&![...e.children].some(c=>norm(c.innerText).includes(anchor)));
    if(anchors.length!==1)return null;
    const outcome=/视频生成好后|正在生成|排队中|视频生成失败|本次生成失败|视频审核失败|视频生成已取消/;
    const outcomes=nodes.filter(e=>outcome.test(e.innerText||'')&&![...e.children].some(c=>outcome.test(c.innerText||''))&&(anchors[0].compareDocumentPosition(e)&4)&&!anchors[0].contains(e));
    if(outcomes.length!==1)return null;
    latest=outcomes[0];
  }
  if(!latest||latest.querySelector?.('[data-streaming="true"]'))return null;
  const text=latest.innerText||'';
  if(/(?:视频生成失败|本次生成失败|视频审核失败|视频生成已取消)/.test(text)&&job.requestId)return {failed:true,summary:text.slice(-500),url:location.href};
  if(!/(?:预计|需要|请|耐心).{0,8}(?:等待|分钟)|视频生成好后|生成完成后.{0,12}(?:发送|返回)|正在生成|排队中/.test(text))return null;
  if(/(?:生成失败|无法生成|审核失败|额度不足|次数不足|取消生成)/.test(text))return null;
  const model=text.match(/Seedance\s*\d+(?:\.\d+)?(?:\s*(?:Mini|Fast|Pro))?/i)?.[0]||'';
  return {messageId:latest.getAttribute('data-message-id'),url:location.href,model,summary:text.slice(-500)};
}
