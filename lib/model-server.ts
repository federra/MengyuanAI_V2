import { env } from 'cloudflare:workers';
import { db } from './server';
import {
  modelDefaults,
  upgradeVideoConfig,
  type ModelConfig,
  type ModelKind,
  publicHttps,
  normalizeModelBase,
} from './models';
export const modelRequestTimeoutMs = 600_000;
async function cryptoKey() {
  if (!env.MODEL_ENCRYPTION_KEY) throw Error('模型密钥存储尚未初始化');
  return crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(env.MODEL_ENCRYPTION_KEY),
    ),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function seal(secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await cryptoKey(),
      new TextEncoder().encode(secret),
    ),
  );
  return JSON.stringify({ iv: Array.from(iv), data: Array.from(data) });
}
async function unseal(value: string) {
  const { iv, data } = JSON.parse(value);
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      await cryptoKey(),
      new Uint8Array(data),
    ),
  );
}
export async function config(
  kind: ModelKind,
  secret = false,
  profileId?: string,
): Promise<ModelConfig> {
  const selection = !profileId
    ? await db()
        .prepare('SELECT profile_id FROM model_defaults WHERE kind=?')
        .bind(kind)
        .first<{ profile_id: string }>()
    : null;
  const id = profileId || selection?.profile_id || kind;
  const row = await db()
    .prepare(
      id === kind
        ? 'SELECT body,secret FROM model_configs WHERE kind=?'
        : 'SELECT body,secret FROM model_profiles WHERE id=? AND kind=?',
    )
    .bind(...(id === kind ? [kind] : [id, kind]))
    .first<{ body: string; secret: string }>();
  if (row)
    return upgradeVideoConfig({
      ...JSON.parse(row.body),
      id,
      baseUrl: normalizeModelBase(JSON.parse(row.body).baseUrl),
      hasKey: !!row.secret,
      ...(secret && row.secret ? { apiKey: await unseal(row.secret) } : {}),
    });
  if (id !== kind) throw Error('找不到所选模型配置，请重新选择');
  if (kind === 'text' && env.DEEPSEEK_API_KEY && env.DEEPSEEK_MODEL)
    return {
      ...modelDefaults[0],
      id: kind,
      enabled: true,
      hasKey: true,
      model: env.DEEPSEEK_MODEL,
      ...(secret ? { apiKey: env.DEEPSEEK_API_KEY } : {}),
    };
  return {
    ...modelDefaults.find((x) => x.kind === kind)!,
    id: kind,
    hasKey: false,
  };
}
export async function listConfigs(): Promise<ModelConfig[]> {
  const kinds: ModelKind[] = ['text', 'image', 'video', 'audio'];
  const legacy = await Promise.all(kinds.map((k) => config(k, false, k)));
  const extra = await db()
    .prepare('SELECT id,kind,body,secret FROM model_profiles')
    .all<{ id: string; kind: ModelKind; body: string; secret: string }>();
  const selections = await Promise.all(
    kinds.map(async (kind) => ({
      kind,
      id:
        (
          await db()
            .prepare('SELECT profile_id FROM model_defaults WHERE kind=?')
            .bind(kind)
            .first<{ profile_id: string }>()
        )?.profile_id || kind,
    })),
  );
  return [
    ...legacy,
    ...extra.results.map((r) => ({
      ...JSON.parse(r.body),
      id: r.id,
      kind: r.kind,
      hasKey: !!r.secret,
      apiKey: undefined,
    })),
  ].map((c) => ({
    ...upgradeVideoConfig(c),
    isDefault: selections.some((s) => s.kind === c.kind && s.id === c.id),
  }));
}
export async function readyConfig(kind: ModelKind, profileId?: string) {
  const c = await config(kind, true, profileId);
  if (!c.enabled || !c.apiKey)
    throw Error(
      `请先在模型设置中保存并启用${kind === 'text' ? '文本推理' : kind === 'image' ? '图片' : kind === 'audio' ? '声音' : '视频'}模型`,
    );
  return c;
}
export async function modelRequest(
  c: ModelConfig,
  path: string,
  body?: unknown,
  binary = false,
) {
  publicHttps(c.baseUrl);
  let r: Response;
  try {
    r = await fetch(normalizeModelBase(c.baseUrl) + path, {
      method: body ? 'POST' : 'GET',
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${c.apiKey}`,
        ...(body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      ...(body
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
      signal: AbortSignal.timeout(modelRequestTimeoutMs),
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'model_request_failed',
        kind: c.kind,
        path,
        code: e instanceof Error ? e.name : 'NetworkError',
      }),
    );
    if (e instanceof Error && ['TimeoutError', 'AbortError'].includes(e.name))
      throw Error(
        `模型服务等待超过${modelRequestTimeoutMs / 1000}秒，请缩短单次内容或选择响应更快的模型。未自动重试，避免重复计费。`,
      );
    const detail = (e instanceof Error ? e.message : '网络错误')
      .split(c.apiKey || '__no_key__')
      .join('[已隐藏]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]')
      .slice(0, 180);
    throw Error(
      `无法连接模型服务（${detail}）。请检查服务地址、TLS证书及服务商网络限制；尚不能判断密钥是否有效。`,
    );
  }
  if (!r.ok) {
    let providerCode = '',
      providerMessage = '',
      hint = '请检查模型权限、参数和额度';
    try {
      const data = (await r.json()) as {
        error?: { code?: unknown; message?: unknown };
        message?: unknown;
      };
      providerCode =
        typeof data.error?.code === 'string'
          ? data.error.code.replace(/[^\w.-]/g, '').slice(0, 60)
          : '';
      const message =
        typeof data.error?.message === 'string'
          ? data.error.message
          : typeof data.message === 'string'
            ? data.message
            : '';
      providerMessage = message
        .split(c.apiKey || '__no_key__')
        .join('[已隐藏]')
        .replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]')
        .replace(/https?:\/\/\S+/gi, '[链接已隐藏]')
        .replace(/sk-[A-Za-z0-9_-]+/g, '[密钥已隐藏]')
        .replace(/[\r\n\t]+/g, ' ')
        .slice(0, 400);
      if (/response_format|json_object|json mode/i.test(message))
        hint =
          '当前模型或转发渠道不支持JSON模式，请使用兼容JSON输出的文本模型或渠道';
      else if (/max_tokens|max_completion_tokens/i.test(message))
        hint = '模型服务不支持当前输出长度参数，请检查服务商的模型兼容设置';
    } catch {
      /* A gateway may return HTML instead of JSON. */
    }
    if (r.status === 401 || r.status === 403)
      hint = '请检查API密钥、模型授权和服务商访问限制';
    if (r.status === 429)
      hint = '服务商限流或额度不足，请检查额度并稍后手动重试';
    if (r.status >= 500) hint = '服务商或转发网关暂时异常，请稍后手动重试';
    console.error(
      JSON.stringify({
        event: 'model_request_failed',
        kind: c.kind,
        path,
        status: r.status,
        code: providerCode,
      }),
    );
    const requestId = (
      r.headers.get('x-request-id') ||
      r.headers.get('request-id') ||
      ''
    )
      .replace(/[^\w.-]/g, '')
      .slice(0, 100);
    throw Error(
      `模型服务返回 ${r.status}，${providerMessage ? '服务商说明：' + providerMessage : hint}${providerCode ? '（错误码：' + providerCode + '）' : ''}${requestId ? '；请求编号：' + requestId : ''}。未自动重试。`,
    );
  }
  if (!binary && !r.headers.get('content-type')?.includes('json'))
    throw Error(
      '服务返回了网页而不是 API JSON，请检查基础地址是否缺少 /v1 或包含完整接口路径',
    );
  return r;
}
export async function textRequest(
  body: Record<string, unknown>,
  options: { allowEmptyTruncated?: boolean } = {},
) {
  const c = await readyConfig('text');
  // These DeepSeek models default to thinking. Their documented default output
  // budget is 64K, shared by reasoning and the answer; a small answer-only cap
  // can run out before a single JSON character is returned.
  const thinking = c.thinking || 'auto';
  const deepseekThinking = /^(deepseek-flash|deepseek-v4-pro|deepseek-v4-flash)$/i.test(c.model)
    && thinking !== 'disabled' && body.reasoning_effort !== 'none';
  const maxTokens = deepseekThinking && typeof body.max_tokens === 'number'
    ? Math.max(body.max_tokens, body.reasoning_effort === 'max' ? 131072 : 65536)
    : body.max_tokens;
  const response = await modelRequest(c, '/chat/completions', {
    ...body,
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
    model: c.model,
    ...(thinking !== 'auto' ? { thinking: { type: thinking } } : {}),
  });
  try {
    const data = (await response.json()) as {
      choices?: { finish_reason?: string; message?: { content?: unknown; reasoning_content?: unknown } }[];
      usage?: { completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
    };
    const finishReason = data.choices?.[0]?.finish_reason;
    const message = data.choices?.[0]?.message;
    if (Array.isArray(message?.content))
      message.content = message.content
        .map((part) =>
          typeof part === 'object' && part && typeof part.text === 'string'
            ? part.text
            : '',
        )
        .join('');
    const empty = typeof message?.content !== 'string' || !message.content.trim();
    if (empty || finishReason === 'length') {
      console.error(JSON.stringify({
        event: 'text_response_incomplete', model: c.model,
        finishReason: typeof finishReason === 'string' ? finishReason.slice(0, 40) : 'missing',
        maxTokens, contentChars: typeof message?.content === 'string' ? message.content.length : 0,
        hasReasoning: typeof message?.reasoning_content === 'string' && !!message.reasoning_content.trim(),
        completionTokens: typeof data.usage?.completion_tokens === 'number' ? data.usage.completion_tokens : undefined,
        reasoningTokens: typeof data.usage?.completion_tokens_details?.reasoning_tokens === 'number' ? data.usage.completion_tokens_details.reasoning_tokens : undefined,
      }));
    }
    if (empty && finishReason === 'length') {
      if (message && options.allowEmptyTruncated) {
        message.content = '';
        return Response.json(data);
      }
      throw Error(`模型触发生成长度限制（本次请求输出上限${typeof maxTokens === 'number' ? maxTokens + ' tokens' : '由服务商决定'}），尚未返回正文${message?.reasoning_content ? '，已返回推理内容' : ''}。这不等于剧本输入字数超限；请检查输出预算、思考模式或服务商限制后重试。`);
    }
    if (
      !message ||
      typeof message.content !== 'string' ||
      !message.content.trim()
    )
      throw Error(
        '模型未返回正文，请检查服务商响应与思考模式；不能据此判断剧本输入超限。',
      );
    return Response.json(data);
  } catch (e) {
    if (e instanceof Error && ['TimeoutError', 'AbortError'].includes(e.name))
      throw Error(
        `读取模型结果超过${modelRequestTimeoutMs / 1000}秒，未获得完整内容；请缩短单次输入后手动重试。未自动重试，避免重复计费。`,
      );
    if (e instanceof SyntaxError)
      throw Error('服务商响应不是完整JSON，请检查转发服务或稍后重试。');
    throw e;
  }
}
