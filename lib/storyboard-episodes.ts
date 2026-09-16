import { type Asset, id } from './studio';
import { parseAudioLines, dialogueText, type DialogueLine } from './dialogue';

type RecordValue = Record<string, unknown>;
function object(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(`${label}必须为对象`);
  return value as RecordValue;
}
function text(value: unknown, label: string, max = 10000): string {
  if (typeof value !== 'string' || value.length > max)
    throw Error(`${label}必须为文本（最多${max}字）`);
  return value;
}
function strings(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200)
    throw Error(`${label}必须为数组（最多200项）`);
  return value.map((v) => text(v, label, 150));
}

// Source references describe provenance, not asset IDs; retain structured references.
function references(value: unknown, label: string): string[] {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  if (values.length > 200) throw Error(`${label}最多200项`);
  const result = values.map((entry, index) => {
    if (typeof entry === 'string')
      return text(entry, `${label}第${index + 1}项`, 10000);
    if (typeof entry === 'number' && Number.isFinite(entry))
      return String(entry);
    if (entry && typeof entry === 'object' && !Array.isArray(entry))
      return text(JSON.stringify(entry), `${label}第${index + 1}项`, 10000);
    throw Error(`${label}第${index + 1}项需要文本、编号或来源对象`);
  });
  if (result.join('、').length > 10000)
    throw Error(`${label}合计超过10000字，请精简来源引用`);
  return result;
}

