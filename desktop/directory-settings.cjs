const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
async function canonical(p){
  try{return await fs.realpath(p);}catch(e){if(e.code!=='ENOENT')throw e;const parent=path.dirname(p);if(parent===p)throw e;return path.join(await canonical(parent),path.basename(p));}
}
async function validateTarget(old,target){
  const a=(await canonical(path.resolve(old))).toLowerCase(),b=(await canonical(path.resolve(target))).toLowerCase();
  if(a===b)return false;
  if(b.startsWith(a+path.sep)||a.startsWith(b+path.sep))throw Error('新项目目录不能与当前项目目录互相包含');
  const entries=await fs.readdir(target).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  if(entries.length)throw Error('迁移项目请选择空目录，避免覆盖已有文件');
  return true;
}
class DirectorySettings {
  constructor(userData,localAppData){this.file=path.join(userData,'directory-settings.json');this.defaults={workspaceDir:path.join(userData,'workspace'),jianyingDraftDir:path.join(localAppData,'JianyingPro','User Data','Projects','com.lveditor.draft')};this.value={...this.defaults};}
  async persist(){await fs.mkdir(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';await fs.writeFile(temp,JSON.stringify(this.value,null,2));await fs.rename(temp,this.file);}
  async load(){try{this.value={...this.defaults,...JSON.parse(await fs.readFile(this.file,'utf8'))};}catch(e){if(e.code!=='ENOENT')throw Error('目录设置文件无法读取，请检查 directory-settings.json');}return this.value;}
  async save(input){
    const draft=input.jianyingDraftDir,workspace=input.workspaceDir;
    for(const p of [draft,workspace])if(typeof p!=='string'||!path.isAbsolute(p))throw Error('请选择完整的本地目录');
    const next=path.resolve(workspace),old=path.resolve(this.value.workspaceDir);
    const changed=await validateTarget(old,next);
    this.value={...this.value,jianyingDraftDir:path.resolve(draft),pendingWorkspaceDir:changed?next:undefined};
    await this.persist();return this.value;
  }
  async applyPending(){
    const target=this.value.pendingWorkspaceDir;if(!target)return;
    const old=this.value.workspaceDir;
    if(!path.isAbsolute(target)||!path.isAbsolute(old))throw Error('项目目录必须为完整路径');
    if(!await validateTarget(old,target)){this.value.pendingWorkspaceDir=undefined;await this.persist();return;}
    // Runs before the database starts. Never copy an open SQLite database or
    // delete the old workspace; the old tree remains a recovery copy.
    const entries=await fs.readdir(target).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
    if(entries.length)throw Error('新项目目录已含文件，迁移已停止，原项目仍保留');
    const stage=path.join(path.dirname(target),'.director-migrate-'+randomUUID());
    await fs.mkdir(path.dirname(target),{recursive:true});
    const exists=await fs.stat(old).then(()=>true).catch(e=>{if(e.code==='ENOENT')return false;throw e;});
    if(exists)await fs.cp(old,stage,{recursive:true,errorOnExist:true,force:false});else await fs.mkdir(stage,{recursive:true});
    await fs.rmdir(target).catch(e=>{if(e.code!=='ENOENT')throw e;});
    await fs.rename(stage,target);
    this.value={...this.value,workspaceDir:target,pendingWorkspaceDir:undefined};await this.persist();
  }
}
module.exports={DirectorySettings};
