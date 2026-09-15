import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AccountWorkspace } from './account-workspace.cjs';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-owners-'));
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222';
try {
  await fs.mkdir(path.join(root, 'workspace'));
  await fs.writeFile(path.join(root, 'workspace', 'legacy'), 'old-data');
  const owners = new AccountWorkspace(root);
  assert.equal(await owners.hasLegacy(), true);
  const first = await owners.prepare(a, true);
  assert.equal(
    await fs.readFile(path.join(first, 'workspace', 'legacy'), 'utf8'),
    'old-data',
  );
  assert.equal(
    await fs.readFile(path.join(root, 'workspace', 'legacy'), 'utf8'),
    'old-data',
  );
  await assert.rejects(owners.prepare(b, true), /LEGACY_CLAIMED/);
  const second = await owners.prepare(b, false);
  await assert.rejects(fs.access(path.join(second, 'workspace', 'legacy')));
  assert.equal(await owners.prepare(a, false), first);
  await assert.rejects(owners.prepare('../../other', true));
  console.log(
    'PASS workspace: explicit claim, originals retained, account isolation, traversal refused',
  );
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
