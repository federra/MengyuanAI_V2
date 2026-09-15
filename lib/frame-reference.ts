import type { Project, Media } from './studio';
export type FrameTarget = {
  projectId: string;
  sourceShotId: string;
  sourceVideoId: string;
  targetShotId: string;
  previousFrameId: string;
  time: number;
};
export function lastFrameTime(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0)
    throw Error('视频时长不可用，请等待视频加载完成');
  return Math.max(0, duration - 0.001);
}
export function assertFrameTarget(p: Project, target: FrameTarget) {
  const source = p.shots.findIndex((s) => s.id === target.sourceShotId);
  if (
    p.id !== target.projectId ||
    source < 0 ||
    p.shots[source].video?.id !== target.sourceVideoId ||
    p.shots[source + 1]?.id !== target.targetShotId
  )
    throw Error('镜头顺序或来源视频已变化，请重新截图');
  if ((p.shots[source + 1].firstFrame?.id || '') !== target.previousFrameId)
    throw Error('下一镜头首帧已变化，请重新确认，原首帧未覆盖');
}
export function bindFrame(
  p: Project,
  target: FrameTarget,
  media: Media,
): Project {
  assertFrameTarget(p, target);
  return {
    ...p,
    shots: p.shots.map((s) =>
      s.id === target.targetShotId
        ? {
            ...s,
            firstFrame: media,
            firstFrameSource: {
              shotId: target.sourceShotId,
              videoId: target.sourceVideoId,
              time: target.time,
            },
          }
        : s,
    ),
  };
}
