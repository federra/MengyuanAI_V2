import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
const { UsageOutbox } = createRequire(import.meta.url)('./usage-outbox.cjs');
function adapter(db) {
  return {
    prepare(sql) {
      const st = db.prepare(sql);
      return {
        bind(...args) {
          return {
            run: async () => ({
              meta: { changes: Number(st.run(...args).changes) },
            }),
            all: async () => ({ results: st.all(...args) }),
            first: async () => st.get(...args),
          };
        },
        run: async () => st.run(),
        all: async () => ({ results: st.all() }),
      };
    },
  };
}
test('outbox persists pending, confirms only acknowledged IDs and binds owner', async () => {
  const db = new DatabaseSync(':memory:');
  const store = new UsageOutbox(adapter(db), { id: 'owner-a', role: 'member' });
  await store.init();
  const event = {
    event_id: 'event-1',
    operation_id: 'op-1',
    output_id: 'out-1',
    metric: 'story',
    video_kind: '',
    quantity: 1,
    occurred_at: Date.now(),
    source: 'ai',
  };
  await store.record(event);
  await store.record(event);
  let calls = 0;
  await store.flush(async () => {
    calls++;
    throw Error('offline');
  });
  assert.equal(calls, 1);
  await store.flush(async (events) => {
    assert.equal(events.length, 1);
    assert.equal(events[0].user_id, undefined);
    return { acknowledged: [] };
  });
  const reopened = new UsageOutbox(adapter(db), {
    id: 'owner-a',
    role: 'member',
  });
  await reopened.flush(async (events) => ({
    acknowledged: events.map((e) => e.event_id),
  }));
  await reopened.flush(async () => {
    assert.fail('acknowledged row must not resend');
  });
  await store.record({ ...event, event_id: 'event-2', output_id: 'out-2' });
  const other = new UsageOutbox(adapter(db), { id: 'owner-b', role: 'member' });
  await other.flush(async () => {
    assert.fail('another owner must not receive pending events');
  });
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) n FROM desktop_usage_events WHERE state='pending'",
      )
      .get().n,
    1,
  );
  db.close();
});

test('video file crash recovery proves publication ownership and preserves original day', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const { exportVideo } = createRequire(import.meta.url)('./video-files.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-usage-file-'));
  const db = new DatabaseSync(':memory:');
  const store = new UsageOutbox(adapter(db), { id: 'owner-a', role: 'member' });
  await store.init();
  const input = {
    projectId: 'project',
    mediaId: '11111111-1111-4111-8111-111111111111',
    name: 'shot',
  };
  let completions = 0;
  const config = {
    videosDir: root,
    origin: 'http://127.0.0.1',
    token: 'test',
    fetchVideo: async () =>
      new Response('complete-video', {
        headers: { 'content-type': 'video/mp4' },
      }),
    journal: {
      begin: (e, d) => store.record(e, 'file_pending', d),
      complete: async () => {
        completions++;
        throw Error('simulated exit before event completion');
      },
    },
  };
  await assert.rejects(exportVideo(input, config), /simulated exit/);
  assert.equal(completions, 1);
  const before = db.prepare('SELECT * FROM desktop_usage_events').get();
  await store.recoverFiles();
  const after = db.prepare('SELECT * FROM desktop_usage_events').get();
  assert.equal(after.state, 'pending');
  assert.equal(after.occurred_at, before.occurred_at);
  const replay = await exportVideo(input, { ...config, journal: undefined });
  assert.equal(replay.created, false);
  const old = JSON.parse(before.details);
  await store.record(
    {
      event_id: 'race',
      operation_id: 'race',
      output_id: 'x',
      metric: 'video_export',
      video_kind: 'shot',
      quantity: 1,
      occurred_at: Date.now(),
      source: 'video_export',
    },
    'file_pending',
    { filename: old.filename, temporary: old.temporary, size: 14 },
  );
  await store.recoverFiles();
  assert.equal(
    db
      .prepare("SELECT state FROM desktop_usage_events WHERE event_id='race'")
      .get().state,
    'ignored',
  );
  db.close();
});
