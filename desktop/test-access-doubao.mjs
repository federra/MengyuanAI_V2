import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DoubaoManager } from './doubao-manager.cjs';
const root = await fs.mkdtemp(
  path.join(os.tmpdir(), 'director-doubao-access-'),
);
try {
  const manager = new DoubaoManager({
    root,
    backend: () => ({}),
    authorize: async () => {
      throw Error('EXPIRED');
    },
  });
  const account = { id: 'a', enabled: true, serial: 1 };
  manager.state.accounts = [account];
  manager.state.participatingAccountIds = ['a'];
  const job = {
    id: 'j',
    status: 'prepared',
    accountId: 'a',
    accountIds: ['a'],
    task: {},
    history: [],
  };
  manager.state.jobs = [job];
  assert.equal((await manager.claim(account)).job, null);
  assert.equal((await manager.claim(account)).paused, true);
  await assert.rejects(manager.command('enqueue', {}), /EXPIRED/);
  await assert.rejects(
    manager.event(account, { type: 'submissionIntent', jobId: 'j' }),
    /EXPIRED/,
  );
  assert.equal(job.submissionAttemptedAt, undefined);
  console.log(
    'PASS expired Doubao: no prepared job delivery, enqueue or submission intent',
  );
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
