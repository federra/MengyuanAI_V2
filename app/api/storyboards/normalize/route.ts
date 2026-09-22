import { json, sameOrigin } from '@/lib/server';
import { withProgress } from '@/lib/api-response';
import { prepareStoryboard } from '@/lib/storyboard-conversion-server';
export function POST(req: Request) {
  return withProgress(req, async accepted => {
    try {
      sameOrigin(req);
      const raw = await req.text();
      if (raw.length > 2_100_000) return json({error: '分镜内容过大'}, 413);
      const {source} = JSON.parse(raw);
      const result = await prepareStoryboard(source, () => accepted({phase: 'storyboard-converting'}));
      return json({text: result.text, converted: result.converted});
    } catch (e) { return json({error: e instanceof Error ? e.message : '分镜校验失败，原内容未修改。'}, 422); }
  });
}
