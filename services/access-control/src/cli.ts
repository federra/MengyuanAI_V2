import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { openStore } from './store.ts';
import { AccessService, AccessError } from './service.ts';

// Credentials are entered only in the terminal, never command arguments or logs.
async function secret(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    function onData(data: Buffer) {
      for (const char of data.toString('utf8')) {
        if (char === '\u0003') {
          finish(new Error('Cancelled'));
          return;
        }
        if (char === '\r' || char === '\n') {
          finish();
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ' && value.length < 129) value += char;
      }
    }
    process.stdin.on('data', onData);
  });
}
if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.length !== 2)
  throw new Error(
    'Run init-admin in an interactive terminal without credential arguments.',
  );
process.umask(0o077);
const db = openStore(resolve(process.env.ACCESS_DB ?? 'data/access.sqlite'));
try {
  if (db.prepare("SELECT id FROM users WHERE role='super_admin'").get())
    throw new AccessError('ALREADY_INITIALIZED', 409);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const account = await rl.question('Admin account: ');
  rl.close();
  const key = await secret('Admin key (hidden, 12–128 characters): ');
  const confirmation = await secret('Confirm key (hidden): ');
  if (key !== confirmation) throw new AccessError('KEY_MISMATCH');
  const user = await new AccessService(db).bootstrap(account, key);
  console.log(`Administrator initialized: ${user.account}`);
} catch (error) {
  console.error(
    error instanceof AccessError ? error.code : 'Initialization failed',
  );
  process.exitCode = 1;
} finally {
  db.close();
}
