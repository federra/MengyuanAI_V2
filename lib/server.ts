import { env } from 'cloudflare:workers';
export function db() {
  return env.DB;
}
export function files() {
  return env.FILES;
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin)
    throw Error('不允许跨站写入');
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
