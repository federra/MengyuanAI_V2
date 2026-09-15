import { saveMediaRecord, stableMediaId } from '@/lib/usage-server';
import { db, files, json, sameOrigin } from '@/lib/server';
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: '请选择文件' }, 400);
    if (file.size > 50 * 1024 * 1024)
      return json({ error: '单个素材不能超过 50 MB' }, 413);
    if (
      ![
        'image/png',
        'image/jpeg',
        'image/webp',
        'video/mp4',
        'video/webm',
        'audio/mpeg',
        'audio/wav',
        'audio/x-wav',
        'audio/mp4',
        'audio/ogg',
        'audio/webm',
      ].includes(file.type)
    )
      return json(
        { error: '支持 JPG、PNG、WebP、MP4、WebM、MP3、WAV、M4A 和 OGG' },
        400,
      );
    const operation = form.get('operation_id');
    if (
      operation !== null &&
      (typeof operation !== 'string' ||
        !/^doubao:[a-zA-Z0-9_.:-]{1,80}$/.test(operation))
    )
      return json({ error: '素材操作标识无效' }, 400);
    if (!file.size) return json({ error: '素材内容为空' }, 400);
    const id = operation
      ? await stableMediaId(operation as string)
      : crypto.randomUUID();
    const existing = await db()
      .prepare('SELECT id,name,type FROM media WHERE id=?')
      .bind(id)
      .first<{ id: string; name: string; type: string }>();
    if (existing) return json({ ...existing, url: `/api/media/${id}` });
    await files().put(id, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
    await saveMediaRecord(
      { id, name: file.name.slice(0, 250), type: file.type, size: file.size },
      operation ? 'doubao' : 'upload',
      (operation as string) || id,
    );
    return json({
      id,
      name: file.name.slice(0, 250),
      type: file.type,
      url: `/api/media/${id}`,
    });
  } catch {
    return json({ error: '素材上传失败，请重试' }, 400);
  }
}
