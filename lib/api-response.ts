export const progressType = 'application/x-ndjson';

// Keep the connection active without exposing partial model output as a valid result.
export function withProgress(
  req: Request,
  work: (accepted: (body: unknown) => void) => Promise<Response>,
): Promise<Response> | Response {
  if (!req.headers.get('accept')?.includes(progressType)) return work(() => {});
  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setInterval>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const start = Date.now();
      const send = (value: unknown) => {
        if (!closed)
          controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
      };
      send({ type: 'progress', seconds: 0 });
      timer = setInterval(
        () =>
          send({
            type: 'progress',
            seconds: Math.floor((Date.now() - start) / 1000),
          }),
        5000,
      );
      void (async () => {
        try {
          const response = await work((body) =>
            send({ type: 'accepted', body }),
          );
          const body = await response.json();
          send({ type: 'result', status: response.status, body });
        } catch {
          send({
            type: 'result',
            status: 502,
            body: { error: '服务未返回完整结果，请稍后重试；原内容未修改。' },
          });
        } finally {
          clearInterval(timer);
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      })();
    },
    cancel() {
      closed = true;
      clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': progressType + '; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function readApiResponse<T>(
  response: Response,
  onProgress?: (seconds: number) => void,
  onAccepted?: (body: T) => void,
): Promise<T> {
  const validate = (status: number, body: unknown): T => {
    if (status < 200 || status >= 300)
      throw Error(
        body &&
          typeof body === 'object' &&
          'error' in body &&
          typeof body.error === 'string'
          ? body.error
          : `请求失败（${status}），请重试。`,
      );
    return body as T;
  };
  if (!response.headers.get('content-type')?.includes(progressType)) {
    if (!response.headers.get('content-type')?.includes('json'))
      throw Error(
        `服务返回了非数据页面（${response.status}），请检查登录状态或稍后重试。`,
      );
    return validate(response.status, await response.json());
  }
  if (!response.body) throw Error('响应为空，原内容未修改。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      if (pending.length > 2200000) throw Error('生成结果过大，请分段生成。');
      let end;
      while ((end = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        if (message.type === 'progress')
          onProgress?.(Number(message.seconds) || 0);
        if (message.type === 'accepted') onAccepted?.(message.body as T);
        if (message.type === 'result')
          return validate(message.status, message.body);
      }
      if (done)
        throw Error('生成连接提前中断，未获得完整结果；原内容未修改，请重试。');
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
