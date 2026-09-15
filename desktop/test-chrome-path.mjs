import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const source = await fs.readFile(new URL('./doubao-chrome.cjs', import.meta.url), 'utf8');

// Exercise the actual locator with simulated OS/filesystem boundaries so both
// platforms can be checked without installing browsers or changing this machine.
function locator(platform, installed, env = {}) {
  const module = {exports: {}};
  vm.runInNewContext(source, {
    module,
    process: {platform, env},
    require(name) {
      if (name === 'node:os') return {homedir: () => '/Users/Test User'};
      if (name === 'node:path') return platform === 'win32' ? require(name).win32 : require(name).posix;
      if (name === 'node:fs/promises') return {async access(file) {
        if (!installed.includes(file)) throw Object.assign(Error('Not found'), {code: 'ENOENT'});
      }};
      return require(name);
    },
  });
  return module.exports.findChrome;
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
