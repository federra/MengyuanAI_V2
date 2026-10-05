import { db, json, sameOrigin } from '@/lib/server';
import { projectRevision } from '@/lib/project-trash-server';
import { projectRetentionMs } from '@/lib/project-trash';
import type { Project } from '@/lib/studio';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(req);
    const { id } = await context.params;
    const revision = await projectRevision(req, id);
    const now = Date.now(), updated = new Date(now).toISOString();
    const result = await db().prepare("UPDATE projects SET deleted_at=NULL,revision=revision+1,updated_at=?,body=json_set(body,'$.revision',revision+1,'$.updatedAt',?) WHERE id=? AND revision=? AND deleted_at>? RETURNING body")
      .bind(updated, updated, id, revision, now - projectRetentionMs).first<{ body: string }>();
    if (!result) return json({ error: '项目已过期、已恢复或发生变化，请刷新回收站。' }, 409);
    return json(JSON.parse(result.body) as Project);
  } catch (error) { return json({ error: error instanceof Error ? error.message : '恢复项目失败' }, 400); }
}
