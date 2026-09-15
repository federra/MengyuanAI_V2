import { id, type Shot } from './studio';
export type DialogueLine = {
  audio?: import('./studio').Media;
  speechPendingId?: string;
  speechGenerationId?: string;
  speechVoiceId?: string;
  speechModelId?: string;
  start?: number;
  end?: number;
  audioStart?: number;
  id: string;
  kind: '台词' | '旁白';
  speaker: string;
  emotion: string;
  text: string;
  voiceName: string;
};
export function newLine(): DialogueLine {
  return {
    id: id(),
    kind: '台词',
    speaker: '',
    emotion: '平静',
    text: '',
    voiceName: '',
  };
}
export function dialogueText(lines: DialogueLine[]) {
  return lines.map((l) => l.text).join('\n');
}
export function dialogueLines(
  s: Shot,
  speakers: string[] = [],
): DialogueLine[] {
  if (s.lines && dialogueText(s.lines) === s.dialogue) return s.lines;
  if (!s.dialogue) return [];
  return parseAudioLines(s.dialogue, [
    ...s.character.split(/[、,，]/),
    ...speakers,
  ]).map((line, i) => ({
    ...line,
    id: `legacy-${s.id}-${i}`,
  }));
}

// Recognize explicit speakers only. Sound effects stay in the original timeline;
// an ambiguous sentence must never be attributed to every character in the shot.
export function parseAudioLines(
  audio: string,
  speakers: string[],
): DialogueLine[] {
  const names = [
    ...new Set([
      ...speakers.map((s) => s.trim()).filter(Boolean),
      '旁白',
      '画外音',
    ]),
  ].sort((a, b) => b.length - a.length);
  const parts: string[] = [];
  let part = '',
    quote = '';
  for (let i = 0; i < audio.length; i++) {
    const c = audio[i];
    if (
      !quote &&
      /[”」"]\s*$/.test(part) &&
      names.some(
        (name) =>
          audio.slice(i).startsWith(name) &&
          /^[\s(:：（【“"「]/.test(audio.slice(i + name.length)),
      )
    ) {
      parts.push(part);
      part = '';
    }
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '“' || c === '「' || c === '"')
      quote = c === '“' ? '”' : c === '「' ? '」' : '"';
    if (!quote && /[；;\n]/.test(c)) {
      parts.push(part);
      part = '';
    } else part += c;
  }
  if (part) parts.push(part);
  const result: DialogueLine[] = [];
  for (const raw of parts) {
    const clean = raw
      .trim()
      .replace(/^\d+(?:\.\d+)?\s*[—–-]\s*\d+(?:\.\d+)?\s*秒\s*[:：]?\s*/, '')
      .trim();
    if (!clean) continue;
    if (
      /^(?:音效|环境音|环境声|背景音乐|BGM|静音|无对白|无台词|音乐|声音效果)\s*[:：，,。]|^(?:脚步声|风声|鸟鸣|窗外鸟鸣|画笔摩擦|笔帽轻响|衣料摩擦|开门声)/i.test(
        clean,
      )
    )
      continue;
    const source = clean.replace(/^(?:台词|对白)\s*[:：]\s*/, '');
    const speaker =
      names.find(
        (name) =>
          source.startsWith(name) &&
          /^[\s(:：（【“"「]/.test(source.slice(name.length)),
      ) || '';
    const metadata = speaker ? source.slice(speaker.length) : '';
    let body = metadata.trim();
    // Only remove leading direction/voice labels, never parentheses or quotations inside dialogue.
    const prefix =
      /^(?:\([^()]*\)|（[^（）]*）|【[^】]*】|发出对白|对白|台词|[:：])\s*/;
    while (speaker && prefix.test(body)) body = body.replace(prefix, '');
    const beforeText = metadata.slice(0, metadata.length - body.length);
    const emotion =
      beforeText.match(/【([^】]+)】/)?.[1] ||
      beforeText.match(/[（(](?!\s*@|音色|声线)([^()（）]{1,40})[)）]/)?.[1] ||
      '平静';
    const endQuote = (
      { '“': '”', '「': '」', '"': '"' } as Record<string, string>
    )[body[0]];
    const spoken = speaker
      ? endQuote && body.endsWith(endQuote)
        ? body.slice(1, -1)
        : body
      : clean;
    if (!spoken) continue;
    result.push({
      ...newLine(),
      kind: /旁白|画外音|内心|心声/.test(speaker + beforeText)
        ? '旁白'
        : '台词',
      speaker: ['旁白', '画外音'].includes(speaker) ? '' : speaker,
      emotion,
      text: spoken,
    });
  }
  // Preserve unusually large legacy text for manual editing rather than truncating it.
  return result.length > 40 ? [{ ...newLine(), text: audio }] : result;
}
export function parseLines(value: unknown): DialogueLine[] {
  if (!Array.isArray(value) || value.length > 40)
    throw Error('每镜最多40条台词');
  const lines = value.map((l) => {
    if (!l || !['台词', '旁白'].includes(l.kind)) throw Error('台词类型不正确');
    for (const key of ['speaker', 'emotion', 'text', 'voiceName'])
      if (
        typeof l[key] !== 'string' ||
        l[key].length > (key === 'text' ? 10000 : 150)
      )
        throw Error('台词字段格式错误');
    for (const key of ['start', 'end', 'audioStart'])
      if (
        l[key] !== undefined &&
        (typeof l[key] !== 'number' ||
          !Number.isFinite(l[key]) ||
          l[key] < 0 ||
          l[key] > 86400)
      )
        throw Error('台词时间无效');
    return {
      ...newLine(),
      ...(l.start !== undefined ? { start: l.start } : {}),
      ...(l.end !== undefined ? { end: l.end } : {}),
      ...(l.audioStart !== undefined ? { audioStart: l.audioStart } : {}),
      kind: l.kind as '台词' | '旁白',
      speaker: l.speaker,
      emotion: l.emotion,
      text: l.text,
      voiceName: l.voiceName,
    };
  });
  if (dialogueText(lines).length > 10000) throw Error('镜头总台词最多10000字');
  return lines;
}
