import {Miniflare, Log, LogLevel} from 'miniflare';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
let mf;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  if (mf) await mf.dispose();
  process.exit(0);
}
process.on('disconnect', close);
process.on('SIGTERM', close);
process.on('SIGINT', close);
process.on('message', async message => {
  if (message?.type === 'stop') return close();
  if (message?.type !== 'start' || mf) return;
  try {
    const {dataDir, encryptionKey, token} = message;
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
      bindings:{MODEL_ENCRYPTION_KEY:encryptionKey, DESKTOP_SESSION_TOKEN:token},
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
    process.send?.({type:'ready',url});
  } catch(error) {
    process.send?.({type:'error',message:error instanceof Error?error.message:'本地服务启动失败'});
    await close();
  }
});
