import {configureVideo} from './configure-video.js';
import {configureWatermark} from './configure-watermark.js';
import {prepareTask} from './prepare.js';
import {readPageState} from './page-state.js';
import {readLoginState, labelAccount} from './login-state.js';
import {inspectComposer} from './composer.js';
import {enterCreation} from './enter-creation.js';
import {confirmVideo} from './confirm-video.js';
import {probeResult} from './probe-result.js';
import {readResultIdentity} from './result-identity.js';
import {readGenerationProgress} from './generation-progress.js';
const EXECUTION_BUILD='0.13.5';
const own=url=>url?.startsWith(chrome.runtime.getURL(''));
const doubao=url=>{try{return ['https://www.doubao.com','https://doubao.com'].includes(new URL(url).origin);}catch{return false;}};
let tail=Promise.resolve(),polling=false;
const preparingJobs=new Map();
// Keep the task on its original page. Otherwise prefer AI creation, without
// making unrelated history tabs a prerequisite for connecting the account.
function chooseTab(tabs,taskTab){const ready=tabs.filter(t=>doubao(t.url));return ready.find(t=>t.id===taskTab)||ready.find(t=>t.active&&new URL(t.url).pathname.startsWith('/chat/create-image'))||ready.find(t=>new URL(t.url).pathname.startsWith('/chat/create-image'))||ready.find(t=>t.active)||ready[0];}
async function saved(){return chrome.storage.local.get(['connection','activeJob','taskTab','waitingJobs','retiredTaskTabs','bridgeStatus','originals','freshRetryJobId','freshCreationTabId','pendingExtensionUpdate','eventOutbox']);}
// Persist before transmission. A worker suspension or a brief desktop outage
// must not lose the only submission/result notification. Replay in order.
let eventWrites=Promise.resolve();
function eventWork(fn){const work=eventWrites.then(fn);eventWrites=work.catch(()=>{});return work;}
async function flushEventsNow(){
  const state=await saved();
  for(const item of state.eventOutbox||[]){
    if(item.accountId!==state.connection?.accountId)continue;
    try{await api('/event',item.event);}
    catch(error){if(![400,404,409].includes(error.status))throw error;await setStatus('任务通知未被接收：'+error.message);}
    const latest=await saved();
    await chrome.storage.local.set({eventOutbox:(latest.eventOutbox||[]).filter(e=>e.key!==item.key||e.accountId!==item.accountId)});
  }
}
function flushEvents(){return eventWork(flushEventsNow);}
function durableEvent(event,patch={}){return durableEvents([event],patch);}
function durableEvents(events,patch={}){return eventWork(async()=>{
  const state=await saved();let outbox=state.eventOutbox||[];
  for(const event of events){
    const key=JSON.stringify([event.type,event.jobId,event.requestId,event.videoId,event.url]);
    const item={key,accountId:state.connection?.accountId,event};
    outbox=[...outbox.filter(e=>e.key!==key||e.accountId!==item.accountId),item];
  }
  await chrome.storage.local.set({...patch,eventOutbox:outbox});
  await flushEventsNow();
});}
async function observeWaiting(job,tabId){
  const progress=(await chrome.scripting.executeScript({target:{tabId},func:readGenerationProgress,args:[job]}))[0]?.result;
  if(!progress||!job.requestId)return false;
  if(progress.failed){await durableEvent({type:'failed',jobId:job.id,requestId:job.requestId,terminal:true,error:progress.summary});return true;}
  const reply=await api('/event',{type:'generationWaiting',jobId:job.id,requestId:job.requestId,...progress});
  if(reply.ignored)return false;
  const state=await saved(), waitingJobs=state.waitingJobs||{};
  waitingJobs[job.id]={job:{...job,generationAcceptedAt:job.generationAcceptedAt||Date.now(),generationMessageId:progress.messageId,progressMessage:progress.summary,conversationUrl:progress.url},tabId,url:progress.url};
  await chrome.storage.local.set({waitingJobs});return true;
}
async function trackWaiting(next,tabs){
  const jobs=next.waitingJobs|| (['submitted','attention'].includes(next.job?.status)&&next.job.requestId?[next.job]:[]);
  for(const job of jobs){
    const state=await saved();
    const entry={...state.waitingJobs?.[job.id],job};
    const isConversation=url=>doubao(url)&&/^\/chat\/\d+$/.test(new URL(url).pathname);
    const original=isConversation(job.conversationUrl)?job.conversationUrl:isConversation(entry.url)?entry.url:'';
    let tab=original?tabs.find(t=>t.url===original):tabs.find(t=>t.id===entry.tabId||(state.activeJob?.id===job.id&&t.id===state.taskTab));
    const playbackOnly=!original&&job.videoId&&job.recoveryKey&&(!tab||entry.playbackOnly);
    entry.playbackOnly=!!playbackOnly;
    if(playbackOnly)tab=chooseTab(tabs,state.taskTab);
    if(!tab&&original&&doubao(original)&&/^\/chat\/\d+$/.test(new URL(original).pathname)){
      // Reopen the exact conversation after restart; never submit again.
      tab=await chrome.tabs.create({url:original,active:false});tabs.push(tab);
    }
    if(!tab){await setStatus('未找到原任务对话，请在此账号打开原对话后点击重新获取');continue;}
    entry.tabId=tab.id;entry.url=original||(isConversation(tab.url)&&!playbackOnly?tab.url:'');
    const remember=async()=>{const latest=await saved();await chrome.storage.local.set({waitingJobs:{...latest.waitingJobs,[job.id]:entry}});};
    // Establish event routing before arming the page or clicking its player.
    await remember();
    if(tab.status==='loading')continue;
    try{
      if(playbackOnly){await chrome.tabs.sendMessage(tab.id,{type:'arm',job:entry.job,settings:next.settings});continue;}
      if(!job.conversationUrl&&/^\/chat\/\d+$/.test(new URL(tab.url).pathname)){
        await api('/event',{type:'conversationBound',jobId:job.id,requestId:job.requestId,url:tab.url});
        job.conversationUrl=tab.url;entry.url=tab.url;
      }
      const result=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:probeResult,args:[entry.job]}))[0]?.result;
      if(result){
        await api('/event',{type:'resultDetected',jobId:job.id,requestId:job.requestId,...result});
        const observerBuild=(await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:()=>window.__directorObserverBuild}))[0]?.result;
        // An extension update cannot replace hooks already running in a page.
        // Refresh only a positively identified completed result, once per build.
        if(observerBuild!==EXECUTION_BUILD&&entry.resultReloadBuild!==EXECUTION_BUILD){
          entry.resultReloadBuild=EXECUTION_BUILD;await remember();await chrome.tabs.reload(tab.id);continue;
        }
      }
      await chrome.tabs.sendMessage(tab.id,{type:'arm',job:entry.job,settings:next.settings});
      if(result&&Date.now()-(entry.lastResultProbeAt||0)>30000){
        entry.lastResultProbeAt=Date.now();
        await remember();
        const identity=(await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:readResultIdentity,args:[entry.job,result]}))[0]?.result;
        if(identity?.videoId){
          await api('/event',{type:'identity',jobId:job.id,requestId:job.requestId,...identity});
          entry.job.videoId=identity.videoId;await remember();
        }
        await chrome.tabs.sendMessage(tab.id,{type:'probeVideo',job:entry.job,...result,...(identity?.videoId?identity:{})});
        if(!identity?.videoId)await chrome.scripting.executeScript({target:{tabId:tab.id},func:probeResult,args:[entry.job,true]});
        await setStatus('已找到原视频，正在读取原始下载链接');
      }else if(!result){
        if(await observeWaiting(job,tab.id)){await setStatus('正在跟踪原豆包对话，等待本条视频结果');continue;}
        if(job.status==='submitted'&&!job.generationAcceptedAt&&!job.videoId&&!job.confirmationAttemptedAt&&!entry.confirmationAttempted&&!next.paused&&next.enabled){
          const confirm=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:confirmVideo,args:[job]}))[0]?.result;
          if(confirm?.needed){
            await chrome.scripting.executeScript({target:{tabId:tab.id},func:confirmVideo,args:[job,'prepare']});
            await api('/event',{type:'confirmationIntent',jobId:job.id});
            entry.confirmationAttempted=true;await remember();
            await chrome.tabs.sendMessage(tab.id,{type:'confirmVideo',job,prompt:confirm.prompt,url:confirm.url});
            await chrome.scripting.executeScript({target:{tabId:tab.id},func:confirmVideo,args:[job,'submit']});
            await setStatus('豆包要求确认，已确认直接生成视频');
          }
        }
        if(job.status==='attention')await setStatus('本次等待已超时，仍检查原对话结果；提交满3分钟后允许下一条');
      }
    }catch(error){
      if(Date.now()-(entry.lastProbeErrorAt||0)>60000){
        entry.lastProbeErrorAt=Date.now();
        await api('/event',{type:'resultProbeError',jobId:job.id,requestId:job.requestId,error:String(error?.message||error).slice(0,300)}).catch(()=>{});
      }
    }
    await remember();
  }
  return jobs.length>0;
}
async function closeReturnedTasks(next){
  let changed=false;
  const initial=await saved();
  const activeTerminal=next.jobStates?.find(j=>j.id===initial.activeJob?.id&&j.terminal&&['failed','cancelled','attention'].includes(j.status));
  if(activeTerminal&&initial.taskTab&&!initial.waitingJobs?.[activeTerminal.id]){
    const tab=await chrome.tabs.get(initial.taskTab).catch(()=>null);
    initial.waitingJobs={...initial.waitingJobs,[activeTerminal.id]:{job:initial.activeJob,tabId:initial.taskTab,url:tab?.url||''}};
  }
  for(const [id,entry] of Object.entries(initial.waitingJobs||{})){
    const result=next.jobStates?.find(j=>j.id===id && j.requestId===entry.job.requestId);
    if((['failed','cancelled','attention'].includes(result?.status)&&result.terminal)||(result?.status==='succeeded'&&result.returned&&entry.playbackOnly)){
      const current=await saved(),waitingJobs={...current.waitingJobs};delete waitingJobs[id];
      await chrome.storage.local.set({waitingJobs,retiredTaskTabs:{...current.retiredTaskTabs,[entry.tabId]:entry.url||entry.job.conversationUrl||(await chrome.tabs.get(entry.tabId).catch(()=>null))?.url||''},...(current.activeJob?.id===id?{activeJob:null,taskTab:null}:{})});
      continue; // Keep failed conversations visible for inspection.
    }
    if(result?.status!=='succeeded'||!result.returned)continue;
    const current=await saved();
    // Never close a tab that has since been assigned to another task.
    if(current.activeJob && current.activeJob.id!==id && current.taskTab===entry.tabId)continue;
    if(Object.entries(current.waitingJobs||{}).some(([other,e])=>other!==id && e.tabId===entry.tabId))continue;
    try{
      const tab=await chrome.tabs.get(entry.tabId).catch(e=>{if(/No tab with id|Invalid tab ID/i.test(e.message))return null;throw e;});
      if(tab){
        if(!doubao(tab.url)||!entry.url||tab.url!==entry.url)continue;
        await chrome.tabs.remove(tab.id);
      }
      const latest=await saved(), waitingJobs={...latest.waitingJobs};delete waitingJobs[id];
      const patch={waitingJobs};
      if(latest.activeJob?.id===id){patch.activeJob=null;if(latest.taskTab===entry.tabId)patch.taskTab=null;}
      await chrome.storage.local.set(patch);changed=true;
    }catch{/* Retry closing on the next poll; never regenerate or discard the receipt. */}
  }
  if(changed)await setStatus('视频已下载并回传工作台，已自动关闭对应任务页');
  return changed;
}
async function api(route,body){const {connection:c}=await saved();if(!c)throw Error('请回工作台点击此账号的“打开登录”，自动连接');const r=await fetch(c.url+route,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${c.token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify({...body,executionBuild:EXECUTION_BUILD,autoUpdateCapable:true}):undefined,signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok){const error=Error(data.error||'Helper 连接失败');error.status=r.status;throw error;}return data;}
const setStatus=text=>chrome.storage.local.set({bridgeStatus:text});
function prepareCurrent(job,tabId){
  if(preparingJobs.has(job.id))return preparingJobs.get(job.id);
  const work=prepareCurrentOnce(job,tabId).finally(()=>preparingJobs.delete(job.id));
  preparingJobs.set(job.id,work);return work;
}
async function prepareCurrentOnce(job,tabId){
  if(job.settings.automaticPage){
    const adapted=(await chrome.scripting.executeScript({target:{tabId},func:inspectComposer,args:[job.settings]}))[0]?.result;
    if(adapted?.settings)job={...job,settings:adapted.settings};
  }
  const page = (await chrome.scripting.executeScript({target:{tabId},func:readPageState,args:[job.settings]}))[0]?.result;
  await api('/event',{type:'runtime',state:page?.state||'unknown'});
  if(page?.state!=='idle')return {ok:false,error:page?.error||'豆包页面仍有任务运行，不准备新提交'};
  const watermark=(await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:configureWatermark}))[0]?.result;
  await api('/event',{type:'workflow',jobId:job.id,steps:watermark?.steps||[],error:watermark?.ok?'':watermark?.error||'未确认 AI 水印设置'});
  if(!watermark?.ok)return watermark||{ok:false,error:'未确认 AI 水印设置，不提交生成'};
  const configured=(await chrome.scripting.executeScript({target:{tabId},func:configureVideo,args:[job,job.settings]}))[0]?.result;
  await api('/event',{type:'workflow',jobId:job.id,steps:configured?.steps||[],error:configured?.ok?'':configured?.error||'页面设置失败'});
  if(!configured?.ok)return configured||{ok:false,error:'页面设置失败'};
  const result=await chrome.scripting.executeScript({target:{tabId},func:prepareTask,args:[job,job.settings]});
  const r=result[0]?.result||{ok:false,error:'准备失败'};
  await api('/event',{type:'workflow',jobId:job.id,steps:r.ok?['提示词与参考图已核对']:[],error:r.ok?'':r.error||'参考素材准备失败'});
  if(r.readyToSubmit){
    const latest=await api('/next'),stored=await saved();
    if(latest.paused||!latest.enabled||latest.job?.id!==job.id||latest.job.status!=='prepared')return {ok:false,error:'账号或任务已暂停，不提交'};
    if(stored.activeJob?.submissionAttempted)return {ok:false,error:'已点击过提交，请核对豆包任务；不重复点击'};
    await api('/event',{type:'submissionIntent',jobId:job.id});
    await chrome.storage.local.set({activeJob:{...stored.activeJob,submissionAttempted:true}});
    const clicked=await chrome.scripting.executeScript({target:{tabId},func:(s)=>{
      const visible=e=>e.getClientRects().length&&!e.closest('[aria-hidden="true"]');
      if(s.automaticPage){const probe=globalThis.__directorInspectComposer?.(s);if(probe?.state!=='idle'||!probe.canSend)return {ok:false,error:'提交前页面或上传状态变化，已停止'};s=probe.settings;}
      else if(!s.idleSelector||!s.runningSelector||[...document.querySelectorAll(s.runningSelector+', [aria-busy="true"]')].some(visible)||[...document.querySelectorAll(s.idleSelector)].filter(visible).length!==1)return {ok:false,error:'提交前未确认页面空闲，已停止'};
      const found=[...document.querySelectorAll(s.submitSelector)].filter(e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true');if(found.length!==1)return {ok:false,error:'提交控件已变化，请手动核对'};found[0].click();return {ok:true};},args:[job.settings]});
    const result=clicked[0]?.result||{ok:false,error:'未能点击提交'};
    if(clicked[0]?.result?.ok===false){
      await durableEvent({type:'submissionNotSent',jobId:job.id,error:result.error},{activeJob:{...stored.activeJob,status:'failed',submissionAttempted:false}});
      return result;
    }
    await api('/event',{type:'workflow',jobId:job.id,steps:result.ok?['已点击提交，等待匹配请求']:[],error:result.ok?'':result.error});
    return result;
  }
  return r;
}
async function finishExtensionUpdate(prior){
  const pending=prior.pendingExtensionUpdate;if(!pending)return false;
  // A previous desktop may have requested a retired version. Reconcile with
  // the live desktop instead of reloading forever toward the persisted target.
  const current=await api('/next');
  if(current.extensionVersion===EXECUTION_BUILD){
    // A fresh page loads the new MAIN-world observer and isolated forwarder.
    // Preserve old conversations and any draft; do not refresh their tabs.
    const tab=pending.tabId?{id:pending.tabId}:await chrome.tabs.create({url:'https://www.doubao.com/chat/create-image',active:false});
    await chrome.storage.local.set({pendingExtensionUpdate:{...pending,tabId:tab.id},taskTab:tab.id,activeJob:null});
    await api('/event',{type:'runtime',state:'unknown',error:''});
    await chrome.storage.local.set({pendingExtensionUpdate:null});
    await setStatus('助手已自动更新，正在检查创作页面');return true;
  }
  if(Date.now()-(pending.at||0)>60000){
    await chrome.storage.local.set({pendingExtensionUpdate:{...pending,at:Date.now()}});
    await setStatus('正在自动加载新版助手');chrome.runtime.reload();
  }
  return true;
}
async function poll(){
  if(polling)return;polling=true;
  let quick=false;
  try{
    let prior=await saved();if(!prior.connection)return;
    if(await finishExtensionUpdate(prior))return;
    await flushEvents();
    let next=await api('/next');
    quick=!!(next.waiting||next.job||next.loginCheck||next.waitingJobs?.length);
    const tabs=await chrome.tabs.query({url:['https://www.doubao.com/*','https://doubao.com/*']});
    if(await closeReturnedTasks(next))return;
    // Submitted tasks use their conversation, not the creation form. Waiting
    // for an AI-creation composer here used to block result collection forever.
    await trackWaiting(next,tabs);
    if(next.job?.requestId && ['submitted','attention'].includes(next.job.status))return;
    prior=await saved();
    const protectedTab=id=>Object.values(prior.waitingJobs||{}).some(e=>e.tabId===id)||!!prior.retiredTaskTabs?.[id];
    if(next.enabled&&!next.paused&&next.waiting&&!next.job&&(!prior.taskTab||protectedTab(prior.taskTab))&&(Object.keys(prior.waitingJobs||{}).length||Object.keys(prior.retiredTaskTabs||{}).length)){
      const fresh=await chrome.tabs.create({url:'https://www.doubao.com/chat/create-image',active:true});
      await chrome.storage.local.set({activeJob:null,taskTab:fresh.id,freshCreationTabId:fresh.id});
      await api('/event',{type:'runtime',state:'unknown'});
      await setStatus('原任务已释放账号，正在新创作页检查下一任务');return;
    }
    if(next.job?.status==='prepared' && prior.activeJob?.id!==next.job.id && (protectedTab(prior.taskTab)||prior.activeJob?.requestId)){
      const fresh=await chrome.tabs.create({url:'https://www.doubao.com/chat/create-image',active:true});
      await chrome.storage.local.set({activeJob:next.job,taskTab:fresh.id,freshCreationTabId:fresh.id});
      await setStatus('正在新创作页准备下一任务，原对话已保留');return;
    }
    if(await closeReturnedTasks(next))return;
    if(next.job?.status==='downloading'){
      await setStatus('视频正在下载并回传工作台，完成后自动关闭对应任务页');return;
    }
    const tab=chooseTab(tabs,prior.taskTab);
    if(!tab){const error='等待豆包创作页打开；浏览器未就绪时自动重试';await api('/event',{type:'runtime',state:'unknown',error});await setStatus(error);return;}
    // Window labels and nickname display must never block a generation task.
    await chrome.scripting.executeScript({target:{tabId:tab.id},func:labelAccount,args:[next]}).catch(()=>{});
    if(next.loginCheck&&next.loginCheck.purpose!=='generation'){
      // One-shot alarms survive service-worker suspension and also retry SPA
      // login/verification completion that does not navigate the tab.
      await chrome.alarms.create('director-login-retry',{when:Date.now()+3000});
      let result;
      try {
        result=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:readLoginState,args:[next.settings]}))[0]?.result;
      } catch { result={state:'unknown',message:'页面正在跳转，等待登录后自动重新读取',safeToClose:false}; }
      const checkId=next.loginCheck.id;
      const reply=await api('/event',{type:'loginResult',checkId,...(result||{state:'unknown',message:'页面未加载',safeToClose:false})});
      if(!reply.pending)await chrome.alarms.clear('director-login-retry');
      await chrome.scripting.executeScript({target:{tabId:tab.id},func:labelAccount,args:[reply]}).catch(()=>{});
      if(reply.closeAllowed){
        let closed=false;
        try {await chrome.tabs.remove(tab.id);closed=true;} finally {await api('/event',{type:'loginClosed',checkId,closed});}
      }
      await setStatus(reply.message||result?.message||'登录检测完成');return;
    }
    const awaitingPreparation=(!next.job&&next.waiting)||(next.job?.status==='prepared'&&!(prior.activeJob?.id===next.job.id&&prior.activeJob.submissionAttempted));
    if(next.enabled&&!next.paused&&awaitingPreparation&&!new URL(tab.url).pathname.startsWith('/chat/create-image')){
      const navigation=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:enterCreation,args:[]}))[0]?.result;
      if(navigation?.openCreation){
        const fresh=await chrome.tabs.create({url:'https://www.doubao.com/chat/create-image',active:true});
        await chrome.storage.local.set({taskTab:fresh.id});
      }
      const error=navigation?.ok?'正在进入 AI 创作，页面加载后自动设置视频参数':navigation?.error||'AI 创作页面未就绪';
      await api('/event',{type:'runtime',state:'unknown',error});await setStatus(error);return;
    }
    let page=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:next.settings.automaticPage?inspectComposer:readPageState,args:[next.settings]}))[0]?.result;
    const login=(await chrome.scripting.executeScript({target:{tabId:tab.id},func:readLoginState,args:[next.settings]}).catch(()=>[]))[0]?.result;
    if(['loggedOut','verification'].includes(login?.state))page={state:'unknown',error:login.message};
    let updateSafe=page?.state==='idle'&&!page?.uploading;
    for(const other of tabs.filter(t=>t.id!==tab.id)){
      if((Object.values(prior.waitingJobs||{}).some(entry=>entry.tabId===other.id)||prior.retiredTaskTabs?.[other.id]===other.url)){updateSafe=false;continue;}
      const activity=(await chrome.scripting.executeScript({target:{tabId:other.id},func:inspectComposer,args:[next.settings]}).catch(()=>[]))[0]?.result;
      if(activity?.state!=='idle'||activity?.uploading)updateSafe=false;
      if(activity?.state==='busy')page={state:'busy',error:'此账号另一个豆包页面仍有任务运行，等待完成'};
    }
    await api('/event',{type:'runtime',state:page?.state||'unknown',error:page?.error||'',readyForGeneration:next.settings.automaticPage&&page?.state==='idle',loginState:login?.state,nickname:login?.state==='loggedIn'?login.nickname:undefined});
    next=await api('/next');
    if(next.extensionUpdateRequired&&!next.job){
      const grant=await api('/event',{type:'extensionUpdate',safeToUpdate:updateSafe});
      if(grant.updateAllowed){
        await chrome.storage.local.set({pendingExtensionUpdate:{version:grant.version,fromVersion:EXECUTION_BUILD,at:Date.now()}});
        await setStatus('正在自动更新助手，完成后继续接收任务');chrome.runtime.reload();return;
      }
      await setStatus('新版助手待更新，等待账号任务结束或页面空闲');return;
    }
    if(next.job?.status==='attention'&&prior.activeJob?.id===next.job.id&&!prior.activeJob.submissionAttempted&&!prior.activeJob.requestId&&(prior.activeJob.prepareAttempts||0)>=3&&page?.state==='idle'){
      const reconciled=await api('/event',{type:'preparationAbandoned',jobId:next.job.id,noSubmissionAttempt:true});
      if(reconciled.released){await chrome.storage.local.set({activeJob:null});await setStatus('已确认旧任务在提交前失败，账号可继续工作');return;}
    }
    if(!next.job){await chrome.storage.local.set({activeJob:null});await setStatus(next.paused?'队列暂停':!next.enabled?'账号已停用':page?.state!=='idle'?(page?.error||'豆包仍在运行，等待空闲'): '页面空闲，等待分组轮询任务');return;}
    let job=next.job;
    if(['submitted','attention'].includes(job.status)&&job.requestId){await trackWaiting(next,tabs);return;}
    if (!next.paused && next.enabled && job.retryOf && job.status==='prepared' && prior.freshRetryJobId!==job.id) {
      const reusable=prior.freshCreationTabId===tab.id&&!protectedTab(tab.id)&&page?.state==='idle'&&page.hasDraft===false&&page.hasAttachments===false&&page.uploads===0&&!page.uploading;
      if(!reusable){
        const freshTab=await chrome.tabs.create({url:'https://www.doubao.com/chat/create-image',active:true});
        await chrome.storage.local.set({activeJob:job,taskTab:freshTab.id,freshRetryJobId:job.id,freshCreationTabId:null});
        await setStatus('重新生成：正在打开新的创作页');return;
      }
      await chrome.storage.local.set({freshRetryJobId:job.id,freshCreationTabId:null});
    }
    job.settings={...job.settings,automaticPage:next.settings.automaticPage,...(page?.settings||{}),autoSubmit:job.settings.autoSubmit,runningSelector:page?.settings?.runningSelector||next.settings.runningSelector,idleSelector:page?.settings?.idleSelector||next.settings.idleSelector};
    if(prior.activeJob?.id===job.id)job={...job,requestId:job.requestId||prior.activeJob.requestId,videoId:job.videoId||prior.activeJob.videoId,submissionAttempted:prior.activeJob.submissionAttempted,confirmationAttempted:prior.activeJob.confirmationAttempted,resultProbeAt:prior.activeJob.resultProbeAt,...(prior.activeJob.prepareRevision===job.prepareRevision?{prepareAttempts:prior.activeJob.prepareAttempts,lastPrepareAt:prior.activeJob.lastPrepareAt}:{})};
    await chrome.storage.local.set({activeJob:job,freshCreationTabId:null});
    await chrome.storage.local.set({taskTab:tab.id});
    try{await chrome.tabs.sendMessage(tab.id,{type:'arm',job,settings:next.settings});}
    catch(error){
      if(job.status==='prepared'&&!job.submissionAttempted&&/Receiving end does not exist|Could not establish connection|Extension context invalidated/i.test(error.message)){
        // Reloading the worker invalidates content scripts in existing tabs.
        // Keep any draft intact and resume this unsubmitted job in a fresh tab.
        const fresh=await chrome.tabs.create({url:'https://www.doubao.com/chat/create-image',active:true});
        await chrome.storage.local.set({taskTab:fresh.id});
        await setStatus('助手已更新，正在新创作页继续准备');return;
      }
      throw error;
    }
    if(next.paused||!next.enabled){await setStatus('已暂停准备新提交，仍等待已提交结果');return;}
    if(job.status==='prepared'&&!job.submissionAttempted&&(job.prepareAttempts||0)<3&&Date.now()-(job.lastPrepareAt||0)>5000){
      job.prepareAttempts=(job.prepareAttempts||0)+1;job.lastPrepareAt=Date.now();await chrome.storage.local.set({activeJob:job,freshCreationTabId:null});
      await chrome.tabs.update?.(tab.id,{active:true});
      const result=await prepareCurrent(job,tab.id);
      await setStatus(result?.ok?'任务已准备；以豆包页面实际提交状态为准':result?.error||'准备失败，请在面板重试准备');
      if(!result?.ok&&job.prepareAttempts>=3){const local=await saved();await api('/event',{type:'failed',jobId:job.id,terminal:local.activeJob?.id===job.id&&!local.activeJob.submissionAttempted,error:result?.error||'连续三次准备失败，未完成生成'});}
    }else if(job.status==='prepared'&&!job.submissionAttempted&&(job.prepareAttempts||0)>=3){
      await api('/event',{type:'failed',jobId:job.id,terminal:true,error:job.error||'连续三次准备失败，未完成生成'});
    }else await setStatus(job.status==='prepared'?'等待在豆包提交；需要时可重试准备':job.status==='attention'?'原任务状态未确认，账号继续占用，不提交下一条':'等待原任务生成结果');
  }catch(e){await setStatus(e.message);await api('/event',{type:'runtime',state:'unknown',error:'浏览器准备失败：'+e.message}).catch(()=>{});}finally{polling=false;if(quick){await chrome.alarms.create('director-active-poll',{when:Date.now()+5000});globalThis.setTimeout?.(()=>void poll(),5000);}}
}
function mediaURL(value, officialAiRemoved = false){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')throw Error('无效素材地址');if(!['doubao.com','byteimg.com','byteimg.cn','ibyteimg.com','doubaocdn.com','bytecdn.cn','bytecdn.com','bytegecko.com','volces.com','volccdn.com','douyinvod.com','bytedance.net','ibytedtos.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw Error('未识别素材域名');const href=u.href;const preset=new URL(href).searchParams.get('lr')||'';if(/watermark/i.test(preset)&&preset!=='video_gen_no_watermark'&&!(officialAiRemoved&&preset==='video_gen_watermark_unpaid')||['watermark','water_mark','wm'].some(k=>['1','true'].includes(u.searchParams.get(k)?.toLowerCase())))throw Error('返回地址仍带水印标记，请重新获取原始素材');return href;}
async function handle(msg,sender){
  const internal=own(sender.url),site=doubao(sender.tab?.url);
  if(msg.type==='version'&&internal)return {ok:true,executionBuild:EXECUTION_BUILD};
  if(msg.type==='autoConnect'){
    const source=new URL(sender.url || 'https://invalid.example');
    if(!sender.tab?.id || source.protocol!=='http:' || source.hostname!=='127.0.0.1' || !source.port || source.pathname!=='/__director_connect' || !/^[a-f0-9]{64}$/.test(msg.ticket || '') || new URLSearchParams(source.hash.slice(1)).get('ticket')!==msg.ticket) throw Error('请从工作台打开登录');
    const response=await fetch(source.origin+'/connect/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket:msg.ticket}),signal:AbortSignal.timeout(15000)});
    const connection=await response.json();
    if(!response.ok)throw Error(connection.error||'自动连接失败');
    if(connection.version!==1||connection.url!==source.origin||!/^[a-f0-9]{64}$/.test(connection.token)||typeof connection.accountId!=='string')throw Error('自动连接响应无效');
    const previous=await saved();
    if(previous.connection?.accountId && previous.connection.accountId!==connection.accountId)throw Error('此 Chrome 已连接其他账号，请从对应账号的独立窗口打开');
    // Refresh this account's bridge without losing a task already submitted.
    await chrome.storage.local.set({connection,bridgeStatus:'已自动连接工作台'});
    await chrome.alarms.create('director-poll',{periodInMinutes:0.5});
    const tabs=await chrome.tabs.query({url:['https://www.doubao.com/*','https://doubao.com/*']});
    const tab=chooseTab(tabs,previous.taskTab);
    const fresh=new URLSearchParams(source.hash.slice(1)).get('fresh')==='1';
    if(!fresh&&tab&&(new URL(tab.url).pathname.startsWith('/chat/create-image')||(previous.activeJob&&previous.taskTab===tab.id))){await chrome.storage.local.set({taskTab:tab.id});await chrome.tabs.update(tab.id,{active:true});await chrome.tabs.remove(sender.tab.id);}
    else {await chrome.storage.local.set({taskTab:sender.tab.id,freshCreationTabId:sender.tab.id});await chrome.tabs.update(sender.tab.id,{url:'https://www.doubao.com/chat/create-image'});}
    await poll();return {ok:true};
  }
  if(msg.type==='connect'&&internal){const c=msg.connection;if(c?.version!==1||!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(c.url)||!/^[a-f0-9]{64}$/.test(c.token)||typeof c.accountId!=='string')throw Error('连接码无效');await chrome.storage.local.set({connection:c,activeJob:null,taskTab:null});await chrome.alarms.create('director-poll',{periodInMinutes:0.5});await poll();return {ok:true};}
  if(msg.type==='disconnect'&&internal){await chrome.storage.local.remove(['connection','activeJob','taskTab']);await chrome.alarms.clear('director-poll');return {ok:true};}
  if(msg.type==='bridgeState'&&internal){await poll();const {connection,activeJob,bridgeStatus,originals}=await saved();return {accountName:connection?.accountName,activeJob,bridgeStatus,originals:originals||[]};}
  if(msg.type==='prepare'&&internal){const {activeJob,taskTab}=await saved();if(!activeJob||activeJob.status!=='prepared'||!taskTab)throw Error('没有待准备任务');const r=await prepareCurrent(activeJob,taskTab);await setStatus(r?.ok?'已准备，以豆包页面状态为准':r?.error||'准备失败');return r;}
  if(msg.type==='downloadOriginal'&&(internal||site)){
    const m=msg.media;if(m?.original!==true||!['image','video'].includes(m.kind))throw Error('未确认原始素材');const url=mediaURL(m.url,m.source==='doubao_without_watermark'&&m.aiWatermarkRemoved===true);const downloadId=await chrome.downloads.download({url,filename:`AI短片导演/豆包原始文件/${m.kind}-${Date.now()}.${m.kind==='video'?'mp4':'png'}`,conflictAction:'uniquify',saveAs:false});return {ok:true,downloadId};
  }
  if(msg.type==='harvest'&&site){
    const state=await saved();const originals=[...(state.originals||[])];
    for(const m of (msg.media||[]).slice(0,100))try{mediaURL(m.url,m.source==='doubao_without_watermark'&&m.aiWatermarkRemoved===true);if(m.original&&!originals.some(x=>x.url===m.url))originals.push({...m,foundAt:Date.now()});}catch{}
    await chrome.storage.local.set({originals:originals.slice(-100)});
    const waiting=Object.values(state.waitingJobs||{}).find(e=>e.tabId===sender.tab.id);
    const job=waiting?.job || (state.taskTab===sender.tab.id ? state.activeJob : null);
    if(!job||!job.requestId)return {ok:true};
    const events=[];
    if(msg.requestId===job.requestId){const identities=[...new Map((msg.identities||[]).map(i=>[i.videoId,i])).values()];const identity=identities.length===1?identities[0]:null;if(identity){job.videoId ||= identity.videoId;job.messageId ||= identity.messageId;events.push({type:'identity',jobId:job.id,requestId:job.requestId,...identity});}}
    const media=(msg.media||[]).find(m=>m.kind==='video'&&m.original&&(job.videoId?m.videoId===job.videoId:msg.requestId===job.requestId));
    const blocked=(msg.blocked||[]).find(m=>m.kind==='video'&&m.videoId&&m.videoId===job.videoId);
    if(!media&&blocked){
      events.push({type:'resultUnavailable',jobId:job.id,requestId:job.requestId,videoId:job.videoId});
      await setStatus('豆包已返回视频，但接口仅提供带水印版本；可重新获取原视频，无需重新生成');
    }
    if(media){
      // Save the originating tab before starting asynchronous download, including
      // fast results that never displayed a generation-waiting message.
      events.push({type:'result',jobId:job.id,requestId:job.requestId,...media});
    }
    const latest=await saved();
    await durableEvents(events,media||waiting?{waitingJobs:{...latest.waitingJobs,[job.id]:{...waiting,job,tabId:sender.tab.id,url:sender.tab.url}}}:{activeJob:job});
    if(media)await setStatus('原始视频已找到，正在下载并回传工作台；成功后自动关闭任务页');
    return {ok:true};
  }
  if(msg.type==='event'&&site){
    const state=await saved(), waiting=Object.values(state.waitingJobs||{}).find(e=>e.tabId===sender.tab.id);
    const activeJob=waiting?.job || (state.taskTab===sender.tab.id ? state.activeJob : null);
    if(!activeJob||msg.event.type!=='balance'&&msg.event.jobId!==activeJob.id)throw Error('事件与当前任务不一致');
    if(msg.event.type==='submitted'){
      if(activeJob.requestId&&activeJob.requestId!==msg.event.requestId)throw Error('提交编号与原任务不一致');
      activeJob.requestId=msg.event.requestId;activeJob.status='submitted';
      await durableEvent(msg.event,{activeJob});
    }else if(msg.event.type==='failed')await durableEvent(msg.event);
    else await api('/event',msg.event);
    return {ok:true};
  }
  throw Error('不支持的操作');
}
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{const next=tail.then(()=>handle(msg,sender));tail=next.catch(()=>{});next.then(respond,e=>respond({ok:false,error:e.message}));return true;});
chrome.action.onClicked.addListener(()=>chrome.runtime.openOptionsPage());
chrome.alarms.onAlarm.addListener(a=>{if(['director-poll','director-login-retry','director-active-poll'].includes(a.name))void poll();});
chrome.tabs.onUpdated?.addListener((_id,change,tab)=>{if(change.status==='complete'&&doubao(tab.url))void poll();});
chrome.runtime.onStartup.addListener(()=>{void chrome.alarms.create('director-poll',{periodInMinutes:0.5});void poll();});

chrome.runtime.onInstalled?.addListener(()=>{void chrome.alarms.create('director-poll',{periodInMinutes:0.5});void poll();});
