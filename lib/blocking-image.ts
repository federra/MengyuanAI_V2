import { assetImageSkills } from './asset-image-skill';
import type { GenerationJob } from './models';
import type { Project, Shot } from './studio';

export const defaultBlockingSkill = 'shot-blocking-image';
export function blockingImageSkill(project: Project, shot: Shot) {
  const selected = shot.blockingSkillId || defaultBlockingSkill;
  if (selected === 'none') return undefined;
  const skill = assetImageSkills(project).find((s) => s.id === selected);
  if (!skill) throw Error('所选站位图 Skill 已删除或不适用，请重新选择。');
  return skill;
}
export function blockingImagePrompt(
  project: Project,
  shot: Shot,
  brief: string,
) {
  const skill = blockingImageSkill(project, shot);
  const prompt = [
    `生成当前分镜的单帧站位图。画幅：${project.ratio}。统一风格：${project.style}。`,
    brief,
    skill
      ? `本次站位图 Skill：${skill.name}（${skill.version}）\n${skill.content}`
      : '',
    '只生成本镜头的站位图片，保持已关联角色、场景和道具的一致性。',
  ]
    .filter(Boolean)
    .join('\n\n');
  if (!brief.trim()) throw Error('请填写站位图生成要求。');
  if (prompt.length > 10000)
    throw Error('站位图要求与 Skill 合计超过10000字，请精简后提交。');
  return prompt;
}
export function latestBlockingJob(
  jobs: GenerationJob[],
  projectId: string,
  shotId: string,
) {
  return jobs
    .filter(
      (j) =>
        j.projectId === projectId &&
        j.targetId === shotId &&
        j.target === 'blockingImage',
    )
    .reduce<GenerationJob | undefined>(
      (latest, j) => (!latest || j.createdAt > latest.createdAt ? j : latest),
      undefined,
    );
}
export function blockingJobActive(job?: GenerationJob) {
  return !!job && ['queued', 'submitting', 'running'].includes(job.status);
}
// Keep manual uploads and removals intact when historical results are polled again.
// The pending ID also lets a saved project recover a generation after reopening.
export function receiveBlockingImages(
  project: Project,
  jobs: GenerationJob[],
  liveIds: ReadonlySet<string>,
) {
  let changed = false;
  const shots = project.shots.map((shot) => {
    const job = latestBlockingJob(jobs, project.id, shot.id);
    if (!job) return shot;
    if (blockingJobActive(job) && shot.blockingPendingJobId !== job.id) {
      changed = true;
      return { ...shot, blockingPendingJobId: job.id };
    }
    if (
      job.status !== 'succeeded' ||
      !job.media ||
      shot.blockingGenerationId === job.id
    )
      return shot;
    if (
      shot.blockingPendingJobId !== job.id &&
      !liveIds.has(job.id) &&
      (shot.blockingImage || shot.blockingGenerationId)
    )
      return shot;
    changed = true;
    return {
      ...shot,
      blockingImage: job.media,
      blockingGenerationId: job.id,
      blockingPendingJobId: undefined,
    };
  });
  return changed ? { ...project, shots } : project;
}
