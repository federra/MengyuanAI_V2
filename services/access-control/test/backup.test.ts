import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.ts';
import { AccessService } from '../src/service.ts';
import { backupStore } from '../src/backup.ts';

await test('online backup restores accounts and audit without overwriting an existing backup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'access-backup-'));
  const source = join(dir, 'source.sqlite'),
    dest = join(dir, 'backup.sqlite');
  const db = openStore(source);
  try {
    await new AccessService(db).bootstrap('admin', 'Test-backup-key-2026');
    await backupStore(source, dest);
    assert.equal(existsSync(dest + '-wal'), false);
    assert.equal(existsSync(dest + '-shm'), false);
    await assert.rejects(backupStore(source, dest));
    const restored = openStore(dest);
    try {
      assert.equal(
        (
          await new AccessService(restored).login(
            'admin',
            'Test-backup-key-2026',
            'desktop',
          )
        ).user.role,
        'super_admin',
      );
      assert.equal(
        restored
          .prepare(
            "SELECT count(*) n FROM admin_audit_logs WHERE action='admin.bootstrap'",
          )
          .get()?.n,
        1,
      );
    } finally {
      restored.close();
    }
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
