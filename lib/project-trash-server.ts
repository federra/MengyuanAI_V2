import { db } from './server';
import { projectRetentionMs, trashEntry } from './project-trash';

export async function purgeExpiredProjects(now = Date.now()) {
  await db().prepare('DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at<=?')
    .bind(now - projectRetentionMs).run();
}

export async function readProjectTrash(now = Date.now()) {
  await purgeExpiredProjects(now);
  const rows = await db().prepare('SELECT body,deleted_at FROM projects WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
    .all<{ body: string; deleted_at: number }>();
  return rows.results.map(row => trashEntry(JSON.parse(row.body), row.deleted_at));
}

export async function projectRevision(req: Request, id: string) {
  if (!/^[\w-]{1,100}$/.test(id)) throw Error('项目编号无效');
  const raw = await req.text();
  if (raw.length > 1000) throw Error('项目操作参数过大');
  const { revision } = JSON.parse(raw) as { revision?: number };
  if (!Number.isInteger(revision) || !revision || revision < 1) throw Error('项目版本无效，请刷新项目列表');
  return revision;
}
