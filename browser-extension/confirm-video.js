// Continue only an explicit video confirmation in this task's own conversation.
export async function confirmVideo(job,phase='probe'){
  const visible=e=>e.getClientRects().length&&!e.closest('[hidden],[aria-hidden="true"]');
  const prompt='确认。请立即使用上面已上传的参考图、提示词和指定视频参数生成视频，不要只回复方案或再次询问确认。';
  if(!['https://www.doubao.com','https://doubao.com'].includes(location.origin)||!/^\/chat\/\d+$/.test(location.pathname))return {needed:false};
  if(job.conversationUrl&&job.conversationUrl!==location.href)return {needed:false};
  const messages=[...document.querySelectorAll('[data-message-id]')].filter(visible);
  let last=messages.at(-1);
  const normalize=s=>s.replace(/\s+/g,'');
  let own=messages.some(e=>normalize(e.innerText||'').includes(normalize(job.task.prompt.slice(0,80))));
  if(!own&&!messages.length&&job.requestId&&job.conversationUrl===location.href){
    const nodes=[...document.querySelectorAll('p,span,div,article')].filter(e=>visible(e)&&!e.closest('aside,nav,[contenteditable="true"],textarea'));
    const anchor=normalize(job.task.prompt).slice(0,80),asks=/确认后.{0,12}(?:生成|制作)视频|请确认.{0,30}(?:生成|制作)/;
    const anchors=nodes.filter(e=>anchor.length>=12&&normalize(e.innerText||'').includes(anchor)&&![...e.children].some(c=>normalize(c.innerText||'').includes(anchor)));
    const requests=nodes.filter(e=>asks.test(e.innerText||'')&&![...e.children].some(c=>asks.test(c.innerText||'')));
    if(anchors.length===1&&requests.length===1&&(anchors[0].compareDocumentPosition(requests[0])&4)&&!anchors[0].contains(requests[0])){
      last=requests[0];
      own=!nodes.some(e=>/视频生成好后|正在生成|排队中|你的视频生成好了|视频生成失败/.test(e.innerText||'')&&(last.compareDocumentPosition(e)&4));
    }
  }
  if(!own||!last||last.querySelector('video,[data-streaming="true"]')||!/(?:确认后.{0,12}(?:生成|制作)视频|请确认.{0,30}(?:生成|制作))/.test(last.innerText))return {needed:false};
  const editors=[...document.querySelectorAll('textarea,[contenteditable="true"]')].filter(visible);
  if(editors.length!==1)return {needed:false};
  const e=editors[0],text=e.value??e.innerText??'';
  if(text.trim()&&text.trim()!==prompt)return {needed:false};
  if(phase==='prepare'){
    if(!text.trim()){e.focus();if(e instanceof HTMLTextAreaElement)Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,prompt);else document.execCommand('insertText',false,prompt);e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:prompt}));}
    await new Promise(r=>setTimeout(r,300));
    if((e.value??e.innerText).trim()!==prompt)throw Error('视频确认语未完整填入');
  }
  if(phase==='submit'){
    if(text.trim()!==prompt)throw Error('确认语已变化，停止提交');
    const send=document.getElementById('flow-end-msg-send');
    if(!send||!visible(send)||send.disabled||send.getAttribute('aria-disabled')==='true')throw Error('确认消息发送按钮未就绪');
    send.click();
  }
  return {needed:true,prompt,url:location.href};
}
