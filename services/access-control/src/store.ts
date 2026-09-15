import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

export function openStore(path: string): DatabaseSync {
  if (path !== ':memory:')
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(
    'PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;',
  );
  const version = db.prepare('PRAGMA user_version').get()?.user_version;
  if (version !== 0 && version !== 1 && version !== 2) {
    db.close();
    throw new Error('Unsupported database version');
  }
  if (version === 0)
    db.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE users (
      id TEXT PRIMARY KEY, account TEXT NOT NULL UNIQUE, note TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK(role IN ('member','super_admin')), key_hash TEXT NOT NULL,
      expires_at INTEGER, banned_at INTEGER, ban_reason TEXT NOT NULL DEFAULT '',
      revision INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      CHECK(role='super_admin' OR expires_at IS NOT NULL)
    ) STRICT;
    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER,
      client_type TEXT NOT NULL CHECK(client_type IN ('desktop','web'))
    ) STRICT;
    CREATE INDEX sessions_user ON sessions(user_id);
    CREATE INDEX sessions_expiry ON sessions(expires_at);
    CREATE TABLE usage_events (
      event_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      role_at_event TEXT NOT NULL CHECK(role_at_event IN ('member','super_admin')),
      operation_id TEXT NOT NULL, output_id TEXT NOT NULL,
      metric TEXT NOT NULL CHECK(metric IN ('idea','story','script','asset','video_export','draft_export','kit_export')),
      video_kind TEXT NOT NULL DEFAULT '' CHECK(video_kind IN ('','shot','final')),
      quantity INTEGER NOT NULL CHECK(quantity>0), occurred_at INTEGER NOT NULL,
      received_at INTEGER NOT NULL, source TEXT NOT NULL,
      CHECK((metric='video_export' AND video_kind IN ('shot','final')) OR (metric!='video_export' AND video_kind='')),
      UNIQUE(user_id,operation_id,output_id,metric,video_kind)
    ) STRICT;
    CREATE INDEX usage_user_time ON usage_events(user_id,occurred_at);
    CREATE INDEX usage_role_time ON usage_events(role_at_event,occurred_at);
    CREATE TABLE admin_audit_logs (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL, actor_id TEXT REFERENCES users(id),
      actor_account TEXT NOT NULL, target_id TEXT REFERENCES users(id), target_account TEXT NOT NULL,
      action TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
      reason TEXT NOT NULL, result TEXT NOT NULL CHECK(result IN ('success','failure')),
      created_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX audit_time ON admin_audit_logs(created_at);
    CREATE INDEX audit_target_time ON admin_audit_logs(target_id,created_at);
    CREATE TRIGGER users_no_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT,'User deletion forbidden'); END;
    CREATE TRIGGER audit_no_update BEFORE UPDATE ON admin_audit_logs BEGIN SELECT RAISE(ABORT,'Audit is append only'); END;
    CREATE TRIGGER audit_no_delete BEFORE DELETE ON admin_audit_logs BEGIN SELECT RAISE(ABORT,'Audit is append only'); END;
    PRAGMA user_version=1;
    COMMIT;
  `);
  if (version === 0 || version === 1) db.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE usage_events ADD COLUMN clock_status TEXT NOT NULL DEFAULT 'normal' CHECK(clock_status IN ('normal','anomalous'));
    UPDATE usage_events SET clock_status='anomalous' WHERE occurred_at < (SELECT created_at FROM users WHERE users.id=usage_events.user_id) OR occurred_at > received_at+300000;
    PRAGMA user_version=2;
    COMMIT;
  `);
  return db;
}

export function transaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = action();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
