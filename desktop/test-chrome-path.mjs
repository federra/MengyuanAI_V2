import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const source = await fs.readFile(new URL('./doubao-chrome.cjs', import.meta.url), 'utf8');

// Exercise the actual locator with simulated OS/filesystem boundaries so both
// platforms can be checked without installing browsers or changing this machine.
function locator(platform, installed, env = {}, registry = {}, files = new Map()) {
  const module = {exports: {}};
  vm.runInNewContext(source, {
    module,
    process: {platform, env},
    require(name) {
      if (name === 'node:os') return {homedir: () => '/Users/Test User'};
      if (name === 'node:path') return platform === 'win32' ? require(name).win32 : require(name).posix;
      if(name==='node:child_process')return {...require(name),execFile(file,args,options,done){
        assert.equal(options.shell,false);assert(options.timeout<=1500);
        const result=registry[args[1]+' '+args.at(-1)];done(result?null:Error('missing'),result||'');
      }};
      if (name === 'node:fs/promises') return {
      async stat(file){if(!installed.includes(file))throw Error('missing');return {isFile:()=>true};},
      async mkdir(){},async writeFile(file,text){files.set(file,text);},async rename(a,b){files.set(b,files.get(a));files.delete(a);},
      async readFile(file){if(!files.has(file))throw Object.assign(Error('missing'),{code:'ENOENT'});return files.get(file);},
      async access(file) {
        if (!installed.includes(file)) throw Object.assign(Error('Not found'), {code: 'ENOENT'});
      }};
      return require(name);
    },
  });
  return Object.assign(module.exports.findChrome,module.exports);
}

const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userChrome = '/Users/Test User/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
assert.equal(await locator('darwin', [systemChrome, userChrome])(), systemChrome);
assert.equal(await locator('darwin', [userChrome])(), userChrome);
await assert.rejects(locator('darwin', []), /未找到 Google Chrome/);

const env = {PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local'};
const windowsPaths = Object.values(env).map(root => root + '\\Google\\Chrome\\Application\\chrome.exe');
for (let i = 0; i < windowsPaths.length; i++)
  assert.equal(await locator('win32', windowsPaths.slice(i), env)(), windowsPaths[i]);
await assert.rejects(locator('win32', [], env), /未找到 Google Chrome/);
console.log('PASS Chrome discovery: macOS system/user installations, paths with spaces, Windows install locations, and missing-browser errors.');

const custom='D:\\Apps With Spaces\\Google Chrome\\chrome.exe';
const key='HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe /reg:32';
assert.equal(await locator('win32',[custom],env,{[key]:`(Default) REG_SZ "${custom}"`})(),custom);
assert.equal(await locator('win32',[windowsPaths[0]],{ProgramFiles:env.PROGRAMFILES})(),windowsPaths[0]);
const files=new Map();let locate=locator('win32',[custom,...windowsPaths],env,{},files);
await locate.configureChrome('C:\\Profile\\chrome-path.json');await locate.saveChromePath(custom);assert.equal(await locate(),custom);
locate=locator('win32',[custom,...windowsPaths],env,{},files);await locate.configureChrome('C:\\Profile\\chrome-path.json');assert.equal(await locate(),custom);
await assert.rejects(()=>locate.saveChromePath('C:\\malicious.cmd'),/chrome.exe/);
const missing=locator('win32',windowsPaths,env,{},files);await missing.configureChrome('C:\\Profile\\chrome-path.json');await assert.rejects(()=>missing(),/路径已失效/);
await missing.saveChromePath('');assert.equal(await missing(),windowsPaths[0]);
console.log('PASS custom registry path, case-insensitive environment, manual path persistence, invalid selections and auto recovery.');
