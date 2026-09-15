import { ingestUsage } from './usage.ts';
import { adminQuery } from './admin.ts';
import { randomUUID } from 'node:crypto';
import { AccessService, AccessError } from './service.ts';

async function readBody(request: Request) {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get('content-type') ?? '',
    )
  )
    throw new AccessError('UNSUPPORTED_MEDIA_TYPE', 415);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 8192) throw new AccessError('PAYLOAD_TOO_LARGE', 413);
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel();
    }
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AccessError('INVALID_INPUT');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new AccessError('INVALID_INPUT');
  return body;
}

export function createHandler(service: AccessService) {
  const attempts = new Map<string, { count: number; until: number }>();
  function limit(id: string) {
    const now = service.now();
    for (const [key, value] of attempts)
      if (value.until <= now) attempts.delete(key);
    const bucket = attempts.get(id) ?? { count: 0, until: now + 60_000 };
    if (bucket.count >= 10 || (!attempts.has(id) && attempts.size >= 10_000))
      throw new AccessError('RATE_LIMITED', 429);
    bucket.count++;
    attempts.set(id, bucket);
  }
  return async (request: Request, ip: string): Promise<Response> => {
    const requestId = randomUUID();
    const headers = new Headers({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-request-id': requestId,
    });
    try {
      const path = new URL(request.url).pathname;
      const auth = request.headers.get('authorization') ?? '';
      const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(auth)?.[1] ?? '';
      let result: unknown;
      if (request.method === 'GET' && path === '/health') {
        service.db.prepare('SELECT 1').get();
        result = { ok: true };
      } else if (request.method === 'POST' && path === '/auth/login') {
        limit(`ip:${ip}`);
        const body = await readBody(request);
        if (typeof body.account === 'string')
          limit(`account:${body.account.trim().toLowerCase().slice(0, 64)}`);
        result = await service.login(
          body.account,
          body.key,
          body.client_type,
          requestId,
        );
      } else if (request.method === 'POST' && path === '/usage/events') {
        service.me(token);
        result = ingestUsage(service, token, await readBody(request), requestId);
      } else if (request.method === 'GET' && path === '/auth/me') {
        result = service.me(token);
      } else if (request.method === 'POST' && path === '/auth/logout') {
        if (!token) throw new AccessError('UNAUTHENTICATED', 401);
        service.logout(token, requestId);
        result = { ok: true };
      } else if (
        request.method === 'GET' &&
        (['/admin/users', '/admin/overview', '/admin/audit-logs'].includes(
          path,
        ) ||
          /^\/admin\/users\/[^/]+\/usage$/.test(path))
      ) {
        result = adminQuery(
          service,
          token,
          path,
          new URL(request.url).searchParams,
          requestId,
        );
      } else if (
        request.method === 'POST' &&
        (path === '/admin/users' ||
          /^\/admin\/users\/[^/]+\/(ban|restore|authorization)$/.test(path))
      ) {
        service.requireAdmin(token);
        let body: Record<string, unknown>;
        try {
          body = await readBody(request);
        } catch (error) {
          service.recordRejectedAdminRequest(
            token,
            requestId,
            error instanceof AccessError ? error.code : 'INVALID_INPUT',
          );
          throw error;
        }
        if (path === '/admin/users')
          result = await service.createMember(
            token,
            {
              account: body.account,
              key: body.key,
              expires_at: body.expires_at,
              reason: body.reason,
              note: body.note,
            },
            requestId,
          );
        else {
          const match =
            /^\/admin\/users\/([^/]+)\/(ban|restore|authorization)$/.exec(
              path,
            )!;
          result = service.changeAuthorization(
            token,
            match[1],
            {
              action:
                match[2] === 'authorization'
                  ? 'expiry'
                  : (match[2] as 'ban' | 'restore'),
              revision: body.revision as number,
              reason: body.reason as string,
              expires_at: body.expires_at as number,
            },
            requestId,
          );
        }
      } else throw new AccessError('NOT_FOUND', 404);
      return new Response(JSON.stringify(result), { status: 200, headers });
    } catch (error) {
      const expected = error instanceof AccessError;
      const status = expected ? error.status : 503;
      if (status === 429) headers.set('retry-after', '60');
      // Do not log request bodies, credentials, query strings or database exception text.
      if (!expected)
        console.error(
          JSON.stringify({
            request_id: requestId,
            code: 'SERVICE_UNAVAILABLE',
          }),
        );
      return new Response(
        JSON.stringify({
          error: {
            code: expected ? error.code : 'SERVICE_UNAVAILABLE',
            request_id: requestId,
          },
        }),
        { status, headers },
      );
    }
  };
}
