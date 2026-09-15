import { db, files } from './server';
import { readyConfig, modelRequest } from './model-server';
import { getJob } from './generation-server';
import { speechBody, type SpeechInput } from './speech';
import type { GenerationJob } from './models';
export async function submitSpeech(
  input: SpeechInput,
  id: string,
  accepted?: (j: GenerationJob) => void,
) {
  if (!input || typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id))
    throw Error('配音任务 ID 无效');
  const existing = await db()
    .prepare('SELECT id FROM generation_jobs WHERE id=?')
    .bind(id)
    .first();
  if (existing) {
    const j = (await getJob(id)).job;
    if (
      j.target !== 'audio' ||
      j.projectId !== input.projectId ||
      j.targetId !== input.targetId ||
      j.lineId !== input.lineId
    )
      throw Error('任务目标不一致');
    return j;
  }
  const config = await readyConfig('audio', input.modelConfigId);
  const body = speechBody(config, input);
  const job: GenerationJob = {
    id,
    projectId: input.projectId,
    targetId: input.targetId,
    lineId: input.lineId,
    target: 'audio',
    speechText: input.text,
    prompt: input.text,
    status: 'submitting',
    createdAt: new Date().toISOString(),
    model: config.model,
  };
  const { apiKey: _key, ...snapshot } = config;
  const inserted = await db()
    .prepare(
      'INSERT OR IGNORE INTO generation_jobs(id,project_id,body,status,config,created_at) VALUES(?,?,?,?,?,?)',
    )
    .bind(
      id,
      input.projectId,
      JSON.stringify(job),
      job.status,
      JSON.stringify(snapshot),
      job.createdAt,
    )
    .run();
  if (!inserted.meta.changes) return (await getJob(id)).job;
  accepted?.(job);
  try {
    const response = await modelRequest(
      config,
      config.speechPath || '/audio/speech',
      body,
      true,
    );
    const mime = (response.headers.get('content-type') || '').split(';')[0];
    const type = ['audio/mpeg', 'audio/mp3'].includes(mime)
      ? 'audio/mpeg'
      : ['audio/wav', 'audio/x-wav', 'audio/wave'].includes(mime)
        ? 'audio/wav'
        : '';
    if (!type || !response.body)
      throw Error('声音服务没有返回 MP3/WAV 音频流，请核对协议和输出格式');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > 50 * 1024 * 1024) {
        await reader.cancel();
        throw Error('单条配音超过50MB，请缩短台词');
      }
      chunks.push(r.value);
    }
    if (!size) throw Error('声音服务返回空音频');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const mediaId = crypto.randomUUID();
    const name = `台词配音-${id.slice(0, 8)}.${type === 'audio/mpeg' ? 'mp3' : 'wav'}`;
    await files().put(mediaId, bytes, { httpMetadata: { contentType: type } });
    await db()
      .prepare('INSERT INTO media(id,name,type,size) VALUES(?,?,?,?)')
      .bind(mediaId, name, type, size)
      .run();
    job.media = { id: mediaId, name, type, url: `/api/media/${mediaId}` };
    job.status = 'succeeded';
  } catch (e) {
    job.status = 'attention';
    job.error = e instanceof Error ? e.message : '声音生成失败';
  }
  await db()
    .prepare(
      'UPDATE generation_jobs SET body=?,status=?,remote_id=COALESCE(?,remote_id) WHERE id=?',
    )
    .bind(JSON.stringify(job), job.status, null, id)
    .run();
  return job;
}
