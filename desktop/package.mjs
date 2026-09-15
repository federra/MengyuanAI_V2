import {packager} from '@electron/packager';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readFileSync} from 'node:fs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const {version}=JSON.parse(readFileSync(path.join(dir,'package.json'),'utf8'));
const output=await packager({dir,name:'AI短片导演测试版',out:process.env.DIRECTOR_RELEASE_DIR || path.join(dir,'release',`v${version}`),
  platform:'win32',arch:'x64',electronVersion:'44.3.0',overwrite:false,asar:false,prune:true,
  ...(process.env.ELECTRON_ZIP_DIR ? {electronZipDir:process.env.ELECTRON_ZIP_DIR} : {}),
  icon:path.join(dir,'icon.ico'),
  ignore:[/^\/release(?:\/|$)/,/^\/test-results(?:\/|$)/,/^\/test-.*\.mjs$/,/^\/prepare\.mjs$/,/^\/package\.mjs$/],
  appVersion:version,appCopyright:'AI Director Studio',win32metadata:{CompanyName:'AI Director Studio',FileDescription:'AI短片导演本地测试版',ProductName:'AI短片导演测试版'},
});
console.log(output.join('\n'));
