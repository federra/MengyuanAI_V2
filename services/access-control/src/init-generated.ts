import { randomBytes } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { openStore } from './store.ts';
import { AccessService, AccessError } from './service.ts';

if (process.argv.length !== 3)
  throw new Error(
    'Usage: node src/init-generated.ts /private/path/new-admin-key',
  );
process.umask(0o077);
const db = openStore(resolve(process.env.ACCESS_DB ?? 'data/access.sqlite'));
let created = false;
const path = resolve(process.argv[2]);
try {
  if (db.prepare("SELECT id FROM users WHERE role='super_admin'").get())
    throw new AccessError('ALREADY_INITIALIZED', 409);
  const key = randomBytes(32).toString('base64url');
  writeFileSync(path, key + '\n', { flag: 'wx', mode: 0o600 });
  created = true;
  await new AccessService(db).bootstrap('admin', key);
  console.log('Administrator admin initialized; key saved privately.');
} catch (error) {
  if (created) unlinkSync(path);
  console.error(
    error instanceof AccessError ? error.code : 'Initialization failed',
  );
  process.exitCode = 1;
} finally {
  db.close();
}
