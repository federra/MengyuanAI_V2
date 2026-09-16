// Built-in adapter for the visible AI creation composer. No generated content,
// gallery card, or historical message can act as a submit button or attachment.
export function inspectComposer(settings = {}) {
  globalThis.__directorInspectComposer = inspectComposer;
  const visible = e => e instanceof HTMLElement && e.getClientRects().length && !e.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(e).visibility !== 'hidden';
  const text = e => (e.innerText || e.textContent || '').replace(/\s+/g,' ').trim();
  const enabled = e => !e.disabled && e.getAttribute('aria-disabled') !== 'true';
  const leaf = list => list.filter(e=>!list.some(other=>other!==e&&e.contains(other)));
  const query = (root,selector) => [...root.querySelectorAll(selector)].filter(visible);
  const fail = error => ({state:'unknown',error});
  try {
    if(!['https://www.doubao.com','https://doubao.com'].includes(location.origin))return fail('等待豆包创作页面打开');
    const blocked=query(document,'[role="dialog"],[aria-modal="true"],[class*="captcha"],[id*="captcha"],[class*="verify"],[id*="verify"],iframe[src*="captcha"],iframe[src*="verify"]');
    if(blocked.some(e=>e.tagName==='IFRAME'||/登录|验证码|滑块|安全验证|完成拼图/.test(text(e))))return fail('请在浏览器完成登录或验证，完成后自动继续');
    if(query(document,'button,[role="button"],a').some(e=>/^(登录|登录\s*\/\s*注册|登录豆包|立即登录|扫码登录|手机号登录|验证码登录)$/.test(text(e))))return fail('请在豆包窗口登录，完成后自动继续');
    const editors=leaf(query(document,'textarea,[contenteditable="true"]').filter(e=>enabled(e)));
    // Busy text is only accepted as a short, visible status, not from a prompt.
    const statuses=leaf(query(document,'button,[role="status"],[role="button"],span,div').filter(e=>!editors.some(editor=>editor.contains(e)||e.contains(editor))&&text(e).length<60));
    const busy=statuses.find(e=>/^(停止生成|取消生成|正在生成|生成中|视频生成中|排队中|正在排队)([.…\s\d%]|$)/.test(text(e)));
    if(busy)return {state:'busy',error:'豆包页面仍有任务运行，等待完成'};
    if(editors.length!==1)return fail('等待唯一的创作输入框加载；请关闭其他编辑弹窗');
    const editor=editors[0];let root=editor.parentElement;
    while(root && root!==document.body){
      const labels=leaf(query(root,'button,[role="button"],[role="tab"],span,div')).map(text);
      if(labels.includes('视频') && labels.some(t=>t==='图像'||t==='图片') && /模型/.test(text(root)))break;
      root=root.parentElement;
    }
    if(!root||root===document.body)return fail('等待 AI 创作输入区；请保持 AI 创作页面打开');
    // Current creation UI puts the attachment strip beside the actions/editor.
    const surface=root.closest('.guidance-input-surface');
    if(surface&&query(surface,'textarea,[contenteditable="true"]').length===1)root=surface;
    for(const el of document.querySelectorAll('[data-director-composer],[data-director-editor],[data-director-send],[data-director-upload],[data-director-ready]')){
      for(const key of ['composer','editor','send','upload','ready'])el.removeAttribute('data-director-'+key);
    }
    root.setAttribute('data-director-composer','true');editor.setAttribute('data-director-editor','true');
    const imageInputs=scope=>[...scope.querySelectorAll('input[type="file"]')].filter(e=>!e.disabled&&(!e.accept||/image|png|jpg|jpeg|webp/i.test(e.accept)));
    let inputs=imageInputs(root);
    // React can render its hidden upload input in a portal outside the composer.
    // Accept only one image input, with no competing dialog/editor present.
    if(!inputs.length&&!query(document,'[role="dialog"],[aria-modal="true"]').length){const portal=imageInputs(document);if(portal.length===1)inputs=portal;}
    if(inputs.length===1)inputs[0].setAttribute('data-director-upload','true');
    const controls=leaf(query(root,'button,[role="button"],[data-testid],[data-test-id],#flow-end-msg-send'));
    const send=controls.filter(e=>{
      const label=[e.getAttribute('aria-label'),e.getAttribute('title'),text(e)].filter(Boolean).join(' ').trim();
      const id=[e.getAttribute('data-testid'),e.getAttribute('data-test-id'),e.id,typeof e.className==='string'?e.className:''].join(' ').replace(/([a-z])([A-Z])/g,'$1-$2');
      return /^(发送|生成|开始生成|生成视频|提交|Send|Generate)(\s|$)/i.test(label)||/(?:^|[\s_-])(send|submit)(?:[\s_-]|$)/i.test(id);
    }).map(e=>e.closest('button,[role="button"]')||e);
    const sends=[...new Set(send)];if(sends.length===1)sends[0].setAttribute('data-director-send','true');
    // Count pending/failed attachment controls separately from ready thumbnails.
    const hasAttachments=inputs.some(input=>input.files?.length>0)||[...root.querySelectorAll('button,[role="button"],[aria-label],[data-testid]')].some(e=>/删除|移除|remove|delete/i.test([e.getAttribute('aria-label'),e.getAttribute('title'),e.getAttribute('data-testid'),e.className,text(e)].join(' ')));
    const uploads=query(root,'img').filter(img=>{
      const rect=img.getBoundingClientRect();if(rect.width<28||rect.height<28)return false;
      let tile=img.parentElement;
      for(let depth=0;tile&&tile!==root&&depth<5;depth++,tile=tile.parentElement){
        // Delete controls appear on hover; the thumbnail itself must be visible.
        const remove=[...tile.querySelectorAll('button,[role="button"],[aria-label],[data-testid]')].some(e=>/删除|移除|remove|delete|close/i.test([e.getAttribute('aria-label'),e.getAttribute('title'),e.getAttribute('data-testid'),e.className,text(e)].join(' ')));
        if(remove){return img.complete&&img.naturalWidth>0&&!/上传中|上传失败|正在上传|处理失败/.test(text(tile))&&!query(tile,'[aria-busy="true"],[role="progressbar"]').length;}
      }
      return false;
    });
    uploads.forEach(img=>img.setAttribute('data-director-ready','true'));
    const resolved={...settings,automaticPage:true,promptSelector:'[data-director-editor="true"]',uploadSelector:'[data-director-upload="true"]',uploadReadySelector:'[data-director-ready="true"]',submitSelector:'[data-director-send="true"]',idleSelector:'[data-director-editor="true"]',runningSelector:'[data-director-busy="true"]'};
    const activity=globalThis.__directorUploadActivity;
    const uploading=activity?.active>0;
    return {state:'idle',settings:resolved,uploads:uploads.length,hasAttachments,hasDraft:!!(editor.value||editor.textContent||'').trim(),canSend:sends.length===1&&enabled(sends[0])&&!uploading,hasUpload:inputs.length===1,uploading};
  }catch{return fail('创作页面暂未就绪，稍后自动重试');}
}
