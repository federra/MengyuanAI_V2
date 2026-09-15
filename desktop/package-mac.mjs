import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stageRuntime} from './build/stage-runtime.mjs';

// Local Mac delivery retains the existing source-launch model.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const pkg = JSON.parse(await fs.readFile(path.join(here, 'package.json'), 'utf8'));
const stage = path.join(here, 'release', `v${pkg.version}`, 'mac');
await fs.access(path.join(here, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'));
await fs.mkdir(path.dirname(stage), {recursive: true});
await fs.mkdir(stage); // Refuse to overwrite a previous delivery.
await stageRuntime(here, root, stage);
await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
await fs.symlink(path.relative(stage, path.join(here, 'node_modules')), path.join(stage, 'node_modules'));
await fs.copyFile(path.join(here, 'release-notes.md'), path.join(stage, '本次更新.txt'));
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
await fs.writeFile(path.join(stage, '启动桌面版.command'),
  `#!/bin/zsh\ncd -- ${quote(stage)} || exit 1\nexec ${quote(path.join(here, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'))} .\n`, {mode: 0o755});
console.log(JSON.stringify({version: pkg.version, directory: stage, localSourceLaunch: true, published: false}));
