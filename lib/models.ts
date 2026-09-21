export type ModelKind = 'text' | 'image' | 'video' | 'audio';
export function imageSizeForRatio(ratio: string, protocol?: string, model = ''): string {
  if (protocol === 'images') {
    const options = imageSizeOptions(protocol, model);
    const [w,h] = ratio.split(':').map(Number);
    return options.length === 3 && !/dall-e-2/i.test(model)
      ? options[w > h ? 1 : w < h ? 2 : 0] : '1024x1024';
  }
  if (protocol === 'seedream') {
    const sizes: Record<string, string> = {
      '16:9': '2560x1440', '9:16': '1440x2560', '1:1': '2048x2048',
      '4:3': '2304x1728', '3:4': '1728x2304', '21:9': '3024x1296',
    };
    return sizes[ratio] || resolveImageSize(customImageSize(ratio), protocol);
  }
  return (
    (
      {
        '16:9': '2048x1152',
        '9:16': '1152x2048',
        '1:1': '1536x1536',
        '4:3': '1792x1344',
        '3:4': '1344x1792',
        '21:9': '2688x1152',
      } as Record<string, string>
    )[ratio] || customImageSize(ratio)
  );
}
function customImageSize(ratio: string): string {
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h || !Number.isFinite(w / h) || w / h < 1 / 8 || w / h > 8)
    return '2048x1152';
  const scale = Math.min(
    4096 / Math.max(w, h),
    Math.sqrt((2048 * 1152) / (w * h)),
  );
  return `${Math.round((w * scale) / 8) * 8}x${Math.round((h * scale) / 8) * 8}`;
}
export function validImageSize(size: string): boolean {
  if (['2K', '4K'].includes(size)) return true;
  if (!/^\d{3,4}x\d{3,4}$/.test(size)) return false;
  const [w, h] = size.split('x').map(Number);
  return w >= 256 && h >= 256 && w <= 4096 && h <= 4096;
}
export function imageSizeOptions(protocol?: string, model = ''): string[] {
  if (protocol !== 'images') return ['2K', '4K'];
  if (/dall-e-2/i.test(model)) return ['256x256', '512x512', '1024x1024'];
  if (/dall-e-3/i.test(model)) return ['1024x1024', '1792x1024', '1024x1792'];
  return ['1024x1024', '1536x1024', '1024x1536'];
}
// Seedream 4.5 accepts at least 2560 * 1440 pixels. Upgrade legacy
// explicit dimensions before sending, keeping their aspect ratio (8px rounding).
export function resolveImageSize(size: string, protocol: string, model = ''): string {
  if (protocol === 'images' && /gpt-image|dall-e-[23]/i.test(model) && !imageSizeOptions(protocol, model).includes(size))
    throw Error('该模型不支持所选图片尺寸，请重新选择兼容尺寸。');
  if (protocol !== 'seedream' || ['2K', '4K'].includes(size)) return size;
  if (!validImageSize(size)) throw Error('图片尺寸无效，请重新选择。');
  const [w, h] = size.split('x').map(Number);
  if (w * h >= 3686400) return size;
  const scale = Math.sqrt(3686400 / (w * h));
  const width = Math.ceil(w * scale / 8) * 8;
  const height = Math.ceil(h * scale / 8) * 8;
  const resolved = `${width}x${height}`;
  if (!validImageSize(resolved)) throw Error('该画幅无法在当前尺寸范围满足 Seedream 最低像素要求，请选择2K、4K或常用画幅。');
  return resolved;
}
export type ModelConfig = {
  id?: string;
  isDefault?: boolean;
  kind: ModelKind;
  name: string;
  baseUrl: string;
  model: string;
  protocol: string;
  thinking: string;
  enabled: boolean;
  voiceReference?: 'auto' | 'none' | 'text' | 'audio';
  hasKey?: boolean;
  apiKey?: string;
  speechPath?: string;
  speechVoice?: string;
  speechVoices?: string[];
  speechFormat?: 'mp3' | 'wav';
  speechInstructions?: boolean;
};
export const modelDefaults: ModelConfig[] = [
  // Keep text first: the environment-provided text configuration uses index zero.
  {
    kind: 'text',
    name: '文本推理',
    baseUrl: 'https://api.deepseek.com',
    model: '',
    protocol: 'chat',
    thinking: 'auto',
    enabled: false,
  },
  {
    kind: 'image',
    name: '图片生成',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: '',
    protocol: 'seedream',
    thinking: 'auto',
    enabled: false,
  },
  {
    kind: 'video',
    name: '视频生成',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: '',
    protocol: 'ark-video',
    thinking: 'auto',
    enabled: false,
  },
  {
    kind: 'audio',
    name: '声音合成',
    baseUrl: '',
    model: '',
    protocol: 'speech',
    thinking: 'auto',
    enabled: false,
    speechPath: '/audio/speech',
    speechVoice: '',
    speechVoices: [],
    speechFormat: 'mp3',
    speechInstructions: false,
  },
];
export function publicHttps(value: string) {
  const u = new URL(value);
  const h = u.hostname.toLowerCase();
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.hash ||
    (u.port && u.port !== '443') ||
    !h.includes('.') ||
    h === 'localhost' ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(h) ||
    /^[\d.]+$/.test(h) ||
    h.includes(':') ||
    h.startsWith('[') ||
    h.endsWith('.workers.dev') ||
    h.endsWith('.chatgpt.site')
  )
    throw Error('请填写公开 HTTPS 服务地址，不支持本机、内网或本站地址');
  return u;
}
export function validateModel(raw: ModelConfig): ModelConfig {
  raw = upgradeVideoConfig(raw);
  const allowed: Record<ModelKind, string[]> = {
    text: ['chat'],
    image: ['images', 'seedream'],
    video: ['ark-video', 'heima-video', 'heima-minimax', 'chat-video'],
    audio: ['speech'],
  };
  if (!allowed[raw.kind]?.includes(raw.protocol)) throw Error('模型协议不匹配');
  const u = publicHttps(raw.baseUrl);
  if (u.search) throw Error('API 基础地址不能包含查询参数');
  if (
    typeof raw.model !== 'string' ||
    !raw.model.trim() ||
    raw.model.length > 150 ||
    typeof raw.name !== 'string' ||
    raw.name.length > 80
  )
    throw Error('请填写模型名称或推理接入点 ID');
  if (!['auto', 'enabled', 'disabled'].includes(raw.thinking))
    throw Error('推理模式无效');
  if (raw.kind === 'audio') {
    if (!/^\/[A-Za-z0-9/_-]{1,150}$/.test(raw.speechPath || '/audio/speech'))
      throw Error('声音接口路径必须是以 / 开头的相对路径');
    if (
      typeof (raw.speechVoice ?? '') !== 'string' ||
      (raw.speechVoice || '').length > 150
    )
      throw Error('默认音色 ID 无效');
    if (
      !Array.isArray(raw.speechVoices ?? []) ||
      (raw.speechVoices || []).length > 100 ||
      (raw.speechVoices || []).some(
        (v) => typeof v !== 'string' || !v.trim() || v.length > 150,
      )
    )
      throw Error('音色列表格式无效');
    if (!['mp3', 'wav'].includes(raw.speechFormat || 'mp3'))
      throw Error('请选择 MP3 或 WAV');
  }
  if (
    raw.voiceReference !== undefined &&
    !['auto', 'none', 'text', 'audio'].includes(raw.voiceReference)
  )
    throw Error('音色参考能力设置无效');
  if (
    raw.voiceReference === 'audio' &&
    (raw.kind !== 'video' ||
      !['ark-video', 'heima-minimax'].includes(raw.protocol))
  )
    throw Error('当前音频样本接口支持方舟兼容与黑马 MiniMax H3 协议');
  return {
    kind: raw.kind,
    name: raw.name.trim(),
    baseUrl: normalizeModelBase(u.href),
    model: raw.model.trim(),
    protocol: raw.protocol,
    thinking: raw.thinking,
    enabled: raw.enabled === true,
    ...(raw.kind === 'audio'
      ? {
          speechPath: raw.speechPath || '/audio/speech',
          speechVoice: (raw.speechVoice || '').trim(),
          speechVoices: [...new Set(raw.speechVoices || [])],
          speechFormat: raw.speechFormat || 'mp3',
          speechInstructions: raw.speechInstructions === true,
        }
      : {}),
    ...(raw.kind === 'video'
      ? { voiceReference: raw.voiceReference || 'auto' }
      : {}),
  };
}
export function normalizeModelBase(value: string) {
  const u = publicHttps(value.trim());
  if (u.search || /^\/console(?:\/|$)/.test(u.pathname))
    throw Error('请填写 API 基础地址，不要填写控制台或令牌管理页面');
  u.pathname = u.pathname
    .replace(/\/+$/, '')
    .replace(
      /\/(?:chat\/completions|audio\/speech|images\/generations|contents\/generations\/tasks|video\/generations|videos|models)$/,
      '',
    );
  if (u.hostname === 'api.mmg.lat' && (u.pathname === '/' || !u.pathname))
    u.pathname = '/v1';
  return u.href.replace(/\/$/, '');
}
// Upgrade only the known legacy H3 configuration; preserve omission of voice references.
export function upgradeVideoConfig(c: ModelConfig): ModelConfig {
  if (
    c.kind === 'video' &&
    (c.protocol === 'heima-video' ||
      (['chat-video', 'heima-minimax'].includes(c.protocol) &&
        /^https:\/\/api\.mmg\.lat(?:\/|$)/i.test(c.baseUrl || ''))) &&
    ['minimax_h3', 'minimax_h3_no_audios'].includes(c.model)
  )
    return {
      ...c,
      protocol: 'heima-minimax',
      model: 'minimax_h3',
      ...(c.model.endsWith('_no_audios')
        ? { voiceReference: 'none' as const }
        : {}),
    };
  return c;
}
export type GenerationInput = {
  mediaUrls?: Record<string, string>;
  modelConfigId?: string;
  projectId: string;
  targetId: string;
  target: 'image' | 'video' | 'blockingImage' | 'asset';
  prompt: string;
  ratio: string;
  duration: number;
  referenceIds: string[];
  referenceBindings?: import('./video-request').VideoReferenceBinding[];
  voiceBindings?: import('./video-voice').VoiceBinding[];
  firstFrameId?: string;
  size: string;
  resolution: string;
};
export type GenerationJob = {
  diagnostics?: {
    at: string;
    phase: string;
    httpStatus: number;
    requestId: string;
    fields: string[];
    providerStatus: string;
    providerTaskId: string;
    contentType: string;
    hasVideoUrl: boolean;
  }[];
  id: string;
  projectId: string;
  targetId: string;
  target: GenerationInput['target'] | 'audio';
  lineId?: string;
  speechText?: string;
  status: string;
  createdAt: string;
  model: string;
  prompt: string;
  error?: string;
  referenceBindings?: import('./video-request').VideoReferenceBinding[];
  voiceBindings?: import('./video-voice').VoiceBinding[];
  videoSettings?: { ratio: string; duration: number; resolution: string };
  media?: import('./studio').Media;
};
export function videoBody(
  model: string,
  input: GenerationInput,
  refs: string[],
  first?: string,
  audios: string[] = [],
  generateAudio = false,
) {
  if (first && refs.length)
    throw Error('首帧模式和多参考图模式请分别提交，避免模型参数冲突');
  return {
    model,
    content: [
      { type: 'text', text: input.prompt },
      ...(first
        ? [
            {
              type: 'image_url',
              image_url: { url: first },
              role: 'first_frame',
            },
          ]
        : refs.map((url) => ({
            type: 'image_url',
            image_url: { url },
            role: 'reference_image',
          }))),
      ...audios.map((url) => ({
        type: 'audio_url',
        audio_url: { url },
        role: 'reference_audio',
      })),
    ],
    ...(generateAudio ? { generate_audio: true } : {}),
    ratio: input.ratio,
    duration: input.duration,
    resolution: input.resolution,
  };
}
