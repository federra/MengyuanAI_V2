import { db, json, sameOrigin } from '@/lib/server';
import { submitJob, refreshJob } from '@/lib/generation-server';
import { withProgress } from '@/lib/api-response';
export async function GET(req: Request) {
  try {
    const projectId = new URL(req.url).searchParams.get('projectId') || '';
    const rows = await db()
      .prepare(
        'SELECT body,status FROM generation_jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 100',
      )
      .bind(projectId)
      .all<{ body: string; status: string }>();
    return json(
      rows.results.map((r) => ({ ...JSON.parse(r.body), status: r.status })),
    );
  } catch {
    return json({ error: '任务读取失败' }, 503);
  }
}
export async function POST(req: Request) {
  return withProgress(req, async (accepted) => {
    try {
      sameOrigin(req);
      const raw = await req.text();
      if (raw.length > 48000) throw Error('请求内容过大');
      const body = JSON.parse(raw);
      if (typeof body.id !== 'string' || !/^[\w-]{1,80}$/.test(body.id))
        throw Error('任务ID无效');
      return json(
        body.action === 'refresh'
          ? await refreshJob(body.id)
          : await submitJob(body.input, body.id, accepted),
      );
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : '生成请求失败' },
        400,
      );
    }
  });
}
