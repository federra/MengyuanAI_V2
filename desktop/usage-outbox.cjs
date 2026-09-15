// oxlint-disable typescript/no-require-imports
const fs = require('node:fs/promises');
const fields =
  'event_id,operation_id,output_id,metric,video_kind,quantity,occurred_at,source';
class UsageOutbox {
  constructor(db, owner) {
    this.db = db;
    this.owner = owner;
    this.flushing = false;
  }
  async init() {
    await this.db
      .prepare(`CREATE TABLE IF NOT EXISTS desktop_usage_events (
      event_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, role_at_event TEXT NOT NULL,
      operation_id TEXT NOT NULL, output_id TEXT NOT NULL, metric TEXT NOT NULL,
      video_kind TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL, occurred_at INTEGER NOT NULL,
      source TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', details TEXT NOT NULL DEFAULT '{}'
    )`)
      .run();
    await this.db
      .prepare(
        'CREATE INDEX IF NOT EXISTS desktop_usage_pending ON desktop_usage_events(user_id,state,occurred_at)',
      )
      .run();
    // All pre-existing projects get a permanent ignored marker; never invent history.
    if (
      await this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'",
        )
        .bind()
        .first()
    )
      await this.db
        .prepare(`INSERT OR IGNORE INTO desktop_usage_events(event_id,user_id,role_at_event,operation_id,output_id,metric,quantity,occurred_at,source,state)
        SELECT 'idea:'||id,?,?,'project:'||id,id,'idea',0,0,'project','ignored' FROM projects`)
        .bind(this.owner.id, this.owner.role)
        .run();
  }
  async record(event, state = 'pending', details = {}) {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO desktop_usage_events(${fields},user_id,role_at_event,state,details) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        ...fields.split(',').map((k) => event[k]),
        this.owner.id,
        this.owner.role,
        state,
        JSON.stringify(details),
      )
      .run();
  }
  async complete(id, created = true, occurredAt = Date.now()) {
    await this.db
      .prepare(
        "UPDATE desktop_usage_events SET state=?,occurred_at=? WHERE event_id=? AND user_id=? AND state='file_pending'",
      )
      .bind(created ? 'pending' : 'ignored', occurredAt, id, this.owner.id)
      .run();
  }
  async recoverFiles() {
    const rows = await this.db
      .prepare(
        "SELECT event_id,details,occurred_at FROM desktop_usage_events WHERE user_id=? AND state='file_pending'",
      )
      .bind(this.owner.id)
      .all();
    for (const row of rows.results) {
      const { filename, temporary, size } = JSON.parse(row.details);
      try {
        // Atomic hard-link publication leaves the temporary inode until event completion.
        const [target, source] = await Promise.all([
          fs.lstat(filename),
          fs.lstat(temporary),
        ]);
        const own =
          target.isFile() &&
          source.isFile() &&
          target.dev === source.dev &&
          target.ino === source.ino &&
          target.size === size;
        await this.complete(row.event_id, own, row.occurred_at);
      } catch (error) {
        if (error.code !== 'ENOENT') continue;
        await this.complete(row.event_id, false);
      }
      await fs.unlink(temporary).catch(() => {});
    }
  }
  async flush(upload) {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const rows = await this.db
        .prepare(
          `SELECT ${fields} FROM desktop_usage_events WHERE user_id=? AND state='pending' ORDER BY occurred_at,event_id LIMIT 10`,
        )
        .bind(this.owner.id)
        .all();
      if (!rows.results.length) return;
      const response = await upload(rows.results);
      const acknowledged = new Set(response?.acknowledged ?? []);
      for (const row of rows.results)
        if (acknowledged.has(row.event_id))
          await this.db
            .prepare(
              "UPDATE desktop_usage_events SET state='sent' WHERE event_id=? AND user_id=? AND state='pending'",
            )
            .bind(row.event_id, this.owner.id)
            .run();
    } catch {
      /* Durable pending rows survive offline, expired sessions and lost replies. */
    } finally {
      this.flushing = false;
    }
  }
}
module.exports = { UsageOutbox };
