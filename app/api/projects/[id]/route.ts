import { db, json, sameOrigin } from '@/lib/server';
import { projectRevision } from '@/lib/project-trash-server';
import { projectRetentionMs } from '@/lib/project-trash';

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(req);
    const { id } = await context.params;
    const revision = await projectRevision(req, id);
    const now = Date.now();
    const result = await db().prepare("UPDATE projects SET deleted_at=?,revision=revision+1,body=json_set(body,'$.revision',revision+1) WHERE id=? AND revision=? AND deleted_at IS NULL")
      .bind(now, id, revision).run();
    if (!result.meta.changes) return json({ error: '项目已更新、已删除或不存在，请刷新项目列表后重试。' }, 409);
    return json({ id, deletedAt: now, expiresAt: now + projectRetentionMs });
  } catch (error) { return json({ error: error instanceof Error ? error.message : '删除项目失败' }, 400); }
}
