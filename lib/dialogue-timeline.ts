import { dialogueLines, parseAudioLines, type DialogueLine } from './dialogue';
import type { Project, Shot } from './studio';
export type DialogueCue = {
  line: DialogueLine;
  index: number;
  start: number;
  end: number;
  audioStart: number;
  estimated: boolean;
};
const stamp = /(\d+(?:\.\d+)?)\s*[—–-]\s*(\d+(?:\.\d+)?)\s*秒/;
export function dialogueCues(shot: Shot): DialogueCue[] {
  const duration = Math.max(
    0,
    Number.isFinite(shot.duration) ? shot.duration : 0,
  );
  const names = shot.character.split(/[、，,]/).filter(Boolean);
  const source: {
    text: string;
    speaker: string;
    start: number;
    end: number;
  }[] = [];
  let range: RegExpMatchArray | null = null;
  for (const raw of `${shot.description}\n${shot.dialogue}`.split(/\r?\n/)) {
    const line = raw.trim();
    if (/子镜头/.test(line)) range = line.match(stamp);
    const inline = /^\d.*秒[:：]/.test(line) ? line.match(stamp) : null;
    if (inline) range = inline;
    if (!range || (!/^声音[:：]/.test(line) && !inline)) continue;
    const parsed = parseAudioLines(line.replace(/^声音[:：]/, ''), names);
    const weight = parsed.reduce((n, p) => n + Math.max(1, p.text.length), 0);
    let offset = Number(range[1]);
    for (const p of parsed) {
      const end =
        offset +
        ((Number(range[2]) - Number(range[1])) * Math.max(1, p.text.length)) /
          weight;
      source.push({ text: p.text, speaker: p.speaker, start: offset, end });
      offset = end;
    }
  }
  const rows = dialogueLines(shot, names).flatMap((line) => {
    if (!line.text.trim()) return [];
    const timed = line.text.match(stamp);
    const wrapped =
      /^\s*\d.*秒[:：]/.test(line.text) ||
      /发出对白|\(\s*@role/.test(line.text);
    const parsed = wrapped
      ? parseAudioLines(line.text, [...names, line.speaker])
      : [line];
    const start = line.start ?? (timed ? Number(timed[1]) : undefined);
    const end = line.end ?? (timed ? Number(timed[2]) : undefined);
    return parsed.map((p, i) => ({
      ...line,
      ...p,
      id: parsed.length === 1 ? line.id : `${line.id}-${i}`,
      speaker: parsed.length > 1 ? p.speaker : line.speaker || p.speaker,
      voiceName: line.voiceName || p.voiceName,
      start:
        start !== undefined && end !== undefined
          ? start + ((end - start) * i) / parsed.length
          : start,
      end:
        start !== undefined && end !== undefined
          ? start + ((end - start) * (i + 1)) / parsed.length
          : end,
      audioStart:
        line.audioStart !== undefined &&
        start !== undefined &&
        end !== undefined
          ? line.audioStart + ((end - start) * i) / parsed.length
          : line.audioStart,
    }));
  });
  const used = new Set<number>();
  const ranges = rows.map((line) => {
    if (Number.isFinite(line.start) && Number.isFinite(line.end))
      return { start: line.start!, end: line.end!, estimated: false };
    const i = source.findIndex(
      (s, i) =>
        !used.has(i) &&
        s.text === line.text &&
        (!line.speaker || s.speaker === line.speaker),
    );
    if (i >= 0) {
      used.add(i);
      return { ...source[i], estimated: false };
    }
    return undefined;
  });
  let cursor = 0;
  return rows.map((line, index) => {
    let timing = ranges[index];
    if (!timing) {
      const next = ranges.findIndex((r, i) => i > index && !!r);
      const stop = next < 0 ? rows.length : next;
      const boundary =
        next < 0 ? duration : Math.min(duration, ranges[next]!.start);
      timing = {
        start: cursor,
        end: cursor + Math.max(0, boundary - cursor) / (stop - index),
        estimated: true,
      };
    }
    const start = Math.min(duration, Math.max(cursor, 0, timing.start));
    const end = Math.min(duration, Math.max(start, timing.end));
    cursor = end;
    return {
      line,
      index,
      start,
      end,
      audioStart: Math.max(0, line.audioStart ?? (line.audio ? 0 : start)),
      estimated: timing.estimated,
    };
  });
}
export function setCueTime(
  shot: Shot,
  index: number,
  field: 'start' | 'end' | 'audioStart',
  value: number,
) {
  const cues = dialogueCues(shot);
  if (!Number.isFinite(value) || !cues[index]) return shot.lines || [];
  const cue = cues[index];
  const previous = cues[index - 1]?.end || 0;
  const next = cues[index + 1]?.start ?? shot.duration;
  if (field === 'start')
    cue.start = Math.min(cue.end, Math.max(previous, value));
  if (field === 'end')
    cue.end = Math.min(shot.duration, next, Math.max(cue.start, value));
  if (field === 'audioStart')
    cue.audioStart = Math.min(86400, Math.max(0, value));
  return cues.map((c) => ({
    ...c.line,
    start: c.start,
    end: c.end,
    audioStart: c.audioStart,
  }));
}
export function cueSubtitle(project: Project) {
  let offset = 0,
    count = 0;
  const fmt = (seconds: number) => {
    const ms = Math.round(seconds * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  };
  return project.shots
    .filter((s) => s.enabled)
    .flatMap((shot) => {
      const captions = dialogueCues(shot)
        .filter((c) => c.end > c.start)
        .map(
          (c) =>
            `${++count}\n${fmt(offset + c.start)} --> ${fmt(offset + c.end)}\n${c.line.text}\n`,
        );
      offset += shot.duration;
      return captions;
    })
    .join('\n');
}
