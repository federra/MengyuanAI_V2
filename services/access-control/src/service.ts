import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './store.ts';

export class AccessError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
type User = {
  id: string;
  account: string;
  note: string;
  role: 'member' | 'super_admin';
  key_hash: string;
  expires_at: number | null;
  banned_at: number | null;
  ban_reason: string;
  revision: number;
  created_at: number;
  updated_at: number;
};
export type PublicUser = Omit<User, 'key_hash'>;
const publicUser = ({ key_hash: _secret, ...user }: User): PublicUser => user;
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const SESSION_MS = 12 * 60 * 60 * 1000;
function accountName(input: unknown): string {
  if (typeof input !== 'string') throw new AccessError('INVALID_INPUT');
  const name = input.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,64}$/.test(name)) throw new AccessError('INVALID_INPUT');
  return name;
}
function validKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || key.length < 12 || key.length > 128)
    throw new AccessError('INVALID_INPUT');
}
function validReason(reason: unknown): asserts reason is string {
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 500)
    throw new AccessError('INVALID_INPUT');
}
function validExpiry(value: unknown): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    Number(value) > 8.64e15
  )
    throw new AccessError('INVALID_INPUT');
}
// Bound expensive work, including calls from maintenance tools. No unbounded wait queue.
let hashesInFlight = 0;
async function derive(key: string, salt: string): Promise<Buffer> {
  if (hashesInFlight >= 2) throw new AccessError('BUSY', 429);
  hashesInFlight++;
  try {
    return await new Promise((resolve, reject) =>
      scrypt(
        key,
        salt,
        64,
        { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 },
        (error, result) => (error ? reject(error) : resolve(result)),
      ),
    );
  } finally {
    hashesInFlight--;
  }
}
async function hashKey(key: string) {
  validKey(key);
  const salt = randomBytes(16).toString('hex');
  return `scrypt-131072-8-1$${salt}$${(await derive(key, salt)).toString('hex')}`;
}
async function verifyKey(key: string, stored: string | undefined) {
  const [scheme, salt, expected] = stored?.split('$') ?? [
    '',
    '00000000000000000000000000000000',
    '00'.repeat(64),
  ];
  const actual = await derive(key, salt);
  return (
    timingSafeEqual(actual, Buffer.from(expected, 'hex')) &&
    scheme === 'scrypt-131072-8-1'
  );
}

