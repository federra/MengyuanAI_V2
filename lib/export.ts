import { dialogueCues } from './dialogue-timeline';
import { type Project, subtitle } from './studio';
export async function exportJianyingDraft(project: Project) {
  if (!window.directorDesktop?.exportJianying)
    throw Error('请使用桌面版导出剪映草稿');
  const cues = project.shots
    .filter((s) => s.enabled)
    .flatMap((s) =>
      dialogueCues(s)
        .filter((c) => c.end > c.start)
        .map((c) => ({
          shotId: s.id,
          text: c.line.text,
          start: c.start,
          end: c.end,
          audio: c.line.audio,
          audioStart: c.audioStart,
        })),
    );
  return window.directorDesktop.exportJianying({
    project,
    cues,
    srt: subtitle(project),
  });
}
export function download(
  name: string,
  data: BlobPart,
  type = 'application/json',
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function zip(entries: { name: string; data: Uint8Array }[]) {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of entries) {
    const name = enc.encode(f.name);
    let crc = 0xffffffff;
    for (const b of f.data) {
      crc ^= b;
      for (let k = 0; k < 8; k++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const head = new Uint8Array(30 + name.length);
    const h = new DataView(head.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, f.data.length, true);
    h.setUint32(22, f.data.length, true);
    h.setUint16(26, name.length, true);
    head.set(name, 30);
    parts.push(head, f.data);
    const c = new Uint8Array(46 + name.length);
    const d = new DataView(c.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, f.data.length, true);
    d.setUint32(24, f.data.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    c.set(name, 46);
    central.push(c);
    offset += head.length + f.data.length;
  }
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(
    12,
    central.reduce((a, c) => a + c.length, 0),
    true,
  );
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end] as BlobPart[], {
    type: 'application/zip',
  });
}
export async function exportKit(p: Project) {
  const enc = new TextEncoder();
  const copy = structuredClone(p);
  const media = new Map<string, string>();
  const entries: { name: string; data: Uint8Array }[] = [];
  let bytes = 0;
  const gather = async (m?: { id: string; url: string; type: string }) => {
    if (!m) return;
    const existing = media.get(m.id);
    if (existing) {
      m.url = existing;
      return;
    }
    const res = await fetch(m.url);
    if (!res.ok) throw Error('有素材无法下载，请检查后重新导出');
    const data = new Uint8Array(await res.arrayBuffer());
    bytes += data.length;
    if (bytes > 180 * 1024 * 1024) throw Error('剪辑包超过180MB，请分集导出');
    const ext: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/mp4': 'm4a',
      'audio/ogg': 'ogg',
      'audio/webm': 'webm',
    };
    const name = `media/${m.id}.${ext[m.type] || 'bin'}`;
    media.set(m.id, name);
    m.url = name;
    entries.push({ name, data });
  };
  for (const s of copy.shots) {
    for (const line of s.lines || []) await gather(line.audio);
    Object.assign(s, {
      dialogueTimeline: dialogueCues(s)
        .filter((c) => c.end > c.start)
        .map((c) => ({
          start: c.start,
          end: c.end,
          audioStart: c.audioStart,
          text: c.line.text,
          speaker: c.line.speaker,
          audio: c.line.audio,
        })),
    });
    await gather(s.video);
    await gather(s.image);
    await gather(s.blockingImage);
    await gather(s.firstFrame);
    await gather(s.audio);
  }
  for (const a of copy.assets) {
    await gather(a.image);
    await gather(a.referenceImage);
    await gather(a.audio);
    await gather(a.video);
  }
  await gather(copy.bgm);
  const render = await fetch('/render.py');
  if (!render.ok) throw Error('渲染工具暂不可用');
  entries.push(
    { name: 'project.json', data: enc.encode(JSON.stringify(copy, null, 2)) },
    { name: 'subtitles.srt', data: enc.encode(subtitle(p)) },
    { name: 'render.py', data: enc.encode(await render.text()) },
    {
      name: 'README.txt',
      data: enc.encode(
        'AI短片导演工作台 — 剪辑包\n\n1. 解压全部文件。\n2. 安装 Python 3.10+ 和 FFmpeg，并加入 PATH。\n3. 在此目录运行 python render.py。\n4. 成片输出为 output.mp4，字幕为 subtitles.srt（独立字幕，不烧录）。\n\n需要每个启用镜头提供视频或图片。没有画面的镜头会明确报错。配音按台词时间段裁切并对齐，替换该镜头原声；BGM以20%音量混合。素材包含在media目录，无需网络。\n如需剪映原生草稿，请在桌面版导出窗口选择“导出到剪映草稿”。',
      ),
    },
  );
  download(
    `${p.title.replace(/[\\/:*?"<>|]/g, '_')}-剪辑包.zip`,
    zip(entries),
    'application/zip',
  );
}
