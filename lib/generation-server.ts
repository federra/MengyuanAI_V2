import { saveMediaRecord, stableMediaId } from './usage-server';
import { validateVoiceBindings, planVideoVoices } from './video-voice';
import { db, files } from './server';
import {
  validateVideoBindings,
  finalVideoPrompt,
  videoReferenceError,
} from './video-request';
import {
  modelRequest,
  readyConfig,
  config,
  modelRequestTimeoutMs,
} from './model-server';
import {
  publicHttps,
  videoBody,
  validImageSize,
  resolveImageSize,
  type ModelConfig,
  type GenerationInput,
  type GenerationJob,
} from './models';
const limit = 50 * 1024 * 1024;
export function validateGeneration(x: GenerationInput) {
  if (
    !x ||
    !['image', 'video', 'blockingImage', 'asset'].includes(x.target) ||
    !/^[\w-]{1,80}$/.test(x.projectId) ||
    !/^[\w-]{1,80}$/.test(x.targetId)
  )
    throw Error('生成目标无效');
  if (
    typeof x.prompt !== 'string' ||
    !x.prompt.trim() ||
    x.prompt.length > 10000
  )
    throw Error('请填写1至10000字提示词');
  if (
    !(
      typeof x.ratio === 'string' &&
      /^\d{1,4}(?:\.\d{1,3})?:\d{1,4}(?:\.\d{1,3})?$/.test(x.ratio) &&
      Number(x.ratio.split(':')[0]) > 0 &&
      Number(x.ratio.split(':')[1]) > 0 &&
      Number(x.ratio.split(':')[0]) / Number(x.ratio.split(':')[1]) >= 1 / 8 &&
      Number(x.ratio.split(':')[0]) / Number(x.ratio.split(':')[1]) <= 8
    ) ||
    !Number.isInteger(x.duration) ||
    x.duration < 2 ||
    x.duration > 15
  )
    throw Error('画幅或时长无效，视频时长需为2至15整数秒');
  if (
    !Array.isArray(x.referenceIds) ||
    x.referenceIds.length > 9 ||
    x.referenceIds.some(
      (id) => typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id),
    ) ||
    (x.firstFrameId && !/^[\w-]{1,80}$/.test(x.firstFrameId))
  )
    throw Error('参考图无效，最多9张');
  if (
    !validImageSize(x.size) ||
    !['480p', '720p', '768p', '1080p'].includes(x.resolution)
  )
    throw Error('分辨率无效');
  if (
    x.modelConfigId !== undefined &&
    (typeof x.modelConfigId !== 'string' ||
      !/^[\w-]{1,80}$/.test(x.modelConfigId))
  )
    throw Error('模型配置无效');
  if (
    x.mediaUrls !== undefined &&
    (!x.mediaUrls ||
      typeof x.mediaUrls !== 'object' ||
      Array.isArray(x.mediaUrls) ||
      Object.entries(x.mediaUrls).length > 12 ||
      Object.entries(x.mediaUrls).some(
        ([id, url]) =>
          !/^[\w-]{1,80}$/.test(id) ||
          typeof url !== 'string' ||
          url.length > 4000,
      ))
  )
    throw Error('素材链接格式无效');
  for (const url of Object.values(x.mediaUrls || {})) if (url) publicHttps(url);
  validateVideoBindings(x);
  validateVoiceBindings(x);
  return x;
}
// Generated media retains its provider URL in its task. Never send a private /api/media
// or localhost URL to a provider, and never publish a whole private workspace.
async function referenceUrl(id: string, input: GenerationInput, audio = false) {
  const file = await files().head(id);
  const type = file?.httpMetadata?.contentType || '';
  if (
    !file ||
    !(
      audio
        ? ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave']
        : ['image/png', 'image/jpeg', 'image/webp']
    ).includes(type)
  )
    throw Error('参考素材不存在或格式不支持');
  const row = await db()
    .prepare(
      "SELECT remote_id FROM generation_jobs WHERE json_extract(body,'$.media.id')=? AND project_id=? AND status='succeeded' ORDER BY created_at DESC LIMIT 1",
    )
    .bind(id, input.projectId)
    .first<{ remote_id: string | null }>();
  const url = input.mediaUrls?.[id]?.trim() || row?.remote_id;
  if (!url)
    throw Error(
      `MiniMax 需要可访问的素材链接；${input.referenceBindings?.find((b) => b.mediaId === id)?.label || input.voiceBindings?.find((b) => b.mediaId === id)?.voiceName || id} 尚无来源链接，请在“MiniMax 素材链接”中填写 HTTPS 地址。`,
    );
  publicHttps(url);
  return url;
}
export function minimaxVideoBody(
  model: string,
  input: GenerationInput,
  images: string[],
  audios: string[],
) {
  if (images.length > 8 || audios.length > 3)
    throw Error('MiniMax 最多支持8张参考图、3段参考音频');
  return {
    model,
    prompt: input.prompt,
    seconds: String(input.duration),
    aspect_ratio: input.ratio,
    resolution: input.resolution,
    images,
    ...(audios.length ? { audios } : {}),
  };
}
async function imageData(id: string) {
  const f = await files().get(id);
  if (
    !f ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(
      f.httpMetadata?.contentType || '',
    )
  )
    throw Error('参考图不存在或格式不支持，请使用 PNG、JPEG 或 WebP 图片');
  const bytes = new Uint8Array(await f.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${f.httpMetadata!.contentType};base64,${btoa(binary)}`;
}
async function audioData(id: string) {
  const file = await files().get(id);
  const type = file?.httpMetadata?.contentType || '';
  const format = ['audio/mpeg', 'audio/mp3'].includes(type)
    ? 'mp3'
    : ['audio/wav', 'audio/x-wav', 'audio/wave'].includes(type)
      ? 'wav'
      : '';
  if (!file || !format)
    throw Error('音色样本不存在或格式不支持，请使用 MP3/WAV 文件');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:audio/${format};base64,${btoa(binary)}`;
}
async function saveOutput(
  data: { url?: string; b64_json?: string },
  video: boolean,
  response?: Response,
  operationId?: string,
) {
  const id = operationId
    ? await stableMediaId('generation:' + operationId)
    : crypto.randomUUID();
  const existing = await db()
    .prepare('SELECT id,name,type FROM media WHERE id=?')
    .bind(id)
    .first<{ id: string; name: string; type: string }>();
  if (existing) {
    await response?.body?.cancel();
    return { ...existing, url: `/api/media/${id}` };
  }
  let body: ReadableStream<Uint8Array>;
  let expectedSize = 0;
  let type = video ? 'video/mp4' : 'image/png';
  if (data.b64_json) {
    if (video || data.b64_json.length > 16 * 1024 * 1024)
      throw Error('返回素材过大');
    const b = Uint8Array.from(atob(data.b64_json), (c) => c.charCodeAt(0));
    expectedSize = b.byteLength;
    body = new Blob([b]).stream();
  } else {
    if (!response && !data.url) throw Error('模型未返回可下载素材');
    if (data.url) publicHttps(data.url);
    const r =
      response ||
      (await fetch(data.url!, {
        redirect: 'manual',
        signal: AbortSignal.timeout(modelRequestTimeoutMs),
      }));
    if (!r.ok || !r.body)
      throw Error('生成完成，但素材下载失败；请刷新任务重试下载');
    type = r.headers.get('content-type')?.split(';')[0] || type;
    if (
      !(
        video
          ? ['video/mp4', 'video/webm']
          : ['image/png', 'image/jpeg', 'image/webp']
      ).includes(type)
    )
      throw Error('模型返回的文件类型不支持');
    if (Number(r.headers.get('content-length')) > limit)
      throw Error('素材超过50MB，请在供应商处下载');
    expectedSize = Number(r.headers.get('content-length'));
    body = r.body;
  }
  let size = expectedSize;
  if (expectedSize > 0) {
    const fixed = new FixedLengthStream(expectedSize);
    await Promise.all([
      body.pipeTo(fixed.writable),
      files().put(id, fixed.readable, { httpMetadata: { contentType: type } }),
    ]);
  } else {
    // Responses without a length use a bounded buffer rather than an unsupported R2 stream.
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw Error('素材超过50MB，请在供应商处下载');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    await files().put(id, bytes, { httpMetadata: { contentType: type } });
  }
  const name = `生成素材-${id.slice(0, 8)}.${type.split('/')[1]}`;
  await saveMediaRecord(
    { id, name, type, size },
    'generation',
    operationId || id,
  );
  return { id, name, type, url: `/api/media/${id}` };
}
export async function getJob(id: string) {
  const row = await db()
    .prepare(
      'SELECT body,status,remote_id,config FROM generation_jobs WHERE id=?',
    )
    .bind(id)
    .first<{
      body: string;
      status: string;
      remote_id: string | null;
      config: string;
    }>();
  if (!row) throw Error('找不到该任务');
  return {
    ...row,
    job: { ...JSON.parse(row.body), status: row.status } as GenerationJob,
  };
}
async function storeJob(j: GenerationJob, remoteId?: string) {
  await db()
    .prepare(
      'UPDATE generation_jobs SET body=?,status=?,remote_id=COALESCE(?,remote_id) WHERE id=?',
    )
    .bind(JSON.stringify(j), j.status, remoteId || null, j.id)
    .run();
  return j;
}
// Keep response structure and identifiers, never credentials, prompts or signed URLs.
function recordResponse(
  j: GenerationJob,
  phase: string,
  response: Response,
  value: unknown,
) {
  type ResponseShape = {
    id?: unknown;
    task_id?: unknown;
    status?: unknown;
    video_url?: unknown;
    content?: { video_url?: unknown };
    data?: ResponseShape;
    choices?: { message?: { content?: unknown } }[];
  };
  const raw: ResponseShape =
    value && typeof value === 'object' ? (value as ResponseShape) : {};
  const out = raw.data?.status ? raw.data : raw;
  const safeId = (v: unknown) =>
    typeof v === 'string' && /^[\w.-]{1,120}$/.test(v) ? v : '';
  j.diagnostics = [
    ...(j.diagnostics || []),
    {
      at: new Date().toISOString(),
      phase,
      httpStatus: response.status,
      requestId: safeId(
        response.headers.get('x-request-id') ||
          response.headers.get('request-id'),
      ),
      fields: Object.keys(raw)
        .filter((k) => /^[a-zA-Z_]{1,40}$/.test(k))
        .slice(0, 20),
      providerStatus: safeId(out.status),
      providerTaskId: safeId(out.id || out.task_id),
      contentType: Array.isArray(raw.choices?.[0]?.message?.content)
        ? 'array'
        : typeof raw.choices?.[0]?.message?.content,
      hasVideoUrl: !!(out.video_url || out.content?.video_url),
    },
  ].slice(-8);
}
export async function submitJob(
  input: GenerationInput,
  id: string,
  onAccepted?: (job: GenerationJob) => void,
) {
  validateGeneration(input);
  const exists = await db()
    .prepare('SELECT id FROM generation_jobs WHERE id=?')
    .bind(id)
    .first();
  if (exists) return (await getJob(id)).job;
  const c = await readyConfig(
    input.target === 'video' ? 'video' : 'image',
    input.modelConfigId,
  );
  if (c.protocol === 'images' && input.referenceIds.length)
    throw Error('通用文生图协议不支持参考图，请选择 Seedream 协议或取消参考图');
  if (input.firstFrameId && input.referenceIds.length)
    throw Error('首帧和多参考图模式不能同时启用');
  if (input.target === 'video') validateVideoModel(c, input);
  const minimax = c.protocol === 'heima-minimax';
  // Material validation happens before creating a billable upstream request.
  const refs: string[] = [];
  for (const ref of input.referenceIds)
    refs.push(minimax ? await referenceUrl(ref, input) : await imageData(ref));
  const first = input.firstFrameId
    ? minimax
      ? await referenceUrl(input.firstFrameId, input)
      : await imageData(input.firstFrameId)
    : undefined;
  if (input.target === 'video') {
    validateVideoModel(c, input);
    input = { ...input, prompt: finalVideoPrompt(input, c) };
  }
  if (input.target !== 'video') input = { ...input, size: resolveImageSize(input.size, c.protocol, c.model) };
  const voicePlan = planVideoVoices(c, input);
  const audioRefs: string[] = [];
  for (const sample of voicePlan.samples)
    audioRefs.push(
      minimax
        ? await referenceUrl(sample.mediaId, input, true)
        : await audioData(sample.mediaId),
    );
  const j: GenerationJob = {
    id,
    projectId: input.projectId,
    targetId: input.targetId,
    target: input.target,
    status: 'submitting',
    createdAt: new Date().toISOString(),
    model: c.model,
    prompt: input.prompt,
    ...(input.target === 'video'
      ? {
          referenceBindings: input.referenceBindings,
          voiceBindings: voicePlan.bindings,
          videoSettings: {
            ratio: input.ratio,
            duration: input.duration,
            resolution: input.resolution,
          },
        }
      : {}),
  };
  const { apiKey: _key, ...snapshot } = c;
  const inserted = await db()
    .prepare(
      'INSERT OR IGNORE INTO generation_jobs(id,project_id,body,status,config,created_at) VALUES(?,?,?,?,?,?)',
    )
    .bind(
      id,
      input.projectId,
      JSON.stringify(j),
      j.status,
      JSON.stringify(snapshot),
      j.createdAt,
    )
    .run();
  if (!inserted.meta.changes) return (await getJob(id)).job;
  // Acknowledge only after validation and durable, idempotent task creation.
  onAccepted?.(j);
  try {
    if (input.target === 'video') {
      if (c.protocol === 'chat-video') {
        const r = await modelRequest(c, '/chat/completions', {
          model: c.model,
          stream: false,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: input.prompt },
                ...[...(first ? [first] : refs)].map((url) => ({
                  type: 'image_url',
                  image_url: { url },
                })),
              ],
            },
          ],
        });
        const out = (await r.json()) as {
          choices?: { message?: { content?: unknown } }[];
        };
        recordResponse(j, '提交 /chat/completions', r, out);
        await storeJob(j);
        const url = chatVideoUrl(out.choices?.[0]?.message?.content);
        await storeJob({ ...j, status: 'running' }, url);
        return storeJob({
          ...j,
          status: 'succeeded',
          media: await saveOutput({ url }, true, undefined, j.id),
        });
      }
      const r = minimax
        ? await modelRequest(
            c,
            '/videos',
            minimaxVideoBody(c.model, input, first ? [first] : refs, audioRefs),
          )
        : c.protocol === 'heima-video'
          ? await modelRequest(
              c,
              '/videos',
              await heimaVideoForm(c.model, input, refs, first),
            )
          : await modelRequest(
              c,
              '/contents/generations/tasks',
              videoBody(
                c.model,
                input,
                refs,
                first,
                audioRefs,
                voicePlan.mode !== 'none' && !!voicePlan.bindings.length,
              ),
            );
      const out = (await r.json()) as { id?: string; task_id?: string };
      recordResponse(j, '提交视频任务', r, out);
      await storeJob(j);
      const remoteId = minimax ? out.id || out.task_id : out.task_id || out.id;
      if (typeof remoteId !== 'string' || !remoteId)
        throw Error('服务未返回任务ID，请在供应商后台核对');
      return storeJob({ ...j, status: 'running' }, remoteId);
    }
    const body = {
      model: c.model,
      prompt: input.prompt,
      size: input.size,
      ...(c.protocol === 'seedream'
        ? { response_format: 'url', ...(refs.length ? { image: refs } : {}) }
        : { n: 1 }),
    };
    const r = await modelRequest(c, '/images/generations', body);
    const out = (await r.json()) as {
      data?: { url?: string; b64_json?: string }[];
    };
    if (!out.data?.[0]) throw Error('服务未返回图片，请在供应商后台核对');
    if (out.data[0].url)
      await storeJob({ ...j, status: 'running' }, out.data[0].url);
    return storeJob({
      ...j,
      status: 'succeeded',
      media: await saveOutput(out.data[0], false, undefined, j.id),
    });
  } catch (e) {
    return storeJob({
      ...j,
      status: 'attention',
      error: e instanceof Error ? e.message : '提交结果未知，请核对供应商记录',
    });
  }
}
const refreshingJobs = new Map<string, Promise<GenerationJob>>();
export function refreshJob(id: string) {
  const pending = refreshingJobs.get(id);
  if (pending) return pending;
  const work = refreshJobOnce(id).finally(() => refreshingJobs.delete(id));
  refreshingJobs.set(id, work);
  return work;
}
async function refreshJobOnce(id: string) {
  const row = await getJob(id);
  const j = row.job;
  if (j.status === 'succeeded' || j.status === 'failed') return j;
  if (!row.remote_id) {
    if (j.status === 'submitting') return j;
    throw Error(
      '这条任务没有可查询的供应商任务 ID 或视频链接，无法重试下载。请先在供应商后台核对该次提交记录；查询不会重新生成或重复扣费。',
    );
  }
  if (j.target !== 'video') {
    try {
      return await storeJob({
        ...j,
        status: 'succeeded',
        error: undefined,
        media: await saveOutput({ url: row.remote_id }, false, undefined, j.id),
      });
    } catch (e) {
      return storeJob({
        ...j,
        status: 'attention',
        error: e instanceof Error ? e.message : '图片下载失败',
      });
    }
  }
  const original = JSON.parse(row.config) as ModelConfig;
  if (original.protocol === 'chat-video') {
    try {
      await storeJob({ ...j, status: 'downloading', error: undefined });
      return await storeJob({
        ...j,
        status: 'succeeded',
        error: undefined,
        media: await saveOutput({ url: row.remote_id }, true, undefined, j.id),
      });
    } catch (e) {
      return storeJob({
        ...j,
        status: 'attention',
        error: e instanceof Error ? e.message : '下载失败',
      });
    }
  }
  const current = await config('video', true, original.id || 'video');
  if (!current.apiKey) throw Error('原视频配置缺少密钥，请在模型设置中补充');
  if (current.baseUrl !== original.baseUrl)
    throw Error('该任务来自之前的服务地址，请恢复原视频服务配置后查询');
  const r = await modelRequest(
    { ...original, apiKey: current.apiKey },
    (['heima-video', 'heima-minimax'].includes(original.protocol)
      ? '/videos/'
      : '/contents/generations/tasks/') + encodeURIComponent(row.remote_id),
  );
  const raw = (await r.json()) as {
    status?: string;
    content?: { video_url?: string };
    data?: { status?: string; content?: { video_url?: string } };
  };
  recordResponse(j, '查询视频任务', r, raw);
  await storeJob(j);
  const out = ['heima-video', 'heima-minimax'].includes(original.protocol)
    ? raw.data?.status
      ? raw.data
      : raw
    : raw;
  const status = String(out.status || '').toLowerCase();
  if (['succeeded', 'completed', 'success'].includes(status)) {
    try {
      await storeJob({ ...j, status: 'downloading', error: undefined });
      return await storeJob({
        ...j,
        status: 'succeeded',
        error: undefined,
        media: ['heima-video', 'heima-minimax'].includes(original.protocol)
          ? await saveOutput(
              {},
              true,
              await modelRequest(
                { ...original, apiKey: current.apiKey },
                '/videos/' + encodeURIComponent(row.remote_id) + '/content',
                undefined,
                true,
              ),
              j.id,
            )
          : await saveOutput(
              { url: out.content?.video_url },
              true,
              undefined,
              j.id,
            ),
      });
    } catch (e) {
      return storeJob({
        ...j,
        status: 'attention',
        error: e instanceof Error ? e.message : '下载失败，请刷新任务重试',
      });
    }
  }
  if (
    ['failed', 'failure', 'cancelled', 'canceled', 'expired'].includes(status)
  )
    return storeJob({
      ...j,
      status: 'failed',
      error: '供应商任务未成功，请检查额度、参数或内容要求后重新提交',
    });
  if (
    ![
      'queued',
      'pending',
      'running',
      'processing',
      'in_progress',
      'submitted',
    ].includes(status)
  )
    throw Error('服务返回未知任务状态，请检查所选视频协议');
  return storeJob({ ...j, status: 'running', error: undefined });
}

