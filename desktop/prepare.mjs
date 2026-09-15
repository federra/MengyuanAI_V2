import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.dirname(here);
const runtime = path.join(here, 'runtime');
await fs.access(path.join(project, 'dist/server/index.js'));
// Copy the successful build into the desktop package; no cloud data or secrets.
await fs.mkdir(runtime, {recursive: true});
for (const part of ['server','client']) await fs.cp(path.join(project,'dist',part), path.join(runtime,part), {recursive:true});
await fs.mkdir(path.join(runtime,'migrations'),{recursive:true});
for (const file of (await fs.readdir(path.join(project,'drizzle'))).filter(f=>f.endsWith('.sql')))
  await fs.copyFile(path.join(project,'drizzle',file),path.join(runtime,'migrations',file));
await fs.copyFile(path.join(here,'worker.mjs'),path.join(runtime,'server/desktop-entry.mjs'));
await fs.cp(path.join(project,'browser-extension'),path.join(here,'doubao-extension'),{recursive:true});
console.log('Desktop runtime prepared.');
