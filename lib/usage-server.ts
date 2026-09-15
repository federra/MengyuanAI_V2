import { env } from 'cloudflare:workers';
import { db } from './server';
export type UsageEvent = {
  event_id: string;
  operation_id: string;
  output_id: string;
  metric: string;
  video_kind?: string;
  quantity: number;
  occurred_at?: number;
  source: string;
};
export function usageOwner() {
  const local = env as unknown as {
    DESKTOP_OWNER_ID?: string;
    DESKTOP_OWNER_ROLE?: string;
  };
  return local.DESKTOP_OWNER_ID &&
    ['member', 'super_admin'].includes(local.DESKTOP_OWNER_ROLE || '')
    ? { id: local.DESKTOP_OWNER_ID, role: local.DESKTOP_OWNER_ROLE! }
    : null;
}
export function usageStatement(event: UsageEvent, state = 'pending') {
  const owner = usageOwner();
  if (!owner) return [];
  return [
    db()
      .prepare(
        `INSERT OR IGNORE INTO desktop_usage_events(event_id,user_id,role_at_event,operation_id,output_id,metric,video_kind,quantity,occurred_at,source,state) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        event.event_id,
        owner.id,
        owner.role,
        event.operation_id,
        event.output_id,
        event.metric,
        event.video_kind || '',
        event.quantity,
        event.occurred_at ?? Date.now(),
        event.source,
        state,
      ),
  ];
}
export async function recordUsage(events: UsageEvent[]) {
  const statements = events.flatMap((e) => usageStatement(e));
  if (statements.length) await db().batch(statements);
}
export async function stableMediaId(operation: string) {
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(operation),
      ),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}
export async function saveMediaRecord(
  media: { id: string; name: string; type: string; size: number },
  source: string,
  operationId = media.id,
) {
  if (media.size <= 0) throw Error('素材内容为空');
  // Media metadata and its event commit together; retries keep the same media ID.
  await db().batch([
    db()
      .prepare('INSERT OR IGNORE INTO media(id,name,type,size) VALUES(?,?,?,?)')
      .bind(media.id, media.name, media.type, media.size),
    ...usageStatement({
      event_id: 'asset:' + media.id,
      operation_id: operationId,
      output_id: media.id,
      metric: 'asset',
      quantity: 1,
      source,
    }),
  ]);
}