// One episode is one generated video. Its shots form an internal timeline,
// and must never be flattened into separate workbench storyboard rows.
export function normalizeEpisodes(root: RecordValue) {
  if (!Array.isArray(root.episodes) || !root.episodes.length)
    throw Error('episodes 必须为非空视频段数组');
  if (root.episodes.length > 200)
    throw Error(
      `共有${root.episodes.length}个视频段，超过200个分镜限制；子镜头不计入此限制。`,
    );
  const assets: Asset[] = [];
  const bySourceId = new Map<string, Asset>();
  for (const [key, prefix, kind] of [
    ['missing_roles', 'role', '人物'],
    ['missing_scenes', 'scene', '场景'],
    ['missing_props', 'prop', '道具'],
  ]) {
    const entries = root[key];
    if (entries === undefined) continue;
    if (!Array.isArray(entries) || entries.length > 200)
      throw Error(`${key}必须为数组（最多200项）`);
    entries.forEach((value, index) => {
      const label = `${key}第${index + 1}项`;
      const entry = object(value, label);
      const sourceId = text(entry[`${prefix}_id`], `${label} ID`, 150).trim();
      const name = text(entry[`${prefix}_name`], `${label}名称`, 150).trim();
      if (!sourceId || !name || bySourceId.has(sourceId))
        throw Error(`${label}名称或ID为空，或ID重复`);
      const description = [
        text(entry.description ?? '', `${label}描述`),
        ...['visual_style', 'mobility', 'first_scene']
          .filter((k) => entry[k] !== undefined)
          .map((k) => `${k}：${text(entry[k], `${label} ${k}`)}`),
      ]
        .filter(Boolean)
        .join('\n');
      if (description.length > 10000)
        throw Error(`${label}描述合计超过10000字`);
      const asset = { id: id(), kind, name, description, inLibrary: false };
      bySourceId.set(sourceId, asset);
      if (!assets.some((a) => a.kind === kind && a.name === name))
        assets.push(asset);
    });
  }
  if (assets.length > 200) throw Error('导入资产合计超过200项');
  const videoIds = new Set<string>();
  let subshotCount = 0;
  const rows = root.episodes.map((value, i) => {
    const label = `第${i + 1}个视频段`;
    const episode = object(value, label);
    const videoId = text(episode.video_id, `${label} video_id`, 150).trim();
    if (!videoId || videoIds.has(videoId))
      throw Error(`${label} video_id 为空或重复`);
    videoIds.add(videoId);
    const duration = episode.total_duration;
    if (
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration < 0.1 ||
      duration > 120
    )
      throw Error(`${label} total_duration 必须为0.1至120秒的数字`);
    if (
      !Array.isArray(episode.shots) ||
      !episode.shots.length ||
      episode.shots.length > 1000
    )
      throw Error(`${label}需要1至1000个内部子镜头`);
    const scene = text(episode.scene_name ?? '', `${label}场景`, 150);
    const characters = strings(episode.characters, `${label} characters`);
    const sourceRefs = references(episode.source_refs, `${label} source_refs`);
    const assetNames: { kind: string; name: string }[] = [];
    const addName = (kind: string, name: string) => {
      if (
        name.trim() &&
        !assetNames.some((a) => a.kind === kind && a.name === name.trim())
      )
        assetNames.push({ kind, name: name.trim() });
    };
    characters.forEach((name) => addName('人物', name));
    addName('场景', scene);
    for (const key of ['role_ids', 'scene_ids', 'prop_ids']) {
      strings(episode[key], `${label} ${key}`).forEach((sourceId) => {
        const asset = bySourceId.get(sourceId);
        if (asset) addName(asset.kind, asset.name);
      });
    }
    let end = 0;
    const shotIds = new Set<string>();
    const lines: DialogueLine[] = [];
    const cameras: string[] = [];
    const timeline = episode.shots
      .map((value, j) => {
        const sublabel = `${label}第${j + 1}个子镜头`;
        const shot = object(value, sublabel);
        const shotId = text(shot.shot_id, `${sublabel} shot_id`, 150);
        if (!shotId.trim() || shotIds.has(shotId))
          throw Error(`${sublabel} shot_id 为空或重复`);
        shotIds.add(shotId);
        const start = shot.time_start,
          finish = shot.time_end;
        if (
          typeof start !== 'number' ||
          typeof finish !== 'number' ||
          !Number.isFinite(start) ||
          !Number.isFinite(finish) ||
          start < 0 ||
          finish <= start ||
          finish > duration + 0.000001 ||
          Math.abs(start - end) > 0.000001
        )
          throw Error(
            `${sublabel}时间不连续、重叠或超出${duration}秒；请检查 time_start / time_end。`,
          );
        end = finish;
        const camera = text(shot.camera, `${sublabel}运镜`);
        const visual = text(shot.visual, `${sublabel}画面`);
        const sound = text(shot.audio ?? '', `${sublabel}声音`);
        const referencedIds = new Set(
          (visual + '\n' + sound).match(/@[A-Za-z0-9_]+/g) ?? [],
        );
        for (const [sourceId, asset] of bySourceId) {
          if (referencedIds.has(sourceId)) addName(asset.kind, asset.name);
        }
        const stamp = `${start}—${finish}秒`;
        const spoken = parseAudioLines(sound, characters);
        spoken.forEach((line, k) =>
          lines.push({
            ...line,
            start: start + ((finish - start) * k) / spoken.length,
            end: start + ((finish - start) * (k + 1)) / spoken.length,
          }),
        );
        cameras.push(`${stamp}：${camera}`);
        return `${stamp} · 子镜头${shotId}\n运镜：${camera}\n画面：${visual}\n声音：${sound}`;
      })
      .join('\n\n');
    if (Math.abs(end - duration) > 0.000001)
      throw Error(
        `${label}子镜头结束于${end}秒，与总时长${duration}秒不一致。`,
      );
    subshotCount += episode.shots.length;
    const source = `原视频段：${videoId}${sourceRefs.length ? `\n来源：${sourceRefs.join('、')}` : ''}`;
    const generationPrompt = text(
      episode.generation_prompt ?? '',
      `${label} generation_prompt`,
    );
    return {
      title: `分镜${videoId} · ${scene || '未命名场景'}`,
      description: `${source}\n\n${timeline}`,
      duration,
      scene,
      character: characters.join('、'),
      camera: cameras.join('\n'),
      size: '按子镜头',
      dialogue: dialogueText(lines),
      lines,
      assetNames,
      prompt: generationPrompt
        ? `${generationPrompt}\n\n完整子镜头时间轴：\n${timeline}`
        : `视频时长：${duration}秒\n场景：${scene}\n角色：${characters.join('、')}\n\n${timeline}`,
    };
  });
  return { rows, assets, subshotCount };
}
