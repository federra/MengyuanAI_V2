import type { GenerationInput, ModelConfig } from './models';
export type VoiceMode = 'none' | 'text' | 'audio';
export type VoiceBinding = {
  speaker: string;
  roleId?: string;
  voiceId?: string;
  voiceName: string;
  description: string;
  scope: string;
  mediaId?: string;
  mediaType?: string;
};
// The transport must support the feature as well as the model.
// Ark contract: https://www.volcengine.com/docs/82379/1520757
export function voiceCapability(model?: ModelConfig): VoiceMode {
  if (!model || model.kind !== 'video') return 'none';
  if (
    /(?:no[_-]?audios?|without[_-]?audio|silent|mute)(?:$|[_-])/i.test(
      model.model,
    )
  )
    return 'none';
  if (model.voiceReference && model.voiceReference !== 'auto') {
    return model.voiceReference === 'audio' &&
      !['ark-video', 'heima-minimax'].includes(model.protocol)
      ? 'text'
      : model.voiceReference;
  }
  if (model.protocol === 'heima-minimax') return 'audio';
  if (
    model.protocol === 'ark-video' &&
    /seedance[-_.]2[-_.](?:0|5)(?:[-_.]|$)/i.test(model.model)
  )
    return 'audio';
  if (
    (model.protocol === 'ark-video' &&
      /seedance[-_.]1[-_.]5[-_.]pro/i.test(model.model)) ||
    (model.protocol === 'heima-video' &&
      /grok-imagine-video/i.test(model.model)) ||
    (model.protocol === 'chat-video' && /veo[-_.]?3/i.test(model.model))
  )
    return 'text';
  return 'none';
}
export function validateVoiceBindings(input: GenerationInput) {
  const rows = input.voiceBindings;
  if (rows === undefined) return;
  const str = (v: unknown, max: number) =>
    typeof v === 'string' && v.length <= max;
  if (
    input.target !== 'video' ||
    !Array.isArray(rows) ||
    rows.length > 240 ||
    rows.some(
      (b) =>
        !b ||
        !str(b.speaker, 150) ||
        !str(b.voiceName, 150) ||
        !b.voiceName.trim() ||
        !str(b.scope, 500) ||
        !str(b.description, 10000) ||
        ['roleId', 'voiceId', 'mediaId'].some(
          (k) =>
            b[k as keyof VoiceBinding] !== undefined &&
            !/^[\w-]{1,150}$/.test(String(b[k as keyof VoiceBinding])),
        ) ||
        (b.mediaType !== undefined && !str(b.mediaType, 100)),
    )
  )
    throw Error('人物与音色对应关系格式无效');
}
export function planVideoVoices(
  model: ModelConfig | undefined,
  input: Pick<
    GenerationInput,
    'voiceBindings' | 'referenceIds' | 'firstFrameId'
  >,
) {
  let mode = voiceCapability(model);
  const bound = input.voiceBindings || [];
  if (!bound.length)
    return {
      mode,
      bindings: [] as VoiceBinding[],
      samples: [] as { mediaId: string; label: string }[],
      note: '本分镜未绑定音色。',
      error: '',
    };
  if (mode === 'none')
    return {
      mode,
      bindings: [] as VoiceBinding[],
      samples: [] as { mediaId: string; label: string }[],
      note: '当前模型不支持或尚未确认音色能力，已自动省略音色参考；保留台词与说话人。',
      error: '',
    };
  const samples: { mediaId: string; label: string }[] = [];
  let note = '';
  if (
    mode === 'audio' &&
    model?.protocol !== 'heima-minimax' &&
    (!input.referenceIds.length || input.firstFrameId)
  ) {
    mode = 'text';
    note = '本次未使用多图参考模式，音色样本已省略，仅提交文字对应关系。';
  }
  if (mode === 'audio')
    for (const binding of bound) {
      if (
        !binding.mediaId ||
        ![
          'audio/mpeg',
          'audio/mp3',
          'audio/wav',
          'audio/x-wav',
          'audio/wave',
        ].includes(binding.mediaType || '')
      )
        continue;
      const label = `${binding.speaker} → ${binding.voiceName}（${binding.scope}）`;
      const old = samples.find((s) => s.mediaId === binding.mediaId);
      if (old) old.label += `；${label}`;
      else samples.push({ mediaId: binding.mediaId, label });
    }
  const max =
    model?.protocol === 'heima-minimax'
      ? 3
      : model && /seedance[-_.]2[-_.]5/i.test(model.model)
        ? 10
        : 3;
  const error =
    samples.length > max
      ? `当前音频参考协议最多支持${max}段音色样本，本次有${samples.length}段；请精简绑定或在模型设置中改为仅文字音色。`
      : '';
  note ||=
    mode === 'audio'
      ? `已组合${bound.length}条人物与音色关系、${samples.length}段音频样本。没有 MP3/WAV 样本的音色仅提交文字设定。`
      : '本次提交人物与音色的文字对应关系；当前接入不发送音频样本。';
  return { mode, bindings: bound, samples, note, error };
}
export function voicePrompt(plan: ReturnType<typeof planVideoVoices>) {
  if (!plan.bindings.length) return '';
  return `【人物与音色对应】\n${plan.bindings.map((b) => `${b.scope}｜说话人：${b.speaker}${b.roleId ? `（角色资产ID：${b.roleId}）` : ''} → 音色设定：${b.voiceName}${b.voiceId ? `（音色资产ID：${b.voiceId}）` : ''}\n音色描述：${b.description || '按已命名音色的文字特征参考'}${b.mediaId && plan.samples.some((s) => s.mediaId === b.mediaId) ? `；对应参考音频${plan.samples.findIndex((s) => s.mediaId === b.mediaId) + 1}` : '；本条仅文字参考，未附加音频样本'}`).join('\n')}\n台词单独指定的音色优先于角色默认音色。相同角色跨镜头保持音色一致，不混用其他角色音色。音频仅参考声线，不把样本内容当作本次台词。\n${plan.samples.length ? `【实际发送的音频对应表】\n${plan.samples.map((s, i) => `参考音频${i + 1}：${s.label}`).join('\n')}` : '本次没有发送音频文件，不代表声音克隆。'}`;
}
