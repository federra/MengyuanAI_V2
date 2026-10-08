// Real Electron/electron-updater networking; no user data or real installer.
import { app, session } from 'electron';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { NsisUpdater } = require('electron-updater');
const { CancellationToken } = require('builder-util-runtime');
const { SoftwareUpdate } = require(process.env.DIRECTOR_UPDATE_MODULE || './software-update.cjs');
const root = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'director-update-proxy-'));
app.setPath('userData', root);
setTimeout(() => { console.error('Proxy network test timed out'); app.exit(1); }, 40000).unref();
void app.whenReady().then(async () => {
const payload = Buffer.from('Isolated update test payload; never executed.');
const sha512 = createHash('sha512').update(payload).digest('base64');
const release = { version: '0.1.112', platform: 'win32', releaseNotes: '本地网络测试' };
const server = http.createServer((req, res) => {
  if (req.url === '/release.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(release)); }
  else if (req.url === '/payload') res.end(payload);
  else { res.statusCode = 404; res.end(); }
});
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
await listen(server);
const unavailableProxy = http.createServer(); await listen(unavailableProxy);
const proxyPort = unavailableProxy.address().port; await new Promise(resolve => unavailableProxy.close(resolve));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;
const updater = new NsisUpdater({ provider: 'generic', url: origin });
updater.logger = null;
const badProxy = { mode: 'fixed_servers', proxyRules: `127.0.0.1:${proxyPort}`, proxyBypassRules: '<-loopback>' };
const request = () => updater.httpExecutor.request({ protocol: 'http:', hostname: '127.0.0.1', port, path: '/release.json', method: 'GET', timeout: 5000 });
try {
  await session.defaultSession.setProxy(badProxy);
  await updater.netSession.setProxy(badProxy);
  const defaultProxy = await session.defaultSession.resolveProxy(origin);
  assert.match(defaultProxy, /PROXY/);
  assert.notEqual(updater.netSession, session.defaultSession);
  assert.equal((await fetch(origin + '/release.json')).status, 200, 'Node manifest checking works despite the broken Chromium proxy');
  await assert.rejects(request, /ERR_PROXY_CONNECTION_FAILED/, 'installed updater network reproduces the reported error');
  let installerRequests = 0;
  updater.checkForUpdates = async () => ({ updateInfo: { version: JSON.parse(await request()).version } });
  updater.downloadUpdate = async () => {
    const destination = path.join(root, 'test-payload');
    await updater.httpExecutor.download(new URL(origin + '/payload'), destination, { cancellationToken: new CancellationToken(), sha512 });
    return [destination];
  };
  const update = new SoftwareUpdate({ version: '0.1.103', canInstall: true, updater,
    fetch: (_, options) => fetch(origin + '/release.json', options), requestInstall: () => { installerRequests++; } });
  await update.check(); assert.equal(update.snapshot().status, 'available');
  await update.downloadAndInstall();
  assert.equal(update.snapshot().downloaded, true, update.snapshot().message);
  assert.equal(installerRequests, 1);
  assert.deepEqual(await fs.readFile(path.join(root, 'test-payload')), payload);
  assert.equal(await updater.netSession.resolveProxy(origin), 'DIRECT');
  assert.equal(await session.defaultSession.resolveProxy(origin), defaultProxy, 'other application networking keeps its proxy');
  console.log(JSON.stringify({ passed: true, checks: ['Node manifest succeeds with broken system proxy', 'real updater reproduces ERR_PROXY_CONNECTION_FAILED', 'updater session alone switches to direct', 'actual payload download and SHA-512', 'default session proxy preserved'], dataDirectory: root }));
  await new Promise(resolve => server.close(resolve)); app.exit(0);
} catch (error) { console.error(error); server.close(); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
