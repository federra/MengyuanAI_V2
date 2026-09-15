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
    const id = crypto.randomUUID();
    await files().put(id, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
    await db()
      .prepare('INSERT INTO media(id,name,type,size) VALUES(?,?,?,?)')
      .bind(id, file.name.slice(0, 250), file.type, file.size)
      .run();
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
