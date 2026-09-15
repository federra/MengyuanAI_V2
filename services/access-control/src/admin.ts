import { randomUUID } from 'node:crypto';
import { AccessError, type AccessService } from './service.ts';

const fields =
  'id,account,note,role,expires_at,banned_at,ban_reason,revision,created_at,updated_at';
const DAY = 86400000;
function integer(value: string | null, fallback: number, max: number) {
  if (value === null) return fallback;
  if (!/^[1-9][0-9]*$/.test(value) || Number(value) > max)
    throw new AccessError('INVALID_INPUT');
  return Number(value);
}
function date(value: string | null): number | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new AccessError('INVALID_INPUT');
  const utc = Date.parse(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(utc) ||
    new Date(utc).toISOString().slice(0, 10) !== value
  )
    throw new AccessError('INVALID_INPUT');
  return utc - 8 * 3600000;
}
export function adminQuery(
  service: AccessService,
  token: string,
  path: string,
  params: URLSearchParams,
  requestId: string,
) {
  const actor = service.requireAdmin(token);
  const action =
    path === '/admin/users'
      ? 'admin.users.list'
      : path === '/admin/overview'
        ? 'admin.overview'
        : path === '/admin/audit-logs'
          ? 'admin.audit.list'
          : 'admin.usage.list';
  let targetId: string | null = null;
  let targetAccount = '';
  function audit(result: string, reason: string) {
    service.db
      .prepare('INSERT INTO admin_audit_logs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        randomUUID(),
        requestId,
        actor.id,
        actor.account,
        targetId,
        targetAccount,
        action,
        'null',
        'null',
        reason,
        result,
        service.now(),
      );
  }
  try {
    const page = integer(params.get('page'), 1, 1000000);
    const pageSize = integer(params.get('pageSize'), 20, 100);
    const from = date(params.get('from'));
    const to = date(params.get('to'));
    if (from !== null && to !== null && from > to)
      throw new AccessError('INVALID_INPUT');
    const q = (params.get('q') ?? '').trim();
    if (q.length > 200) throw new AccessError('INVALID_INPUT');
    const now = service.now();
    const today = Math.floor((now + 8 * 3600000) / DAY) * DAY - 8 * 3600000;
    const db = service.db;
    function totals(start: number, end: number, userId?: string) {
      const result: Record<string, number> = {
        idea: 0,
        story: 0,
        script: 0,
        asset: 0,
        video_export: 0,
        shot: 0,
        final: 0,
      };
      const rows = db
        .prepare(
          `SELECT metric,video_kind,SUM(quantity) quantity FROM usage_events WHERE role_at_event='member' AND clock_status='normal' AND occurred_at>=? AND occurred_at<? ${userId ? 'AND user_id=?' : ''} GROUP BY metric,video_kind`,
        )
        .all(...(userId ? [start, end, userId] : [start, end]));
      for (const row of rows) {
        if (Object.hasOwn(result, String(row.metric)))
          result[String(row.metric)] += Number(row.quantity);
        if (
          row.metric === 'video_export' &&
          (row.video_kind === 'shot' || row.video_kind === 'final')
        )
          result[row.video_kind] += Number(row.quantity);
      }
      return result;
    }
    function activity(userId?: string) {
      return db.prepare(`SELECT MAX(received_at) last_received_at,
        MAX(CASE WHEN clock_status='normal' THEN occurred_at END) last_activity_at,
        COALESCE(SUM(clock_status='anomalous'),0) anomalous_event_count
        FROM usage_events WHERE role_at_event='member' ${userId ? 'AND user_id=?' : ''}`).get(...(userId ? [userId] : []));
    }
    let result: unknown;
    if (path === '/admin/overview') {
      const members = db
        .prepare(
          `SELECT COUNT(*) total, COALESCE(SUM(banned_at IS NULL AND expires_at>?),0) active, COALESCE(SUM(banned_at IS NOT NULL),0) banned, COALESCE(SUM(banned_at IS NULL AND expires_at<=?),0) expired FROM users WHERE role='member'`,
        )
        .get(now, now);
      const activeToday = db
        .prepare(
          "SELECT COUNT(DISTINCT user_id) count FROM usage_events WHERE role_at_event='member' AND clock_status='normal' AND occurred_at>=? AND occurred_at<?",
        )
        .get(today, today + DAY)?.count;
      result = {
        ...activity(),
        today: totals(today, today + DAY),
        lifetime: totals(0, now + 1),
        members,
        preview: db
          .prepare(
            `SELECT ${fields} FROM users WHERE role='member' ORDER BY created_at DESC,id DESC LIMIT 5`,
          )
          .all()
          .map((user) => ({
            user,
            ...activity(String(user.id)),
            today: totals(today, today + DAY, String(user.id)),
            lifetime: totals(0, now + 1, String(user.id)),
          })),
        activeToday,
        trend: Array.from({ length: 7 }, (_, i) => ({
          date: new Date(today + (i - 6) * DAY + 8 * 3600000)
            .toISOString()
            .slice(0, 10),
          count: totals(today + (i - 6) * DAY, today + (i - 5) * DAY).idea,
        })),
        telemetry_connected: true,
        final_export_connected: false,
        server_time: now,
      };
    } else if (path === '/admin/users') {
      const status = params.get('status') ?? '';
      if (!['', 'active', 'expired', 'banned'].includes(status))
        throw new AccessError('INVALID_INPUT');
      const where =
        `role='member' AND (instr(lower(account),lower(?))>0 OR instr(lower(note),lower(?))>0)` +
        (status === 'active'
          ? ' AND banned_at IS NULL AND expires_at>?'
          : status === 'expired'
            ? ' AND banned_at IS NULL AND expires_at<=?'
            : status === 'banned'
              ? ' AND banned_at IS NOT NULL'
              : '');
      const args = ['active', 'expired'].includes(status)
        ? [q, q, now]
        : [q, q];
      const total = db
        .prepare(`SELECT COUNT(*) count FROM users WHERE ${where}`)
        .get(...args)?.count;
      result = {
        items: db
          .prepare(
            `SELECT ${fields} FROM users WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
          )
          .all(...args, pageSize, (page - 1) * pageSize)
          .map(user => ({ ...user, ...activity(String(user.id)) })),
        total,
        page,
        pageSize,
        server_time: now,
      };
    } else if (path === '/admin/audit-logs') {
      const filterAction = params.get('action') ?? '';
      if (filterAction.length > 64) throw new AccessError('INVALID_INPUT');
      const latest = Number(
        db
          .prepare('SELECT COALESCE(MAX(rowid),0) id FROM admin_audit_logs')
          .get()?.id,
      );
      const snapshotRaw = params.get('snapshot');
      const snapshot =
        snapshotRaw === '0'
          ? 0
          : integer(snapshotRaw, latest, Number.MAX_SAFE_INTEGER);
      const where =
        "rowid<=? AND (instr(lower(actor_account),lower(?))>0 OR instr(lower(target_account),lower(?))>0) AND (?='' OR action=?) AND created_at>=? AND created_at<?";
      const args = [
        snapshot,
        q,
        q,
        filterAction,
        filterAction,
        from ?? 0,
        to === null ? now + 1 : to + DAY,
      ];
      result = {
        items: db
          .prepare(
            `SELECT * FROM admin_audit_logs WHERE ${where} ORDER BY created_at DESC,rowid DESC LIMIT ? OFFSET ?`,
          )
          .all(...args, pageSize, (page - 1) * pageSize),
        total: db
          .prepare(`SELECT COUNT(*) count FROM admin_audit_logs WHERE ${where}`)
          .get(...args)?.count,
        page,
        pageSize,
        snapshot,
      };
    } else {
      targetId = /^\/admin\/users\/([^/]+)\/usage$/.exec(path)?.[1] ?? null;
      const user =
        targetId &&
        db
          .prepare(`SELECT ${fields} FROM users WHERE id=? AND role='member'`)
          .get(targetId);
      if (!user) throw new AccessError('NOT_FOUND', 404);
      targetAccount = String(user.account);
      const start = from ?? 0,
        end = to === null ? now + 1 : to + DAY;
      const where =
        "user_id=? AND role_at_event='member' AND occurred_at>=? AND occurred_at<?";
      result = {
        user,
        ...activity(targetId!),
        today: totals(today, today + DAY, targetId!),
        totals: totals(start, end, targetId!),
        items: db
          .prepare(
            `SELECT event_id,metric,video_kind,quantity,occurred_at,received_at,source,clock_status FROM usage_events WHERE ${where} ORDER BY occurred_at DESC,event_id DESC LIMIT ? OFFSET ?`,
          )
          .all(targetId!, start, end, pageSize, (page - 1) * pageSize),
        total: db
          .prepare(`SELECT COUNT(*) count FROM usage_events WHERE ${where}`)
          .get(targetId!, start, end)?.count,
        page,
        pageSize,
        telemetry_connected: true,
      };
    }
    audit(
      'success',
      JSON.stringify({
        page,
        pageSize,
        q,
        from: params.get('from') || '',
        to: params.get('to') || '',
        ...(path === '/admin/users'
          ? { status: params.get('status') || '' }
          : {}),
        ...(path === '/admin/audit-logs'
          ? { action: params.get('action') || '' }
          : {}),
      }),
    );
    return result;
  } catch (error) {
    audit(
      'failure',
      error instanceof AccessError ? error.code : 'INTERNAL_ERROR',
    );
    throw error;
  }
}
