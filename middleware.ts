import { env } from 'cloudflare:workers';
// Standalone Web has no multi-user ownership migration yet: fail closed.
// Desktop additionally verifies central authorization in desktop/worker.mjs.
export function middleware(request: Request) {
  const bindings = env as unknown as { DESKTOP_SESSION_TOKEN?: string };
  const token = bindings.DESKTOP_SESSION_TOKEN;
  if (
    !token ||
    !(request.headers.get('cookie') || '')
      .split(';')
      .some((part) => part.trim() === `director_session=${token}`)
  )
    return Response.json(
      { error: '请使用桌面软件登录。' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
}
export const config = { matcher: ['/api/:path*'] };
