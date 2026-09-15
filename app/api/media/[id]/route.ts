import { files } from '@/lib/server';
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id))
    return new Response('Not found', { status: 404 });
  const item = await files().get(id, { range: req.headers });
  if (!item) return new Response('Not found', { status: 404 });
  const headers = new Headers({
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600',
    'Accept-Ranges': 'bytes',
  });
  item.writeHttpMetadata(headers);
  let status = 200;
  if (
    item.range &&
    'offset' in item.range &&
    'length' in item.range &&
    typeof item.range.offset === 'number' &&
    typeof item.range.length === 'number'
  ) {
    headers.set(
      'Content-Range',
      `bytes ${item.range.offset}-${item.range.offset + item.range.length - 1}/${item.size}`,
    );
    headers.set('Content-Length', String(item.range.length));
    status = 206;
  } else headers.set('Content-Length', String(item.size));
  return new Response(item.body, { status, headers });
}
