// Apply the same profile setting as Chrome's Extensions page switch. Chrome persists it.
async function enableInExtensionsPage() {
  for(let attempt=0;attempt<30;attempt++) {
    const api=globalThis.chrome?.developerPrivate;
    if(api?.getProfileConfiguration && api?.updateProfileConfiguration) {
      const before=await api.getProfileConfiguration();
      if(before.inDeveloperMode) return true;
      if(before.isDeveloperModeControlledByPolicy) throw Error('此账号浏览器的开发者模式由策略禁用');
      await api.updateProfileConfiguration({inDeveloperMode:true});
      return (await api.getProfileConfiguration()).inDeveloperMode === true;
    }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('Chrome 扩展设置尚未就绪');
}
async function enableDeveloperMode(pipe) {
  const {targetId}=await pipe.send('Target.createTarget',{url:'chrome://extensions/',background:true});
  let sessionId;
  try {
    ({sessionId}=await pipe.send('Target.attachToTarget',{targetId,flatten:true}));
    let result;
    for(let attempt=0;attempt<4;attempt++){
      try{result=await pipe.send('Runtime.evaluate',{expression:`(${enableInExtensionsPage.toString()})()`,awaitPromise:true,returnByValue:true},sessionId);break;}
      catch(error){if(attempt===3||!/context.*destroyed|Cannot find context|Inspected target navigated/i.test(error.message))throw error;await new Promise(resolve=>setTimeout(resolve,250));}
    }
    if(result.exceptionDetails || result.result?.value !== true)throw Error('无法开启此账号 Chrome 的开发者模式，请检查扩展页是否受策略限制后重试。');
    return true;
  } finally {
    if(sessionId)await pipe.send('Target.detachFromTarget',{sessionId}).catch(()=>{});
    await pipe.send('Target.closeTarget',{targetId}).catch(()=>{});
  }
}
module.exports={enableDeveloperMode};
