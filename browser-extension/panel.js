import {validateBundle,safeName} from './contract.js';
import {fillPrompt} from './fill.js';
const $=id=>document.getElementById(id);let bundle,current;
const status=text=>{$('status').textContent=text;};
const bridgeRequest=async msg=>{const r=await chrome.runtime.sendMessage(msg);if(r?.ok===false)throw Error(r.error);return r;};
let bridgeJob='';
$('connect').onclick=async()=>{try{await bridgeRequest({type:'connect',connection:JSON.parse($('connection').value)});$('connection').value='';await refreshBridge();}catch(e){$('bridge').textContent=e.message;}};
$('disconnect').onclick=async()=>{try{await bridgeRequest({type:'disconnect'});$('bridge').textContent='已断开账号连接';bridgeJob='';}catch(e){$('bridge').textContent=e.message;}};
$('prepare').onclick=async()=>{try{const r=await bridgeRequest({type:'prepare'});$('bridge').textContent=r?.error||'准备完成，请在豆包核对参数和附件';}catch(e){$('bridge').textContent=e.message;}};
async function refreshBridge(){
  try{const r=await bridgeRequest({type:'bridgeState'});$('bridge').textContent=(r.accountName?r.accountName+' · ':'')+(r.bridgeStatus||'尚未配对');
    if(r.activeJob?.id&&r.activeJob.id!==bridgeJob){bridgeJob=r.activeJob.id;bundle=validateBundle(r.activeJob.bundle);await stored(bundle);render();}
    $('originals').replaceChildren();for(const m of [...(r.originals||[])].reverse()){const b=document.createElement('button');b.textContent=`下载${m.kind==='image'?'原始图片':'原始视频'} · ${new Date(m.foundAt).toLocaleTimeString()}`;b.onclick=async()=>{try{await bridgeRequest({type:'downloadOriginal',media:m});status('已开始下载原始文件');}catch(e){status(e.message);}};$('originals').append(b);}
  }catch(e){$('bridge').textContent=e.message;}
}
setInterval(()=>void refreshBridge(),5000);
void refreshBridge();
const database=new Promise((resolve,reject)=>{const request=indexedDB.open('director-doubao',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
async function stored(value){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('workspace',value?'readwrite':'readonly');const r=value?tx.objectStore('workspace').put(value,'current'):tx.objectStore('workspace').get('current');tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);});}
function render(){
  $('project').textContent=bundle.projectTitle || '工作台项目';$('tasks').replaceChildren();
  bundle.tasks.forEach((task,i)=>{const button=document.createElement('button');button.textContent=`${i+1}. ${task.title}`;button.onclick=()=>show(task);$('tasks').append(button);});show(bundle.tasks[0]);
}
function show(task){
  current=task;$('detail').hidden=false;$('title').textContent=task.title;$('settings').textContent=`目标时长 ${task.duration} 秒 · ${task.ratio} · ${task.references.length} 张参考图；实际可选参数以豆包页面为准`;$('prompt').value=task.prompt;
  [...$('tasks').children].forEach((b,i)=>b.classList.toggle('active',bundle.tasks[i].id===task.id));$('references').replaceChildren();
  task.references.forEach((ref,i)=>{const media=bundle.media.find(m=>m.id===ref.mediaId);const box=document.createElement('div');box.className='reference';const img=document.createElement('img');img.src=media.dataUrl;img.alt=ref.label;const p=document.createElement('p');p.textContent=ref.label;const button=document.createElement('button');button.textContent=`下载参考图${i+1}`;button.onclick=()=>chrome.downloads.download({url:media.dataUrl,filename:`AI短片导演/${safeName(task.title)}/${String(i+1).padStart(2,'0')}-${safeName(media.name)}`,saveAs:false}).catch(e=>status(e.message));box.append(img,p,button);$('references').append(box);});
}
$('import').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{status('正在读取任务包…');const next=validateBundle(JSON.parse(await file.text()));await stored(next);bundle=next;render();status(`已导入 ${bundle.tasks.length} 个分镜。任务只保存在本机插件中。`);}catch(e){status(e.message);}finally{e.target.value='';}};
$('login').onclick=()=>chrome.tabs.create({url:'https://www.doubao.com/chat/create-image'});
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(current.prompt);status('已复制完整提示词，请按顺序上传参考图。');}catch{status('复制失败，请选中提示词手动复制。');}};
$('fill').onclick=async()=>{try{const tabs=await chrome.tabs.query({url:['https://www.doubao.com/*','https://doubao.com/*']});if(tabs.length!==1)throw Error(tabs.length?'请只保留一个准备提交的豆包标签页，避免填写到错误对话。':'请先打开豆包并登录。');const result=await chrome.scripting.executeScript({target:{tabId:tabs[0].id},func:fillPrompt,args:[current.prompt]});if(!result[0]?.result?.ok)throw Error(result[0]?.result?.error || '输入框识别失败，请手动粘贴');await chrome.tabs.update(tabs[0].id,{active:true});status('提示词已填入。请按顺序上传参考图，核对时长、画幅、图号后在豆包提交。尚未生成视频。');}catch(e){status(e.message);}};
$('result').onchange=async e=>{const file=e.target.files?.[0];const task=current;if(!file||!task)return;try{if(!['video/mp4','video/webm'].includes(file.type)||file.size>50*1024*1024)throw Error('请选择不超过50MB的MP4或WebM视频');const url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);});const result={format:'director-doubao-result',version:1,projectId:bundle.projectId,shotId:task.id,videoName:file.name,mime:file.type,base64:url.split(',')[1]};const objectUrl=URL.createObjectURL(new Blob([JSON.stringify(result)],{type:'application/json'}));await chrome.downloads.download({url:objectUrl,filename:`${safeName(task.title)}-豆包结果.json`,saveAs:true});setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);status('结果包已导出。回到工作台的豆包插件面板导入，即可返回原分镜。');}catch(e){status(e.message);}finally{e.target.value='';}};
try{const saved=await stored();if(saved){bundle=validateBundle(saved);render();status('已恢复上次导入的任务包。');}}catch(e){status(`本地任务读取失败：${e.message}`);}
