import { randomUUID } from 'node:crypto';
import { AccessError, type AccessService } from './service.ts';
import { transaction } from './store.ts';

const eventFields = [
  'event_id', 'operation_id', 'output_id', 'metric', 'video_kind',
  'quantity', 'occurred_at', 'source',
] as const;
type Event = {
  event_id: string;
  operation_id: string;
  output_id: string;
  metric: string;
  video_kind: string;
  quantity: number;
  occurred_at: number;
  source: string;
};
function validate(input: unknown): Event {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new AccessError('INVALID_INPUT');
  const event = input as Event;
  if (Object.keys(event).some(key =>
    !eventFields.includes(key as typeof eventFields[number])))
    throw new AccessError('INVALID_INPUT');
  for (const [field, max] of [
    ['event_id', 240], ['operation_id', 100], ['output_id', 100],
  ] as const) {
    if (typeof event[field] !== 'string' ||
        !/^[a-zA-Z0-9:_.-]+$/.test(event[field]) || event[field].length > max)
      throw new AccessError('INVALID_INPUT');
  }
  if (
    !['idea', 'story', 'script', 'asset', 'video_export', 'draft_export', 'kit_export'].includes(event.metric) ||
    !['project', 'ai', 'generation', 'upload', 'doubao', 'speech', 'video_export'].includes(event.source) ||
    !Number.isSafeInteger(event.quantity) || event.quantity < 1 || event.quantity > 100 ||
    !Number.isSafeInteger(event.occurred_at) || event.occurred_at < 0 || event.occurred_at > 8.64e15 ||
    (event.metric === 'video_export'
      ? !['shot', 'final'].includes(event.video_kind)
      : event.video_kind !== '')
  ) throw new AccessError('INVALID_INPUT');
  return event;
}

export function ingestUsage(
  service: AccessService,
  token: string,
  body: Record<string, unknown>,
  requestId: string,
) {
  if (Object.keys(body).some(key => key !== 'events') ||
      !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 10)
    throw new AccessError('INVALID_INPUT');
  const events = body.events.map(validate);
  return transaction(service.db, () => {
    const user = service.me(token).user;
    const now = service.now();
    const acknowledged: string[] = [];
    for (const event of events) {
      const matches = service.db.prepare(`
        SELECT * FROM usage_events WHERE event_id=? OR
        (user_id=? AND operation_id=? AND output_id=? AND metric=? AND video_kind=?)
      `).all(event.event_id, user.id, event.operation_id, event.output_id,
        event.metric, event.video_kind);
      if (matches.length) {
        // Check both unique keys, so a colliding ID cannot acknowledge another user.
        if (matches.some(row => row.user_id !== user.id ||
          row.role_at_event !== user.role || eventFields.some(key =>
            key !== 'event_id' && row[key] !== event[key])))
          throw new AccessError('USAGE_EVENT_CONFLICT', 409);
      } else {
        const clockStatus = event.occurred_at < user.created_at ||
          event.occurred_at > now + 300000 ? 'anomalous' : 'normal';
        service.db.prepare(`
          INSERT INTO usage_events (event_id,user_id,role_at_event,operation_id,
          output_id,metric,video_kind,quantity,occurred_at,received_at,source,clock_status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(event.event_id, user.id, user.role, event.operation_id,
          event.output_id, event.metric, event.video_kind, event.quantity,
          event.occurred_at, now, event.source, clockStatus);
        if (user.role === 'super_admin') service.db.prepare(
          'INSERT INTO admin_audit_logs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        ).run(randomUUID(), requestId, user.id, user.account, user.id,
          user.account, `business.${event.metric}.completed`, 'null',
          JSON.stringify({ ...event, clock_status: clockStatus }), '', 'success', now);
      }
      acknowledged.push(event.event_id);
    }
    return { acknowledged, server_time: now };
  });
}
