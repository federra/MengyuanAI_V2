import { db, json, sameOrigin } from '@/lib/server';
import { usageOwner } from '@/lib/usage-server';
import { validateProject } from '@/lib/studio';
export async function GET() {
  try {
    const rows = await db()
      .prepare('SELECT body FROM projects ORDER BY updated_at DESC')
      .all<{ body: string }>();
    return json(rows.results.map((r) => JSON.parse(r.body)));
  } catch {
    return json({ error: '项目数据暂不可用，请稍后重试。' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const raw = await req.text();
    if (raw.length > 2000000) return json({ error: '项目内容过大' }, 413);
    const p = validateProject(JSON.parse(raw));
    const revision = p.revision + 1;
    const saved = { ...p, revision, updatedAt: new Date().toISOString() };
    const body = JSON.stringify(saved);
    const statement =
      p.revision === 0
        ? db()
            .prepare(
              'INSERT OR IGNORE INTO projects(id,title,body,revision,updated_at) VALUES(?,?,?,?,?)',
            )
            .bind(p.id, p.title, body, revision, saved.updatedAt)
        : db()
            .prepare(
              'UPDATE projects SET title=?,body=?,revision=?,updated_at=? WHERE id=? AND revision=?',
            )
            .bind(p.title, body, revision, saved.updatedAt, p.id, p.revision);
    const owner = usageOwner();
    const batch = [statement];
    if (owner) {
      if (p.revision === 0) {
        const imported = req.headers.get('x-director-import') === '1';
        // changes() refers to the immediately preceding project write in this transaction.
        batch.push(
          db()
            .prepare(
              `INSERT OR IGNORE INTO desktop_usage_events(event_id,user_id,role_at_event,operation_id,output_id,metric,quantity,occurred_at,source,state) SELECT ?,?,?,?,?,?,?,?,?,? WHERE changes()>0`,
            )
            .bind(
              'idea:' + p.id,
              owner.id,
              owner.role,
              'project:' + p.id,
              p.id,
              'idea',
              p.brief.trim() && !imported ? 1 : 0,
              Date.now(),
              'project',
              imported
                ? 'ignored'
                : p.brief.trim()
                  ? 'pending'
                  : 'waiting_idea',
            ),
        );
      } else if (p.brief.trim()) {
        batch.push(
          db()
            .prepare(
              "UPDATE desktop_usage_events SET quantity=1,occurred_at=?,state='pending' WHERE event_id=? AND user_id=? AND state='waiting_idea' AND changes()>0",
            )
            .bind(Date.now(), 'idea:' + p.id, owner.id),
        );
      }
    }
    const result = await db().batch(batch);
    if (!result[0].meta.changes)
      return json(
        { error: '项目已存在或被其他窗口更新，请重新加载后再编辑。' },
        409,
      );
    return json(saved);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : '保存失败' }, 400);
  }
}
