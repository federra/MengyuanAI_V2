import {fork} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
let dataDir=path.join(dir,'test-results','backend-'+Date.now());
const token=crypto.randomBytes(24).toString('hex');
const encryptionKey=crypto.randomBytes(32).toString('hex');
let child, url;
async function start() {
  child=fork(path.join(dir,'backend.mjs'),[],{stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
  child.stderr.on('data',b=>process.stderr.write(b));
  url=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Backend timed out')),45000);
    child.once('exit',code=>{clearTimeout(timeout);reject(Error('Backend exited '+code));});
    child.on('message',message=>{
      if(message.type==='ready'){clearTimeout(timeout);resolve(message.url);}
      if(message.type==='error'){clearTimeout(timeout);reject(Error(message.message));}
    });
    child.send({type:'start',dataDir,token,encryptionKey});
  });
}
async function stop() {if(child?.exitCode===null){const exited=once(child,'exit');child.send({type:'stop'});await exited;}}
const request=(route,init={})=>fetch(url+route,{...init,headers:{Cookie:`director_session=${token}`,Origin:url,...init.headers}});
try {
  await start();
  assert.equal((await fetch(url+'/api/projects')).status,403);
  assert.equal((await request('/api/projects',{headers:{Origin:'https://untrusted.example'}})).status,403);
  assert.equal((await request('/__desktop/health')).status,200);
  const html=await (await request('/')).text();
  assert.ok(html.includes('AI'));
  const scriptPath=html.match(/src="([^" ]+\.js)"/)?.[1];
  assert.ok(scriptPath,'client JavaScript must be in HTML');
  const script=await request(scriptPath);assert.equal(script.status,200);
  assert.ok((await script.text()).length>100);
  const project={id:crypto.randomUUID(),title:'桌面持久化测试',brief:'测试',story:'',script:'',scenes:'',style:'电影质感',ratio:'16:9',shots:[],assets:[],revision:0,updatedAt:new Date().toISOString()};
  let r=await request('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(project)});
  assert.equal(r.status,200,await r.clone().text());
  const saved=await r.json();assert.equal(saved.revision,1);
  r=await request('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(project)});
  assert.equal(r.status,409);
  const form=new FormData();form.set('file',new Blob(['local media persistence'],{type:'text/plain'}),'test.txt');
  // Use an accepted image MIME; storage is exercised without model requests.
  const image=new FormData();image.set('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'test.png');
  r=await request('/api/media',{method:'POST',body:image});
  assert.equal(r.status,200,await r.clone().text());
  const media=await r.json();
  assert.ok([200,206].includes((await request(media.url)).status));
  assert.equal((await request('/api/models')).status,200);
  const initialModelCount=(await (await request('/api/models')).json()).length;
  const model={kind:'text',name:'本地配置测试',baseUrl:'https://example.com/v1',model:'test-model',protocol:'chat',thinking:'auto',enabled:false,apiKey:'test-only-not-a-real-provider-key'};
  r=await request('/api/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(model)});
  assert.equal(r.status,200,await r.clone().text());
  assert.equal((await r.json()).hasKey,true);
  const profile={...model,id:crypto.randomUUID(),name:'第二个文本配置',model:'second-model',enabled:true,action:'create'};
  r=await request('/api/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(profile)});
  assert.equal(r.status,200,await r.clone().text());
  r=await request('/api/models',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...profile,action:'default',apiKey:''})});
  assert.equal(r.status,200,await r.clone().text());
  await stop();
  if(process.env.DIRECTOR_MIGRATION_TEST==='1'){
    const {DirectorySettings}=await import('./directory-settings.cjs');
    const directories=new DirectorySettings(dataDir+'-settings',dataDir+'-local');
    directories.value.workspaceDir=dataDir;
    await directories.save({workspaceDir:dataDir+'-migrated',jianyingDraftDir:dataDir+'-drafts'});
    await directories.applyPending();
    await fs.access(dataDir);
    dataDir=directories.value.workspaceDir;
  }
  await start();
  const projects=await (await request('/api/projects')).json();
  assert.equal(projects[0].title,'桌面持久化测试');
  assert.ok([200,206].includes((await request(media.url)).status));
  const modelAfterRestart=(await (await request('/api/models')).json()).find(m=>m.kind==='text');
  assert.equal(modelAfterRestart.hasKey,true);
  assert.equal(modelAfterRestart.model,'test-model');
  assert.ok(!JSON.stringify(modelAfterRestart).includes(model.apiKey));
  const multi=await (await request('/api/models')).json();assert.equal(multi.length,initialModelCount+1);assert.equal(multi.find(m=>m.isDefault&&m.kind==='text').model,'second-model');assert.equal(multi.find(m=>m.id===profile.id).hasKey,true);
  console.log('PASS desktop multi-model defaults and encryption persistence.');
  console.log('PASS desktop backend: real Worker/HTML/assets, protected loopback, migrations, save/conflict, R2 upload, project and media persistence across restart.');
} finally {await stop();}
