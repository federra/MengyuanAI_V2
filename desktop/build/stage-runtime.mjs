import fs from 'node:fs/promises';
import path from 'node:path';
// Both deliveries copy the same business files and compiled runtime.
export async function stageRuntime(here, root, stage) {
const files=['access-session.cjs','admin-bridge.cjs','usage-outbox.cjs','account-workspace.cjs','main.cjs','preload.cjs','backend.mjs','software-update.cjs','chrome-developer-mode.cjs','chrome-pipe.cjs','close-window.cjs','directory-settings.cjs','doubao-chrome.cjs','doubao-manager.cjs','image-files.cjs','jianying-export.cjs','reload-doubao-extension.cjs','shutdown.cjs','video-files.cjs','icon.ico','使用说明.txt'];
for(const file of files)await fs.copyFile(path.join(here,file),path.join(stage,file));
await fs.cp(path.join(here,'jianying-templates'),path.join(stage,'jianying-templates'),{recursive:true});
await fs.cp(path.join(root,'browser-extension'),path.join(stage,'doubao-extension'),{recursive:true});
for(const part of ['server','client'])await fs.cp(path.join(root,'dist',part),path.join(stage,'runtime',part),{recursive:true});
await fs.mkdir(path.join(stage,'runtime/migrations'));
for(const file of await fs.readdir(path.join(root,'drizzle')))if(file.endsWith('.sql'))await fs.copyFile(path.join(root,'drizzle',file),path.join(stage,'runtime/migrations',file));
await fs.copyFile(path.join(here,'worker.mjs'),path.join(stage,'runtime/server/desktop-entry.mjs'));
await fs.rm(path.join(stage,'runtime/client/doubao-extension.zip'),{force:true});
}
