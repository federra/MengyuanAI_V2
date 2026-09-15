// Invoked in the isolated world of one explicitly selected account tab.
export async function prepareTask(job, settings){
  const visible=e=>e instanceof HTMLElement&&e.getClientRects().length&&!e.closest('[aria-hidden="true"]');
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const unique=selector=>{const items=[...document.querySelectorAll(selector)].filter(visible);if(items.length!==1)throw Error(`控件无法唯一匹配：${selector}`);return items[0];};
  const readPrompt=editor=>{
    if(editor instanceof HTMLTextAreaElement)return editor.value;
    // Paragraph innerText adds layout separators; Doubao submits logical lines.
    const nodes=[...editor.childNodes];
    if(nodes.length&&nodes.every(n=>n.nodeType===1&&['P','DIV'].includes(n.nodeName))){
      return nodes.map(p=>{if(p.childNodes.length===1&&p.firstChild.nodeName==='BR')return '';const c=p.cloneNode(true);c.querySelectorAll('br').forEach(b=>b.replaceWith('\n'));return c.textContent;}).join('\n');
    }
    return editor.innerText;
  };

  try{
    if(!['https://www.doubao.com','https://doubao.com'].includes(location.origin))throw Error('不是豆包页面');
    if(job.status!=='prepared')return {ok:true,prepared:false};
    const adapt=()=>{
      if(!settings.automaticPage)return;
      const probe=globalThis.__directorInspectComposer?.(settings);
      if(probe?.state!=='idle'||!probe.settings)throw Error(probe?.error||'等待创作输入框加载');
      settings={...settings,...probe.settings};return probe;
    };
    adapt();

    const editor=unique(settings.promptSelector||'textarea');
    const prior=readPrompt(editor);
    if(prior.trim()&&prior.trim()!==job.task.prompt.trim())throw Error('提示词框已有草稿，请核对后清空');
    if(!prior.trim()){
      editor.focus();
      if(editor instanceof HTMLTextAreaElement)Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(editor,job.task.prompt);
      else if(editor.getAttribute('contenteditable')==='true'){document.execCommand('insertText',false,job.task.prompt);}
      else throw Error('选中的控件不是可编辑输入框');
      editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:job.task.prompt}));
    }
    if(readPrompt(editor).trim()!==job.task.prompt.trim())throw Error('提示词未完整填入');
    // React may reveal the send/file controls only after the first input event.
    await sleep(300);adapt();
    if(job.task.references.length){
      const inputs=[...document.querySelectorAll(settings.uploadSelector||'input[type="file"]')].filter(e=>e instanceof HTMLInputElement&&e.type==='file'&&!e.disabled);
      if(inputs.length!==1)throw Error('找不到唯一的参考图上传控件，请手动按图号上传');
      if(job.task.references.length>1&&!inputs[0].multiple)throw Error('此控件不支持多图，请手动按图号上传');
      if(!inputs[0].dataset.directorJob||inputs[0].dataset.directorJob!==job.id){
        if(settings.uploadReadySelector&&[...document.querySelectorAll(settings.uploadReadySelector)].filter(visible).length)throw Error('当前页面已有参考图，请先清除旧附件，避免图号错位');
        const dt=new DataTransfer();for(const ref of job.task.references){const m=job.bundle.media.find(x=>x.id===ref.mediaId);if(!m)throw Error('缺少参考图');const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(m.dataUrl||'');if(!match)throw Error('参考图编码或格式无效');const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));const blob=new Blob([bytes],{type:match[1]});dt.items.add(new File([blob],ref.label.replace(/[\\/:*?"<>|]/g,'_')+'.'+(blob.type==='image/jpeg'?'jpg':blob.type.split('/')[1]),{type:blob.type}));}
        inputs[0].files=dt.files;inputs[0].dataset.directorJob=job.id;inputs[0].dispatchEvent(new Event('change',{bubbles:true}));
      }
    }
    if(settings.autoSubmit){
      if(job.task.references.length){
        if(!settings.uploadReadySelector)throw Error('参考图已填入；未配置上传成功元素，请核对完成后手动提交');
        let complete=false,stable=0;
        for(let i=0;i<60;i++){const probe=adapt();const ready=[...document.querySelectorAll(settings.uploadReadySelector)].filter(visible);if(ready.length===job.task.references.length&&(!settings.automaticPage||probe?.canSend)){if(++stable>=2){complete=true;break;}}else stable=0;if(ready.length>job.task.references.length)throw Error('参考图数量多于任务图号，停止自动提交');await sleep(1000);}
        if(!complete)throw Error('等待参考图上传完成超时，请核对附件；未自动提交');
      }

      if(!settings.submitSelector)throw Error('未配置生成按钮选择器，不自动提交');
      adapt();
      const button=unique(settings.submitSelector);if(button.disabled||button.getAttribute('aria-disabled')==='true')throw Error('生成按钮仍不可用');return {ok:true,readyToSubmit:true};
    }
    return {ok:true,prepared:true};
  }catch(e){return {ok:false,error:e.message};}
}
