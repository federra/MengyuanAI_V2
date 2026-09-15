import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/store.ts';
import { AccessService } from '../src/service.ts';
import { createHandler } from '../src/http.ts';

test('usage ingestion authenticates, deduplicates atomically, audits admin and excludes abnormal clocks', async () => {
  const db = openStore(':memory:');
  let now = Date.parse('2026-09-14T23:59:00+08:00');
  const service = new AccessService(db, () => now);
  const handler = createHandler(service);
  try {
    await service.bootstrap('admin', 'Admin-test-key-2026');
    const admin = (await service.login('admin', 'Admin-test-key-2026', 'desktop')).token;
    const member = await service.createMember(admin, {account:'member',key:'Member-test-key-2026',expires_at:now+86400000,reason:'test'});
    const memberToken = (await service.login('member','Member-test-key-2026','desktop')).token;
    const call = async (body: unknown, token = memberToken, path = '/usage/events') => handler(new Request('http://localhost'+path, {method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)}),'127.0.0.1');
    const query = async (path: string) => (await handler(new Request('http://localhost'+path,{headers:{authorization:`Bearer ${admin}`}}),'127.0.0.1')).json() as Promise<any>;
    const event = {event_id:'e1',operation_id:'op1',output_id:'out1',metric:'story',video_kind:'',quantity:2,occurred_at:now,source:'ai'};
    now += 120000;
    assert.equal((await call({events:[event]})).status,200);
    assert.deepEqual((await (await call({events:[event]})).json() as any).acknowledged,['e1']);
    assert.equal((await call({events:[{...event,event_id:'alias'}]})).status,200);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM usage_events').get()!.n,1);
    assert.equal((await call({events:[{...event,quantity:3}]})).status,409);
    assert.equal((await call({events:[{...event,event_id:'e2',output_id:'out2'},{...event,quantity:3}]})).status,409);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM usage_events').get()!.n,1);
    assert.equal((await call({events:[{...event,event_id:'e3',output_id:'out3',quantity:0}]})).status,400);
    assert.equal((await call({events:[{...event,user_id:member.id}]})).status,400);
    assert.equal((await call({events:[event],role_at_event:'member'})).status,400);
    for (const patch of [{role_at_event:'super_admin'},{source:'test'},{metric:'other'},{event_id:'bad/id'},{quantity:101},{occurred_at:1.5},{video_kind:'shot'}]) assert.equal((await call({events:[{...event,...patch}]})).status,400);
    assert.equal((await call({events:Array(11).fill(event)})).status,400);
    assert.equal((await call({events:[event]},admin)).status,409);
    assert.equal(db.prepare('SELECT user_id FROM usage_events WHERE event_id=?').get('e1')!.user_id,member.id);
    const adminEvent = {...event,event_id:'admin1',operation_id:'adminop'};
    assert.equal((await call({events:[adminEvent]},admin)).status,200);
    assert.equal((await call({events:[adminEvent]},admin)).status,200);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit_logs WHERE action='business.story.completed'").get()!.n,1);
    assert.equal((await call({events:[{...adminEvent,event_id:'admin2',output_id:'admin2'},{...adminEvent,quantity:3}]},admin)).status,409);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM admin_audit_logs WHERE action='business.story.completed'").get()!.n,1);
    for (const [id,time] of [['early',member.created_at-1],['future',now+300001]] as const) assert.equal((await call({events:[{...event,event_id:id,output_id:id,occurred_at:time}]})).status,200);
    assert.equal((await call({events:[
      ...['idea','script','asset','draft_export','kit_export'].map(metric => ({...event,event_id:metric,output_id:metric,metric,quantity:1,occurred_at:now})),
      {...event,event_id:'shot',output_id:'shot',metric:'video_export',video_kind:'shot',quantity:1,occurred_at:now,source:'video_export'},
    ]})).status,200);
    const overview = await query('/admin/overview');
    assert.equal(overview.telemetry_connected,true);
    assert.equal(overview.final_export_connected,false);
    assert.equal(overview.today.story,0);
    assert.deepEqual(overview.today,{idea:1,story:0,script:1,asset:1,video_export:1,shot:1,final:0});
    assert.equal(overview.activeToday,1);
    assert.equal(overview.lifetime.story,2);
    assert.equal(overview.last_received_at,now);
    assert.equal(overview.anomalous_event_count,2);
    const detail = await query(`/admin/users/${member.id}/usage?from=2026-09-14&to=2026-09-14`);
    assert.equal(detail.totals.story,2);
    assert.equal(detail.last_activity_at,now);
    assert.equal(detail.anomalous_event_count,2);
    assert.equal(detail.last_received_at,now);
    const users = await query('/admin/users');
    assert.equal(users.items[0].last_activity_at,now);
    assert.ok(detail.items.every((item:any)=>['normal','anomalous'].includes(item.clock_status)));
    now += 1000;
    await call({events:[{...adminEvent,event_id:'admin3',output_id:'admin3',occurred_at:now}]},admin);
    assert.equal((await query('/admin/overview')).last_received_at,now-1000);
    db.prepare('UPDATE users SET expires_at=? WHERE id=?').run(now,member.id);
    assert.equal((await call({events:[event]})).status,403);
    db.prepare('UPDATE users SET expires_at=?,banned_at=? WHERE id=?').run(now+10000,now,member.id);
    assert.equal((await call({events:[event]})).status,403);
    assert.equal((await call({events:[event]},'')).status,401);
  } finally { db.close(); }
});

test('v1 migration preserves four tables and events while marking historical clock anomalies', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(),'access-migration-'));
  const path = join(dir,'access.sqlite');
  try {
    const old = openStore(path);
    // Restore the exact v1 table shape to exercise an upgrade of existing data.
    old.exec("ALTER TABLE usage_events DROP COLUMN clock_status; PRAGMA user_version=1;");
    old.prepare("INSERT INTO users(id,account,role,key_hash,expires_at,created_at,updated_at) VALUES ('member','member','member','unused',999999,1000,1000)").run();
    const insert = old.prepare('INSERT INTO usage_events VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    insert.run('old-normal','member','member','op','normal','idea','',1,1000,2000,'project');
    insert.run('old-early','member','member','op','early','idea','',1,999,2000,'project');
    old.close();
    const upgraded = openStore(path);
    assert.equal(upgraded.prepare('PRAGMA user_version').get()!.user_version,2);
    assert.deepEqual(upgraded.prepare('SELECT event_id,clock_status FROM usage_events ORDER BY event_id').all().map(row=>({...row})),[{event_id:'old-early',clock_status:'anomalous'},{event_id:'old-normal',clock_status:'normal'}]);
    assert.equal(upgraded.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get()!.n,4);
    upgraded.close();
    openStore(path).close();
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
