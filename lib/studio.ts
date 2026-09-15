import type { Skill, ChangeRecord } from './director';
import type { DialogueLine } from './dialogue';
export const stages = [
  '创意',
  '故事',
  '剧本',
  '分镜',
  '资产',
  '视频',
  '配音',
  '剪辑',
] as const;
export type Stage = (typeof stages)[number] | '分场';
export type Media = { id: string; name: string; type: string; url: string };
export type Asset = {
  imageSkillId?: string;
  inLibrary?: boolean;
  referenceImage?: Media;
  usageCount?: number;
  tags?: string[];
  favorite?: boolean;
  status?: '待完善' | '已完成' | '待复核';
  createdAt?: string;
  updatedAt?: string;
  origin?: string;
  attributes?: Record<string, string>;
  usage?: { at: string; target: string; detail: string }[];
  versions?: {
    at: string;
    name: string;
    description: string;
    image?: Media;
    audio?: Media;
    video?: Media;
  }[];
  id: string;
  kind: string;
  name: string;
  description: string;
  image?: Media;
  audio?: Media;
  video?: Media;
  evidence?: string;
  suggestedDescription?: string;
};
export type Shot = {
  videoModelId?: string;
  doubaoGroup?: string;
  doubaoModel?: string;
  doubaoRatio?: string;
  firstFrame?: Media;
  firstFrameSource?: { shotId: string; videoId: string; time: number };
  blockingPrompt?: string;
  blockingSkillId?: string;
  videoGenerationId?: string;
  videoPendingJobId?: string;
  videoManualUpdatedAt?: string;
  blockingGenerationId?: string;
  blockingPendingJobId?: string;
  blockingImage?: Media;
  lines?: DialogueLine[];
  assetNames?: { kind: string; name: string }[];
  reviewRequired?: string;
  id: string;
  title: string;
  description: string;
  scene: string;
  character: string;
  dialogue: string;
  duration: number;
  size: string;
  camera: string;
  prompt: string;
  references: string[];
  image?: Media;
  video?: Media;
  audio?: Media;
  trimStart: number;
  enabled: boolean;
};
export type Project = {
  assetImageSkillIds?: Record<string, string>;
  videoType?: string;
  scriptSkillId?: string;
  shotSkillId?: string;
  creativeSkillId?: string;
  storySkillId?: string;
  storyVersionCount?: number;
  storyPlans?: {
    id: string;
    title: string;
    summary: string;
    content: string;
    tags: string[];
  }[];
  selectedStoryId?: string;
  assetScript?: string;
  assetMode?: 'model' | 'labels';
  skills?: Skill[];
  favoriteSkillIds?: string[];
  changeLog?: ChangeRecord[];
  id: string;
  title: string;
  brief: string;
  story: string;
  script: string;
  scenes: string;
  style: string;
  ratio: string;
  shots: Shot[];
  assets: Asset[];
  bgm?: Media;
  revision: number;
  updatedAt: string;
};
export const id = () => crypto.randomUUID();
export function newShot(): Shot {
  return {
    id: id(),
    title: '新的镜头',
    description: '',
    scene: '',
    character: '',
    dialogue: '',
    duration: 5,
    size: '中景',
    camera: '固定镜头',
    prompt: '',
    references: [],
    trimStart: 0,
    enabled: true,
  };
}
export function newProject(title = '未命名短片'): Project {
  return {
    id: id(),
    title,
    brief: '',
    story: '',
    script: '',
    scenes: '',
    style: '电影质感',
    ratio: '16:9',
    shots: [],
    assets: [],
    revision: 0,
    updatedAt: new Date().toISOString(),
  };
}
export function exampleProject(): Project {
  const p = newProject('哈基米的奇遇');
  p.brief = '一只小猫，一封神秘来信，一场关于勇气的冒险。';
  p.story =
    '哈基米在清晨的街角发现一封蓝色信件。信里写着：钟声响起时，我在老地方等你。它望向远处的钟楼，决定穿过陌生的巷子，寻找久别的朋友。';
  p.script =
    '第一场 · 清晨 · 街角\n暖色阳光穿过树叶。哈基米在旧邮筒旁发现一封蓝色信件。\n\n第二场 · 清晨 · 钟楼下\n哈基米抬起头，远处传来钟声。\n哈基米：原来你还记得。\n\n第三场 · 清晨 · 小巷\n哈基米抱紧信件，朝钟楼走去。';
  p.scenes =
    '01 街角｜清晨｜哈基米｜发现蓝色信件\n02 钟楼下｜清晨｜哈基米｜读懂邀请\n03 小巷｜清晨｜哈基米｜踏上旅程';
  p.assets = [
    {
      id: id(),
      kind: '人物',
      name: '哈基米',
      description: '橘色短毛小猫，琥珀色眼睛，米白色胸口，蓝色围巾。',
    },
    {
      id: id(),
      kind: '场景',
      name: '清晨街角',
      description: '石板路、旧邮筒、浅色建筑，暖色晨光。',
    },
    {
      id: id(),
      kind: '道具',
      name: '蓝色信件',
      description: '浅蓝色信封，边缘微卷，红色封蜡。',
    },
  ];
  p.shots = [
    '晨光中的街角，小猫发现一封信',
    '小猫抬起头，望向远处的钟楼',
    '穿过巷子，踏上寻找朋友的旅程',
  ].map((title, i) => ({
    ...newShot(),
    title,
    description: title,
    scene: ['清晨街角', '钟楼下', '小巷'][i],
    character: '哈基米',
    dialogue: i === 1 ? '原来你还记得。' : '',
    duration: [5, 4, 6][i],
    size: ['中景', '特写', '远景'][i],
    camera: ['缓慢推进', '低机位上摇', '背后跟拍'][i],
    references: [p.assets[0].id],
  }));
  return p;
}
export function continuity(p: Project) {
  const issues: string[] = [];
  p.shots.forEach((s, i) => {
    const label = `镜头 ${i + 1}`;
    if (!s.description.trim()) issues.push(`${label}缺少画面描述`);
    if (!s.references.length) issues.push(`${label}尚未绑定人物或场景资产`);
    if (s.dialogue.length / s.duration > 5)
      issues.push(`${label}对白可能过长，请增加时长或缩短台词`);
    if (s.references.some((ref) => !p.assets.some((a) => a.id === ref)))
      issues.push(`${label}包含失效的资产引用`);
  });
  return issues;
}
export function shotVisualText(s: Shot) {
  if (!s.prompt) return s.description;
  if (!s.description || s.prompt.includes(s.description)) return s.prompt;
  return `${s.description}\n\n${s.prompt}`;
}
export function compilePrompt(p: Project, s: Shot) {
  const performance =
    s.lines && s.lines.map((l) => l.text).join('\n') === s.dialogue
      ? s.lines
          .map(
            (l) =>
              `${l.kind}｜${l.speaker || '未指定角色'}｜${l.emotion || '自然'}｜${l.voiceName || '音色待定'}：${l.text}`,
          )
          .join('\n')
      : s.dialogue;
  return `${p.style}，${p.ratio}画幅。${s.size}，${s.camera}。${s.description}。场景：${s.scene || '待指定'}。人物：${s.character || '无'}。${performance ? '对白表演：' + performance + '。' : ''}\n参考设定：${p.assets
    .filter((a) => s.references.includes(a.id))
    .map((a) => `${a.kind}/${a.name}：${a.description}`)
    .join('；')}\n保持人物造型、道具与光照连续，避免多余文字和水印。`;
}
export { cueSubtitle as subtitle } from './dialogue-timeline';
export function validateProject(value: unknown): Project {
  if (!value || typeof value !== 'object') throw Error('项目格式不正确');
  const p = value as Project;
  const str = (v: unknown, max: number) =>
    typeof v === 'string' && v.length <= max;
  const uuid = (v: unknown) =>
    typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v);
  if (p.creativeSkillId !== undefined && !str(p.creativeSkillId, 80))
    throw Error('创作Skill选择无效');
  if (
    p.assetImageSkillIds !== undefined &&
    (!p.assetImageSkillIds ||
      typeof p.assetImageSkillIds !== 'object' ||
      Array.isArray(p.assetImageSkillIds) ||
      Object.keys(p.assetImageSkillIds).length > 12 ||
      Object.entries(p.assetImageSkillIds).some(
        ([k, v]) => !str(k, 40) || !str(v, 150),
      ))
  )
    throw Error('资产生图Skill选择无效');
  if (p.storySkillId !== undefined && !str(p.storySkillId, 80))
    throw Error('故事Skill选择无效');
  if (
    p.storyVersionCount !== undefined &&
    (!Number.isInteger(p.storyVersionCount) ||
      p.storyVersionCount < 1 ||
      p.storyVersionCount > 4)
  )
    throw Error('故事版本个数应为1至4');
  if (p.scriptSkillId !== undefined && !str(p.scriptSkillId, 80))
    throw Error('剧本Skill选择无效');
  if (p.shotSkillId !== undefined && !str(p.shotSkillId, 80))
    throw Error('分镜Skill选择无效');
  if (p.videoType !== undefined && !str(p.videoType, 80))
    throw Error('视频类型格式错误');
  if (p.storyPlans !== undefined) {
    if (!Array.isArray(p.storyPlans) || p.storyPlans.length > 12)
      throw Error('最多保留12个故事方案');
    const ids = new Set<string>();
    for (const plan of p.storyPlans) {
      if (
        !plan ||
        !uuid(plan.id) ||
        ids.has(plan.id) ||
        !str(plan.title, 150) ||
        !plan.title.trim() ||
        !str(plan.summary, 1500) ||
        !str(plan.content, 30000) ||
        !plan.content.trim() ||
        !Array.isArray(plan.tags) ||
        plan.tags.length > 6 ||
        plan.tags.some((t) => !str(t, 30))
      )
        throw Error('故事方案格式错误');
      ids.add(plan.id);
    }
  }
  if (
    p.selectedStoryId !== undefined &&
    !p.storyPlans?.some((s) => s.id === p.selectedStoryId)
  )
    throw Error('所选故事方案不存在');
  if (
    !uuid(p.id) ||
    !str(p.title, 150) ||
    !p.title.trim() ||
    !Number.isInteger(p.revision) ||
    p.revision < 0
  )
    throw Error('项目标识、名称或版本不正确');
  for (const k of ['brief', 'story', 'script', 'scenes'] as const)
    if (!str(p[k], 100000)) throw Error('文本内容格式不正确');
  if (
    !str(p.style, 300) ||
    !['16:9', '9:16', '1:1'].includes(p.ratio) ||
    !Array.isArray(p.shots) ||
    p.shots.length > 200 ||
    !Array.isArray(p.assets) ||
    p.assets.length > 200
  )
    throw Error('项目超出限制');
  const media = (m: Media | undefined) => {
    if (
      m &&
      (!uuid(m.id) ||
        m.url !== `/api/media/${m.id}` ||
        !str(m.type, 100) ||
        !str(m.name, 250))
    )
      throw Error('素材地址不正确');
  };
  const seen = new Set();
  for (const a of p.assets) {
    if (
      !uuid(a.id) ||
      seen.has(a.id) ||
      !str(a.name, 150) ||
      !str(a.description, 10000) ||
      !['人物', '场景', '道具', '服饰', '风格', '声音', '站位图'].includes(
        a.kind,
      )
    )
      throw Error('资产格式不正确');
    seen.add(a.id);
    media(a.image);
    media(a.referenceImage);
    if (a.inLibrary !== undefined && typeof a.inLibrary !== 'boolean')
      throw Error('资产库标记无效');
    media(a.audio);
    media(a.video);
    if (
      a.usageCount !== undefined &&
      (!Number.isInteger(a.usageCount) ||
        a.usageCount < 0 ||
        a.usageCount > 1000000000)
    )
      throw Error('调用次数无效');
    if (
      a.tags !== undefined &&
      (!Array.isArray(a.tags) ||
        a.tags.length > 20 ||
        a.tags.some((t) => !str(t, 40)))
    )
      throw Error('资产标签最多20个，每个40字');
    if (a.favorite !== undefined && typeof a.favorite !== 'boolean')
      throw Error('常用标记无效');
    if (
      a.status !== undefined &&
      !['待完善', '已完成', '待复核'].includes(a.status)
    )
      throw Error('资产状态无效');
    for (const key of ['createdAt', 'updatedAt'] as const)
      if (
        a[key] !== undefined &&
        (!str(a[key], 40) || !Number.isFinite(Date.parse(a[key]!)))
      )
        throw Error('资产时间无效');
    if (a.origin !== undefined && !str(a.origin, 200))
      throw Error('资产来源无效');
    if (a.imageSkillId !== undefined && !str(a.imageSkillId, 150))
      throw Error('资产生图Skill选择无效');
    if (
      a.attributes !== undefined &&
      (!a.attributes ||
        typeof a.attributes !== 'object' ||
        Array.isArray(a.attributes) ||
        Object.keys(a.attributes).length > 12 ||
        Object.entries(a.attributes).some(
          ([k, v]) => !str(k, 40) || !str(v, 500),
        ))
    )
      throw Error('资产分类字段无效');
    if (
      a.usage !== undefined &&
      (!Array.isArray(a.usage) ||
        a.usage.length > 100 ||
        a.usage.some(
          (u) =>
            !u || !str(u.at, 40) || !str(u.target, 100) || !str(u.detail, 200),
        ))
    )
      throw Error('资产调用记录无效');
    if (a.versions !== undefined) {
      if (!Array.isArray(a.versions) || a.versions.length > 10)
        throw Error('资产版本过多');
      for (const v of a.versions) {
        if (
          !v ||
          !str(v.at, 40) ||
          !str(v.name, 150) ||
          !str(v.description, 10000)
        )
          throw Error('资产版本无效');
        media(v.image);
        media(v.audio);
        media(v.video);
      }
    }
    if (a.evidence !== undefined && !str(a.evidence, 2000))
      throw Error('资产依据过长');
    if (
      a.suggestedDescription !== undefined &&
      !str(a.suggestedDescription, 10000)
    )
      throw Error('资产建议过长');
  }
  seen.clear();
  for (const s of p.shots) {
    if (s.doubaoModel !== undefined && (typeof s.doubaoModel !== 'string' || s.doubaoModel.length > 100)) throw Error('豆包模型名称无效');
    if (s.doubaoRatio !== undefined && !['', '自动', '3:4', '4:3', '9:16', '16:9', '1:1', '21:9'].includes(s.doubaoRatio)) throw Error('豆包画幅无效');
    if (s.doubaoGroup !== undefined && (typeof s.doubaoGroup !== 'string' || s.doubaoGroup.length > 60))
      throw Error('豆包分组名称无效');
    if (
      s.videoModelId !== undefined &&
      (typeof s.videoModelId !== 'string' ||
        !/^[\w-]{1,80}$/.test(s.videoModelId))
    )
      throw Error('分镜模型配置无效');
    for (const key of [
      'blockingSkillId',
      'blockingGenerationId',
      'videoGenerationId',
      'videoPendingJobId',
      'blockingPendingJobId',
    ] as const) {
      if (s[key] !== undefined && (!str(s[key], 150) || !s[key]))
        throw Error('站位图技能或任务标识无效');
    }
    if (
      s.videoManualUpdatedAt !== undefined &&
      (typeof s.videoManualUpdatedAt !== 'string' ||
        !Number.isFinite(Date.parse(s.videoManualUpdatedAt)))
    )
      throw Error('视频手动更新时间无效');
    if (s.blockingPrompt !== undefined && !str(s.blockingPrompt, 10000))
      throw Error('站位图生成要求最多10000字');
    if (
      s.lines !== undefined &&
      (!Array.isArray(s.lines) ||
        s.lines.length > 40 ||
        s.lines.some(
          (l) =>
            !l ||
            !str(l.id, 150) ||
            !['台词', '旁白'].includes(l.kind) ||
            !str(l.speaker, 150) ||
            !str(l.emotion, 150) ||
            !str(l.voiceName, 150) ||
            !str(l.text, 10000) ||
            ['start', 'end', 'audioStart'].some((key) => {
              const v = l[key as keyof DialogueLine];
              return (
                v !== undefined &&
                (typeof v !== 'number' ||
                  !Number.isFinite(v) ||
                  v < 0 ||
                  v > 86400)
              );
            }),
        ) ||
        s.lines.map((l) => l.text).join('\n').length > 10000)
    )
      throw Error('分镜台词格式错误');
    if (
      s.assetNames !== undefined &&
      (!Array.isArray(s.assetNames) ||
        s.assetNames.length > 200 ||
        s.assetNames.some(
          (n) =>
            !n ||
            ![
              '人物',
              '道具',
              '场景',
              '服饰',
              '声音',
              '风格',
              '站位图',
            ].includes(n.kind) ||
            !str(n.name, 150) ||
            !n.name.trim(),
        ))
    )
      throw Error('分镜资产名称格式错误');
    if (s.reviewRequired !== undefined && !str(s.reviewRequired, 1000))
      throw Error('复核提示格式不正确');
    if (
      !uuid(s.id) ||
      seen.has(s.id) ||
      !Number.isFinite(s.duration) ||
      s.duration < 0.1 ||
      s.duration > 120 ||
      !Number.isFinite(s.trimStart) ||
      s.trimStart < 0 ||
      s.trimStart > 86400 ||
      typeof s.enabled !== 'boolean' ||
      !Array.isArray(s.references) ||
      s.references.length > 200 ||
      !s.references.every(uuid)
    )
      throw Error('镜头参数不正确');
    seen.add(s.id);
    for (const k of [
      'title',
      'description',
      'scene',
      'character',
      'dialogue',
      'size',
      'camera',
      'prompt',
    ] as const)
      if (!str(s[k], 10000)) throw Error('镜头文本不正确');
    media(s.image);
    media(s.video);
    media(s.audio);
    for (const line of s.lines || []) {
      media(line.audio);
      if (line.audio && !line.audio.type.startsWith('audio/'))
        throw Error('台词配音文件类型无效');
      for (const key of [
        'speechPendingId',
        'speechGenerationId',
        'speechVoiceId',
        'speechModelId',
      ] as const)
        if (line[key] !== undefined && !str(line[key], 150))
          throw Error('台词声音配置无效');
    }
    media(s.blockingImage);
    media(s.firstFrame);
    if (
      s.firstFrame &&
      !['image/png', 'image/jpeg', 'image/webp'].includes(s.firstFrame.type)
    )
      throw Error('首帧必须为图片');
    if (
      s.firstFrameSource &&
      (!s.firstFrame ||
        !uuid(s.firstFrameSource.shotId) ||
        !uuid(s.firstFrameSource.videoId) ||
        !Number.isFinite(s.firstFrameSource.time) ||
        s.firstFrameSource.time < 0)
    )
      throw Error('首帧来源格式错误');
    if (
      s.blockingImage &&
      !['image/png', 'image/jpeg', 'image/webp'].includes(s.blockingImage.type)
    )
      throw Error('站位图必须为图片');
  }
  media(p.bgm);
  if (p.assetScript !== undefined && !str(p.assetScript, 100000))
    throw Error('资产剧本快照格式错误');
  if (p.assetMode !== undefined && !['model', 'labels'].includes(p.assetMode))
    throw Error('资产识别方式错误');
  if (p.skills !== undefined) {
    if (!Array.isArray(p.skills) || p.skills.length > 30)
      throw Error('最多30个自定义技能');
    const skillIds = new Set<string>();
    for (const s of p.skills) {
      if (
        !str(s.id, 150) ||
        !str(s.name, 150) ||
        !str(s.version, 50) ||
        !str(s.stage, 50) ||
        !str(s.content, 20000)
      )
        throw Error('技能格式错误');
      if (
        !s.id.trim() ||
        skillIds.has(s.id) ||
        ['idea', 'story', 'script', 'scene', 'shot', 'continuity'].includes(
          s.id,
        )
      )
        throw Error('技能ID重复或占用内置ID');
      skillIds.add(s.id);
    }
  }
  if (
    p.favoriteSkillIds !== undefined &&
    (!Array.isArray(p.favoriteSkillIds) ||
      p.favoriteSkillIds.length > 100 ||
      p.favoriteSkillIds.some((s) => !str(s, 150)) ||
      new Set(p.favoriteSkillIds).size !== p.favoriteSkillIds.length)
  )
    throw Error('技能收藏格式无效');
  if (p.changeLog !== undefined) {
    if (
      !Array.isArray(p.changeLog) ||
      p.changeLog.length > 20 ||
      JSON.stringify(p.changeLog).length > 1200000
    )
      throw Error('修改记录过大，请导出备份后清理');
    for (const r of p.changeLog) {
      if (
        !r ||
        !str(r.id, 150) ||
        !str(r.time, 100) ||
        !str(r.name, 5000) ||
        !Array.isArray(r.changes) ||
        r.changes.length > 100
      )
        throw Error('修改记录格式不正确');
      for (const c of r.changes) {
        if (
          !c ||
          !['project', 'shot', 'asset'].includes(c.target) ||
          !str(c.id, 150) ||
          !str(c.field, 100) ||
          !str(c.reason, 2000) ||
          !(str(c.before, 100000) || typeof c.before === 'number') ||
          !(str(c.after, 100000) || typeof c.after === 'number')
        )
          throw Error('修改条目格式不正确');
      }
      if (
        r.skill &&
        (!str(r.skill.name, 150) ||
          !str(r.skill.version, 50) ||
          !str(r.skill.content, 20000))
      )
        throw Error('技能快照格式错误');
    }
  }
  return p;
}
