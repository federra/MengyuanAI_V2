// Real SQLite and actual HTTP handlers, isolated from desktop/account data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {newProject,newShot} from '../work/test/studio.mjs';
const dir=path.resolve('work/project-trash-test');await fs.mkdir(dir,{recursive:true});
const sqlite=new DatabaseSync(':memory:');
for(const file of (await fs.readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(await fs.readFile('drizzle/'+file,'utf8'));
assert(sqlite.prepare('PRAGMA table_info(projects)').all().some(c=>c.name==='deleted_at'),'migration adds recycle metadata');
assert(sqlite.prepare('PRAGMA index_list(projects)').all().some(c=>c.name==='idx_projects_deleted_at'));
globalThis.__trashTestDb=sqlite;
await fs.writeFile(path.join(dir,'server.mjs'),`
const sqlite=globalThis.__trashTestDb;
export function db(){return {prepare(sql){let args=[];return {bind(...v){args=v;return this},async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}}},async all(){return {results:sqlite.prepare(sql).all(...args)}},async first(){return sqlite.prepare(sql).get(...args)||null}}},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};}
export function json(body,status=200){return Response.json(body,{status});}
export function usageOwner(){return null;}
export function sameOrigin(req){if(req.headers.get('origin')!==new URL(req.url).origin)throw Error('不允许跨站写入');}
`);
async function compile(file,name){const source=await fs.readFile(file,'utf8');const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText
.replaceAll("'@/lib/server'","'./server.mjs'").replaceAll("'./server'","'./server.mjs'")
.replaceAll("'@/lib/usage-server'","'./server.mjs'")
.replaceAll("'@/lib/studio'",`'${pathToFileURL(path.resolve('work/test/studio.mjs')).href}'`)
.replaceAll("'@/lib/project-trash-server'","'./project-trash-server.mjs'")
.replaceAll("'./project-trash'","'./project-trash.mjs'")
.replaceAll("'@/lib/project-trash'","'./project-trash.mjs'");
const target=path.join(dir,name+'.mjs');await fs.writeFile(target,code);return import(pathToFileURL(target).href);}
for(const [file,name] of [['lib/project-trash.ts','project-trash'],['lib/project-trash-server.ts','project-trash-server']]){
 if(await fs.access(file).then(()=>true).catch(()=>false))await compile(file,name);
}
const projects=await compile('app/api/projects/route.ts','projects');
const originalNow=Date.now;const now=Date.parse('2026-10-05T00:00:00Z');Date.now=()=>now;
const period=30*24*60*60*1000;
const p=newProject('回收站测试');p.revision=1;p.script='不可丢失的正文';p.shots=[newShot()];
p.shots[0].video={id:'22222222-2222-4222-8222-222222222222',url:'/api/media/22222222-2222-4222-8222-222222222222',name:'片段.mp4',type:'video/mp4'};
p.assets=[{id:'33333333-3333-4333-8333-333333333333',kind:'人物',name:'甲',description:'原设定'}];
const insert=(value,deleted=null)=>sqlite.prepare('INSERT INTO projects(id,title,body,revision,updated_at,deleted_at) VALUES(?,?,?,?,?,?)').run(value.id,value.title,JSON.stringify(value),value.revision,value.updatedAt,deleted);
const old={...structuredClone(p),id:crypto.randomUUID(),title:'已删项目'};insert(p);insert(old,now-1000);
try{
 assert.deepEqual((await (await projects.GET()).json()).map(p=>p.id),[p.id],'project center must exclude recycled projects');
 const trash=await compile('app/api/projects/trash/route.ts','trash');
 const item=await compile('app/api/projects/[id]/route.ts','item');
 const restore=await compile('app/api/projects/[id]/restore/route.ts','restore');
 const req=(method,body,origin='https://studio.example')=>new Request('https://studio.example/api/projects/'+p.id,{method:method==='DELETE'?'DELETE':'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const ctx={params:Promise.resolve({id:p.id})};
 let r=await item.DELETE(req('DELETE',{revision:1},'https://evil.example'),ctx);assert.equal(r.status,400);
 r=await item.DELETE(req('DELETE',{revision:2}),ctx);assert.equal(r.status,409);
 r=await item.DELETE(req('DELETE',{revision:1}),ctx);assert.equal(r.status,200);
 assert.equal((await (await projects.GET()).json()).length,0);
 let entries=await (await trash.GET()).json();const recycled=entries.find(e=>e.project.id===p.id);
 assert.equal(recycled.deletedAt,now);assert.equal(recycled.expiresAt,now+period);
 assert.equal(recycled.project.script,p.script);assert.deepEqual(recycled.project.assets,p.assets);assert.deepEqual(recycled.project.shots,p.shots);
 r=await projects.POST(req('POST',{...p,script:'旧窗口试图覆盖'}));assert.equal(r.status,409,'stale save must not resurrect deleted project');
 r=await restore.POST(req('POST',{revision:recycled.project.revision}),ctx);assert.equal(r.status,200);
 const restored=await r.json();assert.equal(restored.id,p.id);assert.equal(restored.script,p.script);assert.equal(restored.revision,3);
 r=await projects.POST(req('POST',{...p,script:'删除前版本'}));assert.equal(r.status,409,'restore invalidates pre-deletion revisions');
 r=await projects.POST(req('POST',{...restored,script:'恢复后编辑'}));assert.equal(r.status,200);const saved=await r.json();
 r=await item.DELETE(req('DELETE',{revision:saved.revision}),ctx);assert.equal(r.status,200);
 assert.equal((await r.json()).expiresAt,now+period,'second deletion gets a fresh retention interval');
 const deadline={...structuredClone(p),id:crypto.randomUUID(),title:'刚到期'};insert(deadline,now-period);
 const within={...structuredClone(p),id:crypto.randomUUID(),title:'还差1毫秒'};insert(within,now-period+1);
 entries=await (await trash.GET()).json();assert(!entries.some(e=>e.project.id===deadline.id));assert(entries.some(e=>e.project.id===within.id));
 assert.equal(sqlite.prepare('SELECT id FROM projects WHERE id=?').get(deadline.id),undefined,'expired record must be physically cleared');
 const expiredCtx={params:Promise.resolve({id:deadline.id})};assert.equal((await restore.POST(req('POST',{revision:1}),expiredCtx)).status,409);
 assert.equal(sqlite.prepare('SELECT body FROM projects WHERE id=?').get(within.id).body,JSON.stringify(within));
 const active={...structuredClone(p),id:crypto.randomUUID(),title:'不可清空的正常项目'};insert(active);
 const activeBody=sqlite.prepare('SELECT body FROM projects WHERE id=?').get(active.id).body;
 const pending=await (await trash.GET()).json();assert(pending.length>0);
 assert.equal(typeof trash.DELETE,'function','trash exposes explicit clear operation');
 let clear=await trash.DELETE(req('DELETE',{},'https://evil.example'));assert.equal(clear.status,400);
 assert.equal((await (await trash.GET()).json()).length,pending.length,'cross-site clearing must not delete anything');
 clear=await trash.DELETE(req('DELETE',{}));assert.equal(clear.status,200);assert.equal((await clear.json()).clearedCount,pending.length);
 assert.equal((await (await trash.GET()).json()).length,0);
 assert.equal(sqlite.prepare('SELECT body FROM projects WHERE id=?').get(active.id).body,activeBody,'clearing must preserve active project content');
 assert.equal((await restore.POST(req('POST',{revision:within.revision}),{params:Promise.resolve({id:within.id})})).status,409,'cleared project cannot be restored');
 clear=await trash.DELETE(req('DELETE',{}));assert.equal((await clear.json()).clearedCount,0,'empty clearing is idempotent');
 console.log('PASS actual SQLite soft deletion, exact 30-day expiry, restore/content/media retention, fresh deadline, revision races, cross-origin rejection and permanent clear limited to recycled records');
}finally{Date.now=originalNow;sqlite.close();delete globalThis.__trashTestDb;}
