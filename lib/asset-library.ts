import { type Asset, type Project, id } from './studio';
export const libraryKinds = [
  '人物',
  '场景',
  '道具',
  '服饰',
  '站位图',
  '风格',
  '声音',
];
export const kindLabels: Record<string, string> = {
  人物: '角色',
  风格: '风格模板',
  声音: '声音资产',
};
export type LibraryEntry = {
  asset: Asset;
  projectId: string;
  projectTitle: string;
  shotId?: string;
  references: string[];
};
export function libraryEntries(projects: Project[]): LibraryEntry[] {
  return projects.flatMap((p) => [
    ...p.assets.map((asset) => ({
      asset,
      projectId: p.id,
      projectTitle: p.title,
      references: p.shots
        .filter(
          (s) =>
            s.references.includes(asset.id) ||
            (asset.kind === '站位图' &&
              s.blockingImage?.id === asset.image?.id &&
              !!asset.image),
        )
        .map((s) => s.title),
    })),
    ...p.shots
      .filter(
        (s) =>
          s.blockingImage &&
          !p.assets.some(
            (a) => a.kind === '站位图' && a.image?.id === s.blockingImage?.id,
          ),
      )
      .map((s) => ({
        asset: {
          id: 'blocking-' + s.id,
          kind: '站位图',
          name: s.title + ' · 站位图',
          description: s.blockingPrompt || s.description,
          image: s.blockingImage,
        },
        projectId: p.id,
        projectTitle: p.title,
        shotId: s.id,
        references: [s.title],
      })),
  ]);
}
export function sharedLibraryEntries(projects: Project[]): LibraryEntry[] {
  return libraryEntries(projects).filter((e) => e.asset.inLibrary === true);
}
export function revisedAsset(
  before: Asset | undefined,
  next: Asset,
  now = new Date().toISOString(),
): Asset {
  if (!before)
    return { ...next, createdAt: next.createdAt || now, updatedAt: now };
  if (JSON.stringify(before) === JSON.stringify(next)) return next;
  const contentChanged = [
    'name',
    'description',
    'image',
    'audio',
    'video',
    'kind',
    'attributes',
  ].some(
    (k) =>
      JSON.stringify(before[k as keyof Asset]) !==
      JSON.stringify(next[k as keyof Asset]),
  );
  return {
    ...next,
    updatedAt: now,
    ...(contentChanged
      ? {
          versions: [
            ...(before.versions || []),
            {
              at: before.updatedAt || now,
              name: before.name,
              description: before.description,
              image: before.image,
              audio: before.audio,
              video: before.video,
            },
          ].slice(-10),
        }
      : {}),
  };
}
export function copyToProject(
  p: Project,
  e: LibraryEntry,
): { project: Project; asset: Asset } {
  if (e.projectId === p.id && !e.shotId) {
    const current = p.assets.find((a) => a.id === e.asset.id);
    if (!current) throw Error('资产已删除，请重新选择');
    return { project: p, asset: current };
  }
  const origin = e.projectId + ':' + e.asset.id;
  const existing = p.assets.find((a) => a.origin === origin);
  if (existing) return { project: p, asset: existing };
  if (p.assets.length >= 200) throw Error('当前项目资产已达200项');
  const asset = revisedAsset(undefined, {
    ...e.asset,
    inLibrary: false,
    id: id(),
    origin,
    versions: [],
    usage: [],
    usageCount: 0,
    createdAt: undefined,
    updatedAt: undefined,
  });
  return { project: { ...p, assets: [...p.assets, asset] }, asset };
}
export function applyLibraryAsset(
  p: Project,
  e: LibraryEntry,
  target: string,
  shotId?: string,
): Project {
  const copied = copyToProject(p, e);
  let next = copied.project;
  const a = copied.asset;
  if (target === '分镜') {
    if (!next.shots.some((s) => s.id === shotId)) throw Error('请选择目标镜头');
    if (a.kind === '站位图' && !a.image) throw Error('站位图尚未上传图片');
    next = {
      ...next,
      shots: next.shots.map((s) =>
        s.id === shotId
          ? {
              ...s,
              references: [...new Set([...s.references, a.id])],
              ...(a.kind === '站位图'
                ? { blockingImage: a.image, blockingPrompt: a.description }
                : {}),
              reviewRequired: '资产引用已更新，请检查提示词与素材',
            }
          : s,
      ),
    };
  } else if (target === '故事' || target === '剧本') {
    const key = target === '故事' ? 'story' : 'script';
    next = {
      ...next,
      [key]: next[key] + `\n\n【资产设定：${a.name}】\n${a.description}`,
    };
  } else if (target === '背景音乐') {
    if (!a.audio) throw Error('该资产没有音频');
    next = { ...next, bgm: a.audio };
  } else if (target === '设为项目风格') next = { ...next, style: a.name };
  else if (target === '常用')
    next = {
      ...next,
      assets: next.assets.map((x) =>
        x.id === a.id ? { ...x, favorite: !x.favorite } : x,
      ),
    };
  return {
    ...next,
    assets: next.assets.map((x) =>
      x.id === a.id
        ? {
            ...x,
            usageCount: (x.usageCount ?? x.usage?.length ?? 0) + 1,
            usage: [
              ...(x.usage || []),
              {
                at: new Date().toISOString(),
                target,
                detail:
                  target === '分镜'
                    ? next.shots.find((s) => s.id === shotId)!.title
                    : next.title,
              },
            ].slice(-100),
          }
        : x,
    ),
  };
}
export function duplicateGroups(entries: LibraryEntry[]) {
  const groups = new Map<string, LibraryEntry[]>();
  for (const e of entries) {
    const key =
      e.projectId +
      ':' +
      e.asset.kind +
      ':' +
      e.asset.name.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) || []), e]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}
