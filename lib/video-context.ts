import {
  videoDialogue,
  videoTimeline,
  videoSoundEffects,
} from './video-performance';
import type { VoiceBinding } from './video-voice';
import { dialogueLines } from './dialogue';
import type { Asset, Media, Project, Shot } from './studio';
import { videoDimensions, type VideoReferenceBinding } from './video-request';

const visualKinds = ['人物', '场景', '道具', '服饰', '站位图', '风格'];
const purposes: Record<string, string> = {
  人物: '角色身份、面部、体型与外观',
  场景: '空间布局、固定陈设与光照',
  道具: '物品形态、材质与交互状态',
  服饰: '服装款式、颜色与穿着归属',
  站位图: '人物位置、朝向、距离与机位',
  风格: '统一视觉风格',
};
export function videoAssets(project: Project, shot: Shot) {
  const bound = new Set(shot.references);
  // An explicitly selected speaker also contributes its unique project role.
  for (const line of dialogueLines(
    shot,
    project.assets.filter((a) => a.kind === '人物').map((a) => a.name),
  )) {
    const matches = project.assets.filter(
      (a) => a.kind === '人物' && a.name === line.speaker,
    );
    if (matches.length === 1) bound.add(matches[0].id);
  }
  return project.assets.filter((a) => bound.has(a.id));
}
function assetLabel(asset: Asset) {
  return `${asset.kind === '人物' ? '角色' : asset.kind}/${asset.name}（资产ID：${asset.id}）`;
}
export type VideoReference = VideoReferenceBinding & {
  media: Media;
  summary: string;
};
export function videoReferences(
  project: Project,
  shot: Shot,
): VideoReference[] {
  const result: VideoReference[] = [];
  const add = (media: Media | undefined, label: string, summary: string) => {
    if (!media) return;
    const previous = result.find((r) => r.mediaId === media.id);
    if (previous) {
      previous.label += `；另用于${label}`;
      previous.summary += ` / ${summary}`;
    } else result.push({ mediaId: media.id, media, label, summary });
  };
  const assets = videoAssets(project, shot);
  for (const kind of visualKinds)
    for (const asset of assets.filter((a) => a.kind === kind)) {
      add(
        asset.image || asset.referenceImage,
        `${assetLabel(asset)}；用途：${purposes[kind]}${kind === '服饰' ? `；所属角色：${asset.attributes?.所属角色 || '未标注，按正文明确关系使用，不擅自分配'}` : ''}`,
        `${asset.kind === '人物' ? '角色' : asset.kind} · ${asset.name}`,
      );
    }
  add(
    shot.blockingImage,
    `本分镜/${shot.title} 的站位图；用途：人物站位、朝向、道具位置与摄像机视角`,
    `站位图 · ${shot.title}`,
  );
  add(
    shot.image,
    `本分镜/${shot.title} 的镜头画面；用途：构图、动作与光照参考`,
    `镜头画面 · ${shot.title}`,
  );
  add(
    shot.firstFrame,
    `本分镜/${shot.title} 的自定义首帧；用途：起始构图参考（多参考图模式下不等于强制首帧参数）`,
    `首帧构图参考 · ${shot.title}`,
  );
  return result;
}
export function composeVideoContext(
  project: Project,
  shot: Shot,
  text: string,
  settings: { ratio: string; resolution: string; duration: number },
) {
  const assets = videoAssets(project, shot);
  const lines = videoDialogue(
    shot,
    project.assets.filter((a) => a.kind === '人物').map((a) => a.name),
  );
  if (!lines.length && /(?:发出对白|对白|台词)\s*[:：]?[^\n]*[“"「]/.test(text))
    throw Error(
      '台词栏为空，但分镜正文仍包含对白。请先核对原剧本台词，避免漏词或擅自补写。',
    );
  const performance = lines
    .filter((l) => l.text.trim())
    .map((line, index) => {
      const roles = assets.filter(
        (a) => a.kind === '人物' && a.name === line.speaker,
      );
      const role = roles.length === 1 ? roles[0] : undefined;
      return `${index + 1}. ${line.kind}｜说话人：${line.speaker || '未指定（不得擅自归属）'}${role ? `（角色资产ID：${role.id}）` : ''}${line.time ? '｜时间：' + line.time : ''}｜情绪：${line.emotion || '自然'}\n原台词：${JSON.stringify(line.text)}`;
    })
    .join('\n');
  return [
    `【制作设置】\n项目：${project.title}；视频类型：${project.videoType || '按镜头内容'}；风格：${project.style}；画幅：${settings.ratio}；分辨率：${settings.resolution}（目标尺寸${videoDimensions(settings.ratio, settings.resolution)}）；时长：${settings.duration}秒。以本节及请求参数为准，旧正文中的冲突尺寸与时长不作为制作参数。`,
    `【当前分镜】\n${shot.title}（分镜ID：${shot.id}）\n场景：${shot.scene || '按正文'}；人物：${shot.character || '按已绑定角色与正文'}${/秒\s*[·•]\s*子镜头/.test(text) ? '' : `；景别：${shot.size}；运镜：${shot.camera}`}。\n${videoTimeline(text)}`,
    `【角色、场景、道具与服装设定】\n${
      assets
        .filter((a) => a.kind !== '声音')
        .map((a) => {
          const attributes = Object.fromEntries(
            Object.entries(a.attributes || {}).filter(
              ([k]) => !/声音资产|音色|声线/.test(k),
            ),
          );
          return `${assetLabel(a)}\n${a.description}${Object.keys(attributes).length ? `\n属性与归属：${JSON.stringify(attributes)}` : ''}`;
        })
        .join('\n\n') || '未绑定资产，不虚构已提供的资产图。'
    }`,
    `【台词与说话人对应】\n${performance || '本分镜无已填写台词，不额外编造对白。'}\n本清单为唯一可发声台词。逐字、按原顺序说出，每条仅说一次；不得增删、改写、补词或交换说话人。不朗读时间、情绪、音效和其他制作说明。旁白及画外音不让画内角色对口型。`,
    `【同期音效】\n${videoSoundEffects(text, shot.dialogue) || '仅保留与画面动作一致的必要同期声，不新增音乐。'}`,
    shot.blockingImage
      ? `【站位约束】\n参照本分镜站位图确定人物左右位置、朝向、彼此距离和关键道具位置；运动过程只按当前时间轴推进。不把站位图中的文字或绘图标注带入视频。`
      : '',
    '【连续性】\n按实际图片编号与图片对应表识别同一角色，按服装所属角色与剧情时刻穿着，不交换人物、台词、道具或衣着。不增加无关人物。资产设定中的后续服装、发型和剧情不提前演出，只使用当前分镜时刻的状态。未提供图片的资产仅依据文字设定。',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function videoVoiceBindings(
  project: Project,
  shot: Shot,
): VoiceBinding[] {
  const roles = videoAssets(project, shot).filter((a) => a.kind === '人物');
  const voices = project.assets.filter((a) => a.kind === '声音');
  const result: VoiceBinding[] = [];
  const add = (
    speaker: string,
    roleId: string | undefined,
    voice: Asset | undefined,
    name: string,
    scope: string,
  ) => {
    if (!voice && !name) return;
    result.push({
      speaker,
      roleId,
      voiceId: voice?.id,
      voiceName: voice?.name || name,
      description: voice?.description || '',
      scope,
      ...(voice?.audio
        ? { mediaId: voice.audio.id, mediaType: voice.audio.type }
        : {}),
    });
  };
  for (const role of roles) {
    const voice = voices.find((a) => a.id === role.attributes?.声音资产);
    if (voice) add(role.name, role.id, voice, voice.name, '角色默认音色');
  }
  for (const [i, line] of videoDialogue(
    shot,
    roles.map((a) => a.name),
  )
    .filter((l) => l.text.trim())
    .entries()) {
    if (!line.text.trim() || !line.voiceName) continue;
    const voiceMatches = voices.filter((a) => a.name === line.voiceName);
    const roleMatches = roles.filter((a) => a.name === line.speaker);
    add(
      line.speaker || '未指定说话人',
      roleMatches.length === 1 ? roleMatches[0].id : undefined,
      voiceMatches.length === 1 ? voiceMatches[0] : undefined,
      line.voiceName,
      `台词第${i + 1}条（优先于角色默认）`,
    );
  }
  return result;
}
