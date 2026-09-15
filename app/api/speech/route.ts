import { sameOrigin, json } from '@/lib/server';
import { withProgress } from '@/lib/api-response';
import { submitSpeech } from '@/lib/speech-server';
export async function POST(req: Request) {
  return withProgress(req, async (accepted) => {
    try {
      sameOrigin(req);
      const raw = await req.text();
      if (raw.length > 14000) throw Error('配音请求过大');
      const body = JSON.parse(raw);
      return json(await submitSpeech(body.input, body.id, accepted));
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : '配音失败' }, 400);
    }
  });
}
