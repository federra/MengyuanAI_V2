// Reload our own extension only while no account task is held. Reading the
// on-disk manifest alone does not verify the service worker's imported code.
async function reloadExtension(pipe,id) {
  if(!/^[a-p]{32}$/.test(id))throw Error('扩展编号无效');
  const {targetId}=await pipe.send('Target.createTarget',{url:'chrome://extensions/',background:true});
  let sessionId;
  try {
    ({sessionId}=await pipe.send('Target.attachToTarget',{targetId,flatten:true}));
    let result;
    for(let attempt=0;attempt<5;attempt++){
      try{result=await pipe.send('Runtime.evaluate',{expression:'Boolean(globalThis.chrome?.developerPrivate?.reload)',returnByValue:true},sessionId);if(result.result?.value===true)break;}
      catch(error){if(!/context.*destroyed|Cannot find context|Inspected target navigated/i.test(error.message))throw error;}
      await new Promise(r=>setTimeout(r,200));
    }
    if(result?.result?.value!==true)throw Error('豆包助手更新未完成，请关闭该账号旧窗口再打开');
    // Chrome's manager survives the extension restart and waits for completion.
    const reload=await pipe.send('Runtime.evaluate',{expression:`chrome.developerPrivate.reload(${JSON.stringify(id)},{failQuietly:true,populateErrorForUnpacked:true})`,awaitPromise:true,returnByValue:true},sessionId);
    if(reload.exceptionDetails||reload.result?.value?.error)throw Error('豆包助手重载失败：'+(reload.result?.value?.error||reload.exceptionDetails?.exception?.description||reload.exceptionDetails?.text));
  } finally {
    if(sessionId)await pipe.send('Target.detachFromTarget',{sessionId}).catch(()=>{});
    await pipe.send('Target.closeTarget',{targetId}).catch(()=>{});
  }
}
async function verifyExtensionBuild(pipe,id,expected){
  const {targetId}=await pipe.send('Target.createTarget',{url:`chrome-extension://${id}/reload.html`,background:true});
  let sessionId,reported='未响应';
  try{
    ({sessionId}=await pipe.send('Target.attachToTarget',{targetId,flatten:true}));
    for(let attempt=0;attempt<20;attempt++){
      try{
        const r=await pipe.send('Runtime.evaluate',{expression:"globalThis.chrome?.runtime?.sendMessage({type:'version'})",awaitPromise:true,returnByValue:true},sessionId);
        if(r.result?.value?.executionBuild===expected)return expected;
        reported=r.result?.value?.executionBuild||r.result?.value?.error||r.exceptionDetails?.text||'未响应';
        if(attempt%4===3){
          // The first navigation can race extension registration after reload.
          const page=await pipe.send('Runtime.evaluate',{expression:'location.href',returnByValue:true},sessionId);
          if(page.result?.value?.startsWith('chrome-error:'))await pipe.send('Page.navigate',{url:`chrome-extension://${id}/reload.html`},sessionId);
        }
      }catch(error){if(!/context|target|Receiving end|connection/i.test(error.message))throw error;}
      await new Promise(r=>setTimeout(r,250));
    }
    const state=await pipe.send('Runtime.evaluate',{expression:'({url:location.href,ready:document.readyState,runtime:!!globalThis.chrome?.runtime,error:document.body?.innerText?.slice(-400)})',returnByValue:true},sessionId).catch(()=>({}));
    throw Error(`浏览器助手实际版本未确认更新为 ${expected}（${reported}; ${JSON.stringify(state.result?.value)}），本次不提交生成`);
  }finally{
    if(sessionId)await pipe.send('Target.detachFromTarget',{sessionId}).catch(()=>{});
    await pipe.send('Target.closeTarget',{targetId}).catch(()=>{});
  }
}
module.exports={reloadExtension,verifyExtensionBuild};
