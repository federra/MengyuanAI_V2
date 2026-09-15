const {EventEmitter} = require('node:events');
const UPDATE_BASE = 'https://121.199.40.214/updates/windows/';
function compareVersions(a,b) {
  const parse=value=>{if(typeof value!=='string'||!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(value))throw Error('更新版本号格式无效');return value.split('.').map(Number)};
  const aa=parse(a),bb=parse(b);
  for(let i=0;i<3;i++){if(aa[i]!==bb[i])return aa[i]>bb[i]?1:-1;}
  return 0;
}
async function readRelease(fetcher,url=UPDATE_BASE+'release.json') {
  const response=await fetcher(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
  if(response.status===404)return null;
  if(!response.ok)throw Error(`更新服务返回${response.status}，请稍后重试。`);
  const reader=response.body?.getReader();if(!reader)throw Error('更新信息为空');
  const decoder=new TextDecoder();let text='',size=0;
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw Error('更新信息过大');text+=decoder.decode(value,{stream:true});}
    text+=decoder.decode();
  } finally {await reader.cancel().catch(()=>{});}
  let info;try{info=JSON.parse(text)}catch{throw Error('更新信息格式无效，请联系发布者。')}
  compareVersions(info?.version,'0.0.0');
  if(info.platform!=='win32'||typeof info.releaseNotes!=='string'||info.releaseNotes.length>20000)throw Error('更新信息格式无效，请联系发布者。');
  return {version:info.version,releaseNotes:info.releaseNotes,platform:info.platform};
}
class SoftwareUpdate extends EventEmitter {
  constructor({version,canInstall=false,updater,fetch=globalThis.fetch,requestInstall=()=>{},onInstallError=()=>{}}) {
    super();this.updater=updater;this.fetch=fetch;this.requestInstall=requestInstall;this.onInstallError=onInstallError;
    this.state={currentVersion:version,availableVersion:null,releaseNotes:'',canInstall,status:'idle',progress:0,downloaded:false,message:''};
    this.operation=null;
    if(updater){
      updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.autoRunAppAfterInstall=true;updater.allowDowngrade=false;updater.allowPrerelease=false;
      updater.on('download-progress',p=>{if(this.state.status==='downloading')this.set({progress:Math.max(0,Math.min(100,Number(p.percent)||0))});});
      updater.on('error',error=>{if(this.state.status==='installing'){this.set({status:'error',message:'启动安装程序失败，请重启软件后重试。'});this.onInstallError(error);}});
    }
  }
  snapshot(){return {...this.state};}
  set(patch){Object.assign(this.state,patch);this.emit('state',this.snapshot());}
  run(work){if(this.operation)return this.operation;this.operation=Promise.resolve().then(work).finally(()=>{this.operation=null});return this.operation;}
  check(){return this.run(async()=>{
    if(['downloaded','installing'].includes(this.state.status))return this.snapshot();
    this.set({status:'checking',message:'正在检查更新…',availableVersion:null,releaseNotes:'',downloaded:false,progress:0});
    try {
      const info=await readRelease(this.fetch);
      if(!info)this.set({status:'unpublished',message:'更新服务尚未发布版本，请稍后检查。'});
      else if(compareVersions(info.version,this.state.currentVersion)<=0)this.set({status:'current',availableVersion:info.version,releaseNotes:info.releaseNotes,message:'当前已是最新版。'});
      else this.set({status:'available',availableVersion:info.version,releaseNotes:info.releaseNotes,message:'发现新版本。'});
    }catch(error){this.set({status:'error',message:error.name==='TimeoutError'?'检查更新超时，请检查网络后重试。':`检查更新失败：${error.message}`});}
    return this.snapshot();
  });}
  downloadAndInstall(){
    if(this.state.status==='installing')return Promise.resolve(this.snapshot());
    if(!this.state.canInstall||!this.updater)return Promise.reject(Error('自动安装仅支持正式Windows安装版；当前环境可检查更新。'));
    return this.run(async()=>{
      if(!this.state.availableVersion||compareVersions(this.state.availableVersion,this.state.currentVersion)<=0)throw Error('请先检查可用更新。');
      try {
        if(!this.state.downloaded){
          this.set({status:'downloading',progress:0,message:'正在下载更新并校验完整性…'});
          const result=await this.updater.checkForUpdates();
          if(result?.updateInfo?.version!==this.state.availableVersion)throw Error('发布版本发生变化，请重新检查更新。');
          await this.updater.downloadUpdate();
          this.set({downloaded:true,progress:100,status:'downloaded',message:'下载完成，准备退出安装。'});
        }
        this.set({status:'installing',message:'准备退出并安装；如有未保存内容，请处理保存提示。'});
        await this.requestInstall();
      }catch(error){this.set({status:this.state.downloaded?'downloaded':'error',message:`更新未完成：${error.message}`});}
      return this.snapshot();
    });
  }
  cancelInstall(){this.set({status:'downloaded',message:'已保留下载。请保存项目或等待任务结束，再点击“下载并安装”。'});}
  installDownloaded(){
    if(!this.state.downloaded||!this.updater)throw Error('没有已校验的更新包');
    this.set({status:'installing',message:'正在安装更新…'});
    this.updater.quitAndInstall(true,true);
  }
}
module.exports={SoftwareUpdate,compareVersions,readRelease,UPDATE_BASE};
