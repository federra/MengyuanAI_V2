import type { Media, Project } from './studio';

export type ProjectCover = { kind: 'video' | 'image'; url: string; time?: number };
export const projectStatusLabels = {
  empty: '待创作', idea: '已有创意', story: '已有故事', script: '已有剧本',
  storyboard: '已有分镜', assets: '素材制作中', ready: '画面齐备',
} as const;

/** Summarize saved content, without claiming a render/export has completed. */
export function projectOverview(project: Project) {
  const covers: ProjectCover[] = [];
  const seen = new Set<string>();
  const add = (media: Media | undefined, kind: ProjectCover['kind'], time = 0) => {
    if (!media?.url || !media.type.startsWith(kind + '/') || seen.has(media.url)) return;
    seen.add(media.url);
    covers.push(kind === 'video' ? {kind, url: media.url, time: Math.max(0, Number.isFinite(time) ? time : 0)} : {kind, url: media.url});
  };
  const active = project.shots.filter(shot => shot.enabled);
  const shots = [...active, ...project.shots.filter(shot => !shot.enabled)];
  for (const shot of shots) add(shot.video, 'video', shot.trimStart);
  for (const asset of project.assets) add(asset.video, 'video');
  for (const shot of shots) {
    add(shot.image, 'image');
    add(shot.blockingImage, 'image');
    add(shot.firstFrame, 'image');
  }
  for (const asset of project.assets) {
    if (asset.image?.id !== asset.dismissedImageId) add(asset.image, 'image');
  }
  const hasFrame = (shot: Project['shots'][number]) =>
    !!(shot.video?.url && shot.video.type.startsWith('video/')) ||
    !!(shot.image?.url && shot.image.type.startsWith('image/'));
  const status: keyof typeof projectStatusLabels = active.length && active.every(hasFrame) ? 'ready'
    : covers.length ? 'assets'
    : project.shots.length ? 'storyboard'
    : project.script.trim() || project.scenes.trim() ? 'script'
    : project.story.trim() || project.storyPlans?.some(plan => plan.content.trim()) ? 'story'
    : project.brief.trim() ? 'idea' : 'empty';
  return {status, covers};
}
