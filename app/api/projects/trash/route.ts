import { db, json, sameOrigin } from '@/lib/server';
import { readProjectTrash } from '@/lib/project-trash-server';

export async function GET() {
  try { return json(await readProjectTrash()); }
  catch { return json({ error: '回收站暂不可用，请稍后重试。' }, 503); }
}

export async function DELETE(req: Request) {
  try { sameOrigin(req); }
  catch { return json({ error: '不允许跨站清空回收站。' }, 400); }
  try {
    // One atomic statement: restored/active projects and shared media remain intact.
    const result = await db().prepare('DELETE FROM projects WHERE deleted_at IS NOT NULL').run();
    return json({ clearedCount: result.meta.changes });
  } catch {
    return json({ error: '清空回收站失败，请稍后重试。' }, 503);
  }
}
