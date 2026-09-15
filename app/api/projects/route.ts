import { db, json, sameOrigin } from '@/lib/server';
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
    if (p.revision === 0) {
      const result = await db()
        .prepare(
          'INSERT OR IGNORE INTO projects(id,title,body,revision,updated_at) VALUES(?,?,?,?,?)',
        )
        .bind(p.id, p.title, body, revision, saved.updatedAt)
        .run();
      if (!result.meta.changes)
        return json({ error: '项目已存在，请重新加载后再编辑' }, 409);
    } else {
      const result = await db()
        .prepare(
          'UPDATE projects SET title=?,body=?,revision=?,updated_at=? WHERE id=? AND revision=?',
        )
        .bind(p.title, body, revision, saved.updatedAt, p.id, p.revision)
        .run();
      if (!result.meta.changes)
        return json(
          { error: '项目已在其他窗口更新，请先导出当前修改，再刷新页面。' },
          409,
        );
    }
    return json(saved);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : '保存失败' }, 400);
  }
}