// The documented Heima GROK contract uses multipart files, not Ark image_url JSON.
export function validateVideoModel(c: ModelConfig, input: GenerationInput) {
  const referenceError = videoReferenceError(c, input);
  if (referenceError) throw Error(referenceError);
  if (c.protocol === 'heima-minimax') {
    if (c.model !== 'minimax_h3')
      throw Error(
        '当前文档支持的 MiniMax 型号为 minimax_h3，请在模型设置中修正。',
      );
    if (
      !['16:9', '9:16'].includes(input.ratio) ||
      !['480p', '768p'].includes(input.resolution) ||
      input.duration < 5 ||
      input.duration > 15
    )
      throw Error(
        'MiniMax H3 支持5至15整数秒、480p/768p、16:9或9:16，请调整参数。',
      );
  }
  if (c.protocol === 'heima-video') {
    if (
      !['16:9', '9:16'].includes(input.ratio) ||
      !['720p', '1080p'].includes(input.resolution)
    )
      throw Error('黑马 GROK 支持横屏16:9、竖屏9:16及720p/1080p，请调整后提交');
    if (![6, 10, 15].includes(input.duration))
      throw Error('黑马 GROK 时长请选择6、10或15秒');
    if (input.referenceIds.length > 7)
      throw Error('黑马 GROK 最多支持7张参考图');
  }
  if (c.protocol === 'chat-video' && c.model.startsWith('firefly-veo31-')) {
    const m = c.model.match(/-(\d+)s-(\d+x\d+)-(\d+p)$/);
    if (!m) throw Error('请填写文档中的完整 Firefly VEO 型号');
    if (
      Number(m[1]) !== input.duration ||
      m[2].replace('x', ':') !== input.ratio ||
      m[3] !== input.resolution
    )
      throw Error(
        `该型号固定为${m[1]}秒、${m[2].replace('x', ':')}、${m[3]}，请调整参数或选择其他型号`,
      );
    if (input.referenceIds.length > (c.model.includes('-ref-') ? 3 : 2))
      throw Error('该VEO型号参考图片数量超限');
  }
}
export async function heimaVideoForm(
  model: string,
  input: GenerationInput,
  refs: string[],
  first?: string,
) {
  const form = new FormData();
  const short = input.resolution === '1080p' ? 1080 : 720,
    long = short === 1080 ? 1920 : 1280;
  form.set('model', model);
  form.set('prompt', input.prompt);
  form.set('seconds', String(input.duration));
  form.set(
    'size',
    input.ratio === '9:16' ? `${short}x${long}` : `${long}x${short}`,
  );
  form.set('resolution_name', input.resolution);
  for (const [i, url] of (first ? [first] : refs).entries()) {
    const match = url.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
    if (!match) throw Error('参考图片格式无效');
    form.append(
      'input_reference[]',
      new Blob([Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))], {
        type: match[1],
      }),
      `reference-${i + 1}.${match[1].split('/')[1]}`,
    );
  }
  return form;
}
export function chatVideoUrl(content: unknown): string {
  if (Array.isArray(content))
    content = content
      .map((part) =>
        part?.type === 'text' && typeof part.text === 'string' ? part.text : '',
      )
      .join('\n');
  if (typeof content !== 'string')
    throw Error('服务未返回视频链接，请核对响应格式');
  const src = content.match(
    /<(?:video|source)\b[^>]*\bsrc=["'](https:\/\/[^"']+)["']/i,
  )?.[1];
  const link = content.match(
    /https:\/\/[^\s<>"'\])]+\.(?:mp4|webm)(?:\?[^\s<>"'\])]+)?/i,
  )?.[0];
  const url = (src || link || '').replaceAll('&amp;', '&');
  if (!url)
    throw Error('Chat 视频响应没有可下载的 HTTPS 视频链接，请在供应商后台核对');
  publicHttps(url);
  return url;
}