export class AccessService {
  db: DatabaseSync;
  now: () => number;
  constructor(db: DatabaseSync, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }
  private user(id: string): User {
    const user = this.db.prepare('SELECT * FROM users WHERE id=?').get(id) as
      | User
      | undefined;
    if (!user) throw new AccessError('NOT_FOUND', 404);
    return user;
  }
  private check(user: User) {
    if (user.banned_at !== null) throw new AccessError('BANNED', 403);
    if (user.role === 'member' && this.now() >= user.expires_at!)
      throw new AccessError('EXPIRED', 403);
  }
  private audit(
    actor: User | null,
    target: User | null,
    action: string,
    before: unknown,
    after: unknown,
    reason: string,
    result: 'success' | 'failure' = 'success',
    requestId: string = randomUUID(),
  ) {
    this.db
      .prepare('INSERT INTO admin_audit_logs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        randomUUID(),
        requestId,
        actor?.id ?? null,
        actor?.account ?? '',
        target?.id ?? null,
        target?.account ?? '',
        action,
        JSON.stringify(before),
        JSON.stringify(after),
        reason,
        result,
        this.now(),
      );
  }
  async bootstrap(account: unknown, key: unknown): Promise<PublicUser> {
    const name = accountName(account);
    validKey(key);
    if (this.db.prepare("SELECT id FROM users WHERE role='super_admin'").get())
      throw new AccessError('ALREADY_INITIALIZED', 409);
    const hash = await hashKey(key);
    return transaction(this.db, () => {
      if (
        this.db.prepare("SELECT id FROM users WHERE role='super_admin'").get()
      )
        throw new AccessError('ALREADY_INITIALIZED', 409);
      const id = randomUUID(),
        now = this.now();
      this.db
        .prepare(
          'INSERT INTO users(id,account,role,key_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)',
        )
        .run(id, name, 'super_admin', hash, now, now);
      const user = this.user(id);
      this.audit(
        user,
        user,
        'admin.bootstrap',
        null,
        publicUser(user),
        'Local secure initialization',
      );
      return publicUser(user);
    });
  }
  async login(
    account: unknown,
    key: unknown,
    client: unknown,
    requestId: string = randomUUID(),
  ) {
    const name = accountName(account);
    validKey(key);
    if (client !== 'desktop' && client !== 'web')
      throw new AccessError('INVALID_INPUT');
    const candidate = this.db
      .prepare('SELECT * FROM users WHERE account=?')
      .get(name) as User | undefined;
    if (!(await verifyKey(key, candidate?.key_hash))) {
      if (candidate?.role === 'super_admin')
        this.audit(
          candidate,
          candidate,
          'auth.login',
          null,
          null,
          'INVALID_CREDENTIALS',
          'failure',
          requestId,
        );
      throw new AccessError('INVALID_CREDENTIALS', 401);
    }
    return transaction(this.db, () => {
      const user = this.user(candidate!.id);
      this.check(user);
      const token = randomBytes(32).toString('base64url');
      const expires_at = this.now() + SESSION_MS;
      this.db
        .prepare('INSERT INTO sessions VALUES (?,?,?,?,NULL,?)')
        .run(digest(token), user.id, this.now(), expires_at, client);
      if (user.role === 'super_admin')
        this.audit(
          user,
          user,
          'auth.login',
          null,
          null,
          '',
          'success',
          requestId,
        );
      return {
        token,
        user: publicUser(user),
        session_expires_at: expires_at,
        server_time: this.now(),
      };
    });
  }
  me(token: string) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new AccessError('UNAUTHENTICATED', 401);
    const session = this.db
      .prepare(
        'SELECT * FROM sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?',
      )
      .get(digest(token), this.now());
    if (!session) throw new AccessError('UNAUTHENTICATED', 401);
    const user = this.user(String(session.user_id));
    this.check(user);
    return {
      user: publicUser(user),
      session_expires_at: session.expires_at as number,
      server_time: this.now(),
    };
  }
  requireAdmin(token: string): PublicUser {
    const { user } = this.me(token);
    if (user.role !== 'super_admin') throw new AccessError('FORBIDDEN', 403);
    return user;
  }
  logout(token: string, requestId: string = randomUUID()) {
    // Logout also revokes expired/banned sessions; it never grants business access.
    transaction(this.db, () => {
      const session = this.db
        .prepare(
          'SELECT user_id FROM sessions WHERE token_hash=? AND revoked_at IS NULL',
        )
        .get(digest(token));
      if (!session) return;
      const user = this.user(String(session.user_id));
      this.db
        .prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=?')
        .run(this.now(), digest(token));
      if (user.role === 'super_admin')
        this.audit(
          user,
          user,
          'auth.logout',
          null,
          null,
          '',
          'success',
          requestId,
        );
    });
  }
  recordRejectedAdminRequest(token: string, requestId: string, code: string) {
    const actor = this.user(this.requireAdmin(token).id);
    this.audit(
      actor,
      null,
      'admin.request.rejected',
      null,
      null,
      code,
      'failure',
      requestId,
    );
  }
  async createMember(
    token: string,
    input: {
      account: unknown;
      key: unknown;
      expires_at: unknown;
      reason: unknown;
      note?: unknown;
    },
    requestId: string = randomUUID(),
  ) {
    const actor = this.user(this.requireAdmin(token).id);
    try {
      const account = accountName(input.account);
      validKey(input.key);
      validExpiry(input.expires_at);
      validReason(input.reason);
      if (
        input.note !== undefined &&
        (typeof input.note !== 'string' || input.note.length > 200)
      )
        throw new AccessError('INVALID_INPUT');
      const hash = await hashKey(input.key);
      return transaction(this.db, () => {
        this.requireAdmin(token);
        if (
          this.db.prepare('SELECT id FROM users WHERE account=?').get(account)
        )
          throw new AccessError('ACCOUNT_EXISTS', 409);
        const id = randomUUID(),
          now = this.now();
        this.db
          .prepare(
            'INSERT INTO users(id,account,note,role,key_hash,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
          )
          .run(
            id,
            account,
            (input.note ?? '') as string,
            'member',
            hash,
            input.expires_at as number,
            now,
            now,
          );
        const user = this.user(id);
        this.audit(
          actor,
          user,
          'user.create',
          null,
          publicUser(user),
          input.reason as string,
          'success',
          requestId,
        );
        return publicUser(user);
      });
    } catch (error) {
      this.audit(
        actor,
        null,
        'user.create',
        null,
        null,
        error instanceof AccessError ? error.code : 'INTERNAL_ERROR',
        'failure',
        requestId,
      );
      throw error;
    }
  }
  changeAuthorization(
    token: string,
    id: string,
    input: {
      action: 'ban' | 'restore' | 'expiry';
      revision: number;
      reason: string;
      expires_at?: number;
    },
    requestId: string = randomUUID(),
  ) {
    const actor = this.user(this.requireAdmin(token).id);
    let target: User | null = null;
    try {
      return transaction(this.db, () => {
        validReason(input.reason);
        target = this.user(id);
        if (target.role !== 'member') throw new AccessError('FORBIDDEN', 403);
        if (
          !Number.isInteger(input.revision) ||
          target.revision !== input.revision
        )
          throw new AccessError('CONFLICT', 409);
        const before = publicUser(target),
          now = this.now();
        switch (input.action) {
          case 'ban':
            this.db
              .prepare('UPDATE users SET banned_at=?,ban_reason=? WHERE id=?')
              .run(now, input.reason, id);
            this.db
              .prepare(
                'UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL',
              )
              .run(now, id);
            break;
          case 'restore':
            this.db
              .prepare(
                "UPDATE users SET banned_at=NULL,ban_reason='' WHERE id=?",
              )
              .run(id);
            break;
          case 'expiry':
            validExpiry(input.expires_at);
            this.db
              .prepare('UPDATE users SET expires_at=? WHERE id=?')
              .run(input.expires_at, id);
            break;
          default:
            throw new AccessError('INVALID_INPUT');
        }
        this.db
          .prepare(
            'UPDATE users SET revision=revision+1,updated_at=? WHERE id=?',
          )
          .run(now, id);
        const after = publicUser(this.user(id));
        this.audit(
          actor,
          target,
          `user.${input.action}`,
          before,
          after,
          input.reason,
          'success',
          requestId,
        );
        return after;
      });
    } catch (error) {
      this.audit(
        actor,
        target,
        'user.authorization',
        null,
        null,
        error instanceof AccessError ? error.code : 'INTERNAL_ERROR',
        'failure',
        requestId,
      );
      throw error;
    }
  }
}
