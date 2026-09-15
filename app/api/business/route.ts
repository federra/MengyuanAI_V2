import { db, json, sameOrigin } from '@/lib/server';
import { applyBusiness, emptyBusiness, type Business } from '@/lib/business';
async function read() {
  const row = await db()
    .prepare('SELECT body FROM business_state WHERE id=?')
    .bind('owner')
    .first<{ body: string }>();
  return row ? (JSON.parse(row.body) as Business) : emptyBusiness();
}
export async function GET() {
  try {
    return json(await read());
  } catch {
    return json({ error: '业务账本暂时不可用，请稍后重试' }, 503);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const raw = await req.text();
    if (raw.length > 10000) return json({ error: '请求过大' }, 413);
    const input = JSON.parse(raw);
    const current = await read();
    if (input.revision !== current.revision)
      return json({ error: '账本已被其他窗口更新，请重新加载账本再操作' }, 409);
    if (
      !input.action ||
      typeof input.action !== 'object' ||
      Array.isArray(input.action)
    )
      throw Error('操作格式错误');
    const next = applyBusiness(
      current,
      input.action,
      new Date().toISOString(),
      crypto.randomUUID(),
    );
    const body = JSON.stringify(next);
    if (new TextEncoder().encode(body).length > 1500000)
      throw Error('账本容量已达上限，请联系管理员扩容');
    const result =
      current.revision === 0
        ? await db()
            .prepare(
              'INSERT OR IGNORE INTO business_state(id,body,revision) VALUES(?,?,?)',
            )
            .bind('owner', body, next.revision)
            .run()
        : await db()
            .prepare(
              'UPDATE business_state SET body=?,revision=? WHERE id=? AND revision=?',
            )
            .bind(body, next.revision, 'owner', current.revision)
            .run();
    if (!result.meta.changes)
      return json({ error: '保存冲突，请重新加载账本再操作' }, 409);
    return json(next);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : '业务操作失败' },
      400,
    );
  }
}
