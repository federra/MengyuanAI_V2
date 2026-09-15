import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { openStore } from './store.ts';
import { AccessService } from './service.ts';
import { createHandler } from './http.ts';

process.umask(0o077);
const db = openStore(resolve(process.env.ACCESS_DB ?? 'data/access.sqlite'));
const handle = createHandler(new AccessService(db));
const port = Number(process.env.ACCESS_PORT ?? 8793);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error('Invalid ACCESS_PORT');
const server = createServer(
  { maxHeaderSize: 8192, requestTimeout: 15_000, headersTimeout: 10_000 },
  async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) {
          res.writeHead(413, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
            connection: 'close',
          });
          res.end('{"error":{"code":"PAYLOAD_TOO_LARGE"}}');
          return;
        }
        chunks.push(chunk);
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (value !== undefined)
          headers.set(key, Array.isArray(value) ? value.join(',') : value);
      const method = req.method ?? 'GET';
      const request = new Request(
        `http://127.0.0.1${req.url?.startsWith('/') ? req.url : '/'}`,
        {
          method,
          headers,
          ...(method !== 'GET' && method !== 'HEAD'
            ? { body: Buffer.concat(chunks) }
            : {}),
        },
      );
      const proxyIp = req.headers['x-real-ip'];
      const ip =
        process.env.ACCESS_TRUST_PROXY === '1' &&
        typeof proxyIp === 'string' &&
        isIP(proxyIp)
          ? proxyIp
          : (req.socket.remoteAddress ?? 'unknown');
      const response = await handle(request, ip);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(400, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      res.end('{"error":{"code":"INVALID_INPUT"}}');
    }
  },
);
server.maxConnections = 128;
server.setTimeout(15_000, (socket) => socket.destroy());
server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log(
    JSON.stringify({
      event: 'listening',
      host: '127.0.0.1',
      port: typeof address === 'object' ? address?.port : port,
    }),
  );
});
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
