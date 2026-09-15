import {UsageOutbox} from './usage-outbox.cjs';
import {Miniflare, Log, LogLevel} from 'miniflare';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
let mf;
let closing = false;
let accessAllowed=true, finishingTimer, finishing=false;
const authorizationRequests = new Map();
let requestSequence = 0;
let workspaceDataDir, usage, usageTimer;
const usageUploads=new Map();
function uploadUsage(events) {
  return new Promise((resolve,reject)=>{
    const id=++requestSequence;
    const timer=setTimeout(()=>{usageUploads.delete(id);reject(Error('UPLOAD_TIMEOUT'));},15000);
    usageUploads.set(id, {resolve,reject,timer});
    process.send?.({type:'usage-upload',id,ownerId:usage.owner.id,events});
  });
}
async function authorize(request) {
  if(new URL(request.url).pathname==='/finish'){process.send?.({type:'activity-finished'});return new Response('ok');}
  if(new URL(request.url).pathname==='/completed'){
    const body=await request.text();
    if(!workspaceDataDir||body.length>3_000_000)return new Response('Invalid result',{status:400});
    const directory=path.join(workspaceDataDir,'completed-results');
    await fs.mkdir(directory,{recursive:true,mode:0o700});
    await fs.writeFile(path.join(directory,crypto.randomUUID()+'.json'),body,{flag:'wx',mode:0o600});
    return new Response('saved');
  }
  return new Promise(resolve => {
    const id = ++requestSequence;
    const timer = setTimeout(() => {authorizationRequests.delete(id);resolve(Response.json({error:'CONNECTION_FAILED'},{status:503}));},12000);
    authorizationRequests.set(id, result => {clearTimeout(timer);resolve(Response.json(result,{status:result.authorized?200:401}));});
    process.send?.({type:'authorize',id});
  });
}
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(finishingTimer);
  clearInterval(usageTimer);
  if (mf) await mf.dispose();
  process.exit(0);
}
process.on('disconnect', close);
process.on('SIGTERM', close);
process.on('SIGINT', close);
process.on('message', async message => {
  if(message?.type==='usage-upload-result'){
    const pending=usageUploads.get(message.id);if(pending){clearTimeout(pending.timer);usageUploads.delete(message.id);if(message.error)pending.reject(Error(message.error));else pending.resolve(message.data);}return;
  }
  if(message?.type==='usage-command'){
    try {
      if(!usage)throw Error('USAGE_NOT_READY');
      if(message.action==='file-begin')await usage.record(message.event,'file_pending',message.details);
      else if(message.action==='file-complete')await usage.complete(message.eventId,message.created);
      else throw Error('INVALID_USAGE_COMMAND');
      process.send?.({type:'usage-command-result',id:message.id,ok:true});
    }catch{process.send?.({type:'usage-command-result',id:message.id,error:'USAGE_WRITE_FAILED'});}return;
  }
  if(message?.type==='access-state'){accessAllowed=message.authorized===true;return;}
  if (message?.type === 'authorization') {authorizationRequests.get(message.id)?.(message.state);authorizationRequests.delete(message.id);return;}
  if (message?.type === 'stop') return close();
  if (message?.type !== 'start' || mf) return;
  try {
    const {dataDir, encryptionKey, token, ownerId='', ownerRole='', internalToken=''} = message;
    workspaceDataDir=ownerId?dataDir:undefined;
    if (!path.isAbsolute(dataDir) || !encryptionKey || !token) throw Error('本地启动参数不完整');
    await fs.mkdir(dataDir,{recursive:true});
    const serverDir=path.join(here,'runtime/server');
    const modulePaths=(await fs.readdir(serverDir,{recursive:true})).filter(file=>/\.(m?js)$/.test(file) && file!=='desktop-entry.mjs');
    mf = new Miniflare({
      name:'ai-director-desktop', rootPath:path.join(here,'runtime/server'),
      scriptPath:path.join(here,'runtime/server/desktop-entry.mjs'),
      modulesRoot:serverDir,
      modules:['desktop-entry.mjs',...modulePaths].map(file=>({type:'ESModule',path:path.join(serverDir,file)})),
      compatibilityDate:'2026-05-15', compatibilityFlags:['nodejs_compat'],
      host:'127.0.0.1', port:0, cf:false, log:new Log(LogLevel.ERROR),
      bindings:{MODEL_ENCRYPTION_KEY:encryptionKey, DESKTOP_SESSION_TOKEN:token, DESKTOP_OWNER_ID:ownerId, DESKTOP_OWNER_ROLE:ownerRole, DESKTOP_INTERNAL_TOKEN:internalToken},
      serviceBindings:{DESKTOP_AUTH:authorize},
      d1Databases:{DB:'ai-director-desktop-db'}, d1Persist:path.join(dataDir,'d1'),
      r2Buckets:{FILES:'ai-director-desktop-files'}, r2Persist:path.join(dataDir,'r2'),
      cachePersist:path.join(dataDir,'cache'),
      assets:{directory:path.join(here,'runtime/client'), binding:'ASSETS',
        routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},
    });
    const url = (await mf.ready).origin;
    const db = await mf.getD1Database('DB');
    await db.prepare('CREATE TABLE IF NOT EXISTS desktop_migrations (name TEXT PRIMARY KEY NOT NULL)').run();
    for (const file of (await fs.readdir(path.join(here,'runtime/migrations'))).filter(f=>f.endsWith('.sql')).sort()) {
      if (await db.prepare('SELECT name FROM desktop_migrations WHERE name=?').bind(file).first()) continue;
      const sql = await fs.readFile(path.join(here,'runtime/migrations',file),'utf8');
      const statements = sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s));
      await db.batch([...statements, db.prepare('INSERT INTO desktop_migrations(name) VALUES(?)').bind(file)]);
    }
    if(ownerId&&['member','super_admin'].includes(ownerRole)){
      usage=new UsageOutbox(db,{id:ownerId,role:ownerRole});await usage.init();await usage.recoverFiles();
      usageTimer=setInterval(()=>{if(accessAllowed&&!closing)void usage.flush(uploadUsage);},15000);usageTimer.unref();
    }
    if(ownerId&&internalToken){
      finishingTimer=setInterval(async()=>{
        if(accessAllowed||finishing||closing)return;
        finishing=true;
        try{
          const rows=await db.prepare("SELECT id FROM generation_jobs WHERE status='running' AND remote_id IS NOT NULL AND remote_id!='' LIMIT 20").all();
          for(const row of rows.results){
            if(accessAllowed||closing)break;
            const result=await fetch(url+'/api/generations',{method:'POST',headers:{Cookie:`director_session=${token}`,Origin:url,'Content-Type':'application/json','x-director-finish':internalToken},body:JSON.stringify({action:'refresh',id:row.id})});
            await result.arrayBuffer();
          }
        }catch{/* Existing remote IDs remain durable for the next retry. */}
        finally{finishing=false;}
      },15000);
      finishingTimer.unref();
    }
    process.send?.({type:'ready',url});
  } catch(error) {
    process.send?.({type:'error',message:error instanceof Error?error.message:'本地服务启动失败'});
    await close();
  }
});
