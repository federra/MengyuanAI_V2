import { DatabaseSync, backup } from 'node:sqlite';
import { closeSync, openSync, chmodSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function backupStore(source: string, destination: string) {
  // Exclusive reservation prevents accidental replacement of an older backup.
  closeSync(openSync(destination, 'wx', 0o600));
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(source, { readOnly: true });
    await backup(db, destination);
    const check = new DatabaseSync(destination);
    try {
      // The snapshot should be one portable file, with no WAL sidecars to copy.
      check.exec('PRAGMA journal_mode=DELETE');
      if (
        check.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok'
      )
        throw new Error('Backup integrity check failed');
    } finally {
      check.close();
    }
    chmodSync(destination, 0o600);
  } catch (error) {
    unlinkSync(destination);
    throw error;
  } finally {
    db?.close();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv.length !== 3)
    throw new Error(
      'Usage: npm run backup -- /absolute/path/new-backup.sqlite',
    );
  await backupStore(
    resolve(process.env.ACCESS_DB ?? 'data/access.sqlite'),
    resolve(process.argv[2]),
  );
  console.log('Backup complete; integrity check passed.');
}
