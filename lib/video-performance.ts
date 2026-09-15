import { dialogueLines, parseAudioLines } from './dialogue';
import type { Shot } from './studio';

const timePrefix = /^\s*(\d+(?:\.\d+)?\s*[—–-]\s*\d+(?:\.\d+)?\s*秒)\s*[:：]?/;
export function videoDialogue(shot: Shot, speakers: string[]) {
  return dialogueLines(shot, speakers).flatMap((line) => {
    if (!line.text.trim()) return [];
    // Only unwrap legacy direction containers. Plain dialogue is copied verbatim,
    // including punctuation, quotations and intentionally repeated sentences.
    const wrapped =
      timePrefix.test(line.text) ||
      /发出对白|\(\s*@role|（\s*@role/.test(line.text);
    const parsed = wrapped
      ? parseAudioLines(line.text.replaceAll('\\_', '_'), [
          ...speakers,
          line.speaker,
        ])
      : [line];
    if (wrapped && parsed.some((p) => !p.speaker && p.kind === '台词'))
      throw Error(
        '台词包含未能确认说话人的表演说明，请在台词栏分开填写角色、台词和音效后提交。',
      );
    return parsed.map((p) => ({
      ...p,
      speaker: parsed.length === 1 && line.speaker ? line.speaker : p.speaker,
      voiceName: line.voiceName || p.voiceName,
      emotion:
        wrapped && line.emotion === '平静'
          ? p.emotion
          : line.emotion || p.emotion,
      time:
        Number.isFinite(line.start) && Number.isFinite(line.end)
          ? `${Math.min(shot.duration, Math.max(0, line.start!))}—${Math.min(shot.duration, Math.max(line.start!, line.end!))}秒`
          : wrapped
            ? line.text.match(timePrefix)?.[1] || ''
            : '',
    }));
  });
}

export function videoTimeline(text: string) {
  const normalized = text.replace(/\r\n/g, '\n');
  const headers = [
    ...normalized.matchAll(
      /^\s*\d+(?:\.\d+)?\s*[—–-]\s*\d+(?:\.\d+)?\s*秒\s*[·•]\s*子镜头[^\n]*/gm,
    ),
  ];
  const seen = new Map<string, string>();
  const blocks: string[] = [];
  const clean = (s: string) =>
    s
      .split('\n')
      .filter(
        (line) =>
          !/^\s*(?:声音|对白|台词|旁白|音效|环境音|环境声|背景音乐|BGM|音乐|原视频段|视频时长|场景|角色|完整子镜头时间轴)\s*[:：]/i.test(
            line,
          ),
      )
      .join('\n')
      .trim();
  if (headers.length) {
    const intro = clean(normalized.slice(0, headers[0].index));
    if (intro) blocks.push(intro);
    headers.forEach((h, i) => {
      const key = h[0].trim().replaceAll(' ', '');
      const block = clean(
        normalized.slice(h.index, headers[i + 1]?.index ?? normalized.length),
      );
      const previous = seen.get(key);
      if (previous && previous !== block)
        throw Error(
          '同一子镜头存在两份不一致的描述，请核对分镜描述与提示词后提交。',
        );
      if (!previous) {
        seen.set(key, block);
        blocks.push(block);
      }
    });
    return blocks.join('\n\n');
  }
  return clean(normalized);
}

export function videoSoundEffects(...texts: string[]) {
  const sounds = new Set<string>();
  for (const text of texts) {
    let time = '';
    for (const line of text.split(/\r?\n/)) {
      time = line.match(timePrefix)?.[1] || time;
      const sound = line.match(/(?:音效|环境音|环境声)\s*[:：](.*)/)?.[1];
      if (!sound) continue;
      const clean = sound
        .split(/[；;]/)
        .filter((s) => !/背景音乐|BGM|配乐|音乐/i.test(s))
        .join('；')
        .trim();
      if (clean) sounds.add(`${time ? time + '：' : ''}${clean}`);
    }
  }
  return [...sounds].join('\n');
}
