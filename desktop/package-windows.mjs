import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {packager} from '@electron/packager';
import {build,Platform,Arch} from 'electron-builder';
import config from './build/windows-config.cjs';
import {stageRuntime} from './build/stage-runtime.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const pkg=JSON.parse(await fs.readFile(path.join(here,'package.json'),'utf8'));
const out=path.join(here,'release',`v${pkg.version}`,'windows-installer');
const stage=path.join(out,'source');
await fs.mkdir(out,{recursive:true});await fs.mkdir(stage); // never overwrite an earlier staging run
await stageRuntime(here,root,stage);
const appPkg={...pkg};delete appPkg.devDependencies;delete appPkg.scripts;
await fs.writeFile(path.join(stage,'package.json'),JSON.stringify(appPkg,null,2));
// Install only Windows production dependencies; never copy the developer's node_modules or profile.
const install=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['install','--prefix',stage,'--omit=dev','--ignore-scripts','--os=win32','--cpu=x64','--no-audit','--no-fund'],{stdio:'inherit',shell:process.platform==='win32'});
if(install.status!==0)throw Error('Windows runtime dependency installation failed');
for(const platform of ['darwin','linux','win32/ia32'])await fs.rm(path.join(stage,'node_modules/ffprobe-static/bin',platform),{recursive:true,force:true});
for(const file of await fs.readdir(stage,{recursive:true}))if(file.endsWith('.map')||path.basename(file)==='.DS_Store')await fs.rm(path.join(stage,file),{force:true});
for(const file of ['package-lock.json','node_modules/.package-lock.json'])await fs.rm(path.join(stage,file),{force:true});
const [appDir]=await packager({dir:stage,name:pkg.productName,out:path.join(out,'packaged'),platform:'win32',arch:'x64',electronVersion:config.electronVersion,asar:false,prune:false,overwrite:false,icon:path.join(stage,'icon.ico'),appVersion:pkg.version,win32metadata:{CompanyName:'AI Director Studio',FileDescription:pkg.description,ProductName:pkg.productName},...(process.env.ELECTRON_ZIP_DIR?{electronZipDir:process.env.ELECTRON_ZIP_DIR}:{})});
await fs.mkdir(path.join(appDir,'prerequisites'));
if(!process.env.VC_REDIST_PATH)throw Error('Set VC_REDIST_PATH to Microsoft official VC_redist.x64.exe');
await fs.copyFile(process.env.VC_REDIST_PATH,path.join(appDir,'prerequisites/VC_redist.x64.exe'));
// Prepackaged builds still need the embedded generic provider config for the updater.
await fs.writeFile(path.join(appDir,'resources/app-update.yml'),'provider: generic\nurl: https://121.199.40.214/updates/windows/\nupdaterCacheDirName: mengyuan-director-studio-updater\n');
const built=await build({projectDir:here,prepackaged:appDir,targets:Platform.WINDOWS.createTarget(['nsis'],Arch.x64),publish:'never',config:{...config,directories:{output:path.join(out,'publish')},nsis:{...config.nsis,include:path.join(here,'build/installer.nsh')}}});
const installer=built.find(file=>file.endsWith('.exe'));if(!installer)throw Error('NSIS installer was not created');
// Keep local build diagnostics (including filesystem paths) outside the upload directory.
const debugFile=path.join(out,'publish/builder-debug.yml');
try{await fs.rename(debugFile,path.join(out,'builder-debug.yml'));}catch(error){if(error.code!=='ENOENT')throw error;}
const releaseNotes=await fs.readFile(path.join(here,'release-notes.md'),'utf8');
const release={version:pkg.version,platform:'win32',releaseNotes:releaseNotes.trim(),publishedAt:new Date().toISOString()};
await fs.writeFile(path.join(out,'publish/release.json'),JSON.stringify(release,null,2));
const digest=createHash('sha512').update(await fs.readFile(installer)).digest('base64');
console.log(JSON.stringify({installer,sha512:digest,releaseDirectory:path.join(out,'publish'),published:false},null,2));
