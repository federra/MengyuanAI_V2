import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { SoftwareUpdate } = require('./software-update.cjs');
const release = { version: '0.1.112', platform: 'win32', releaseNotes: '测试更新' };
function fixture(failureAt, error = 'net::ERR_PROXY_CONNECTION_FAILED', secondError, retryVersion = release.version) {
  const counts = { checks: 0, downloads: 0, proxyChanges: 0, closedConnections: 0, installs: 0 };
  let direct = false;
  const updater = Object.assign(new EventEmitter(), {
    netSession: {
      async setProxy(config) { assert.deepEqual(config, { mode: 'direct' }); counts.proxyChanges++; direct = true; },
      async closeAllConnections() { assert(direct); counts.closedConnections++; },
    },
    async checkForUpdates() {
      counts.checks++;
      if (failureAt === 'check' && !direct) throw Error(error);
      if (direct) { assert.equal(counts.closedConnections, 1); if (secondError) throw Error(secondError); }
      return { updateInfo: { version: direct ? retryVersion : release.version } };
    },
    async downloadUpdate() {
      counts.downloads++;
      if (failureAt === 'download' && !direct) throw Error(error);
      return ['/tmp/simulated-installer.exe'];
    },
    quitAndInstall() { throw Error('Test must never launch a real installer'); },
  });
  const update = new SoftwareUpdate({ version: '0.1.103', canInstall: true, updater,
    fetch: async () => Response.json(release), requestInstall: () => { counts.installs++; } });
  return { update, counts };
}
for (const failureAt of ['check', 'download']) {
  const { update, counts } = fixture(failureAt);
  await update.check();
  await Promise.all([update.downloadAndInstall(), update.downloadAndInstall()]);
  assert.equal(update.snapshot().downloaded, true, `${failureAt}: broken proxy should recover through the updater's own direct session`);
  assert.equal(counts.checks, 2); assert.equal(counts.downloads, failureAt === 'check' ? 1 : 2);
  assert.equal(counts.proxyChanges, 1); assert.equal(counts.closedConnections, 1); assert.equal(counts.installs, 1);
}
const normal = fixture(); await normal.update.check(); await normal.update.downloadAndInstall();
assert.equal(normal.counts.proxyChanges, 0, 'working proxy configuration remains untouched');
for (const error of ['checksum mismatch', 'net::ERR_CERT_AUTHORITY_INVALID', 'net::ERR_CONNECTION_TIMED_OUT', 'HTTP 403']) {
  const { update, counts } = fixture('download', error);
  await update.check(); await update.downloadAndInstall();
  assert.equal(update.snapshot().status, 'error'); assert.equal(update.snapshot().downloaded, false);
  assert.equal(counts.proxyChanges, 0); assert.equal(counts.downloads, 1); assert.equal(counts.installs, 0);
}
const offline = fixture('check', 'net::ERR_PROXY_CONNECTION_FAILED', 'net::ERR_CONNECTION_TIMED_OUT');
await offline.update.check(); await offline.update.downloadAndInstall();
assert.equal(offline.counts.checks, 2, 'retry is bounded'); assert.equal(offline.counts.installs, 0);
assert.equal(offline.update.snapshot().status, 'error'); assert.match(offline.update.snapshot().message, /直连/);
const mismatch = fixture('check', 'net::ERR_PROXY_CONNECTION_FAILED', undefined, '0.1.113');
await mismatch.update.check(); await mismatch.update.downloadAndInstall();
assert.equal(mismatch.counts.downloads, 0); assert.equal(mismatch.counts.installs, 0);
assert.match(mismatch.update.snapshot().message, /发布版本发生变化/);
console.log('PASS: broken updater proxy recovery, single retry, concurrency, valid proxy preservation, TLS/checksum rejection, and version guard');
