import type { GenerationJob } from './models';
import type { Project, Shot, Media } from './studio';

export function manualVideoPatch(
  video?: Media,
  now = new Date().toISOString(),
): Partial<Shot> {
  return {
    video,
    trimStart: 0,
    videoGenerationId: undefined,
    videoPendingJobId: undefined,
    videoManualUpdatedAt: now,
  };
}
export function videoResultSuppressed(shot: Shot, createdAt?: string) {
  return (
    !!shot.videoManualUpdatedAt &&
    (!createdAt ||
      !Number.isFinite(Date.parse(createdAt)) ||
      Date.parse(createdAt) <= Date.parse(shot.videoManualUpdatedAt))
  );
}

export function videoJobActive(job?: GenerationJob) {
  return (
    !!job &&
    ['queued', 'submitting', 'running', 'downloading'].includes(job.status)
  );
}
// Activity belongs to the selected channel; an older task from another channel
// must not keep the current generate button or preview spinning.
export function selectedVideoActive(modelId: string | undefined, apiJob?: GenerationJob, pluginJob?: {status: string}) {
  return modelId === 'doubao'
    ? !!pluginJob && ['queued', 'paused', 'prepared', 'submitted', 'downloading'].includes(pluginJob.status)
    : videoJobActive(apiJob);
}
export function latestVideoJob(
  jobs: GenerationJob[],
  projectId: string,
  shotId: string,
) {
  return jobs
    .filter(
      (j) =>
        j.target === 'video' &&
        j.projectId === projectId &&
        j.targetId === shotId,
    )
    .reduce<GenerationJob | undefined>(
      (last, j) => (!last || j.createdAt > last.createdAt ? j : last),
      undefined,
    );
}
export function mergeGenerationJob(old: GenerationJob[], job: GenerationJob) {
  const previous = old.find((j) => j.id === job.id);
  if (previous?.status === 'succeeded' && job.status !== 'succeeded')
    return old;
  return [...old.filter((j) => j.id !== job.id), job];
}
export function receiveGeneratedVideos(
  project: Project,
  jobs: GenerationJob[],
  liveIds: ReadonlySet<string>,
) {
  let changed = false;
  const shots = project.shots.map((shot) => {
    const job = latestVideoJob(jobs, project.id, shot.id);
    if (!job || videoResultSuppressed(shot, job.createdAt)) return shot;
    if (videoJobActive(job) && shot.videoPendingJobId !== job.id) {
      changed = true;
      return { ...shot, videoPendingJobId: job.id };
    }
    if (
      job.status !== 'succeeded' ||
      !job.media?.type.startsWith('video/') ||
      shot.videoGenerationId === job.id
    )
      return shot;
    if (
      shot.videoPendingJobId !== job.id &&
      !liveIds.has(job.id) &&
      (shot.video || shot.videoGenerationId)
    )
      return shot;
    changed = true;
    return {
      ...shot,
      video: job.media,
      trimStart: 0,
      videoGenerationId: job.id,
      videoPendingJobId: undefined,
    };
  });
  return changed ? { ...project, shots } : project;
}

// Queries existing jobs only. A failed query never creates a second paid task.
export class VideoJobMonitor {
  private pending = new Set<string>();
  private due = new Map<string, number>();
  private failures = new Map<string, number>();
  async tick(
    jobs: GenerationJob[],
    refresh: (id: string) => Promise<GenerationJob>,
    record: (job: GenerationJob) => void,
    now = Date.now(),
  ) {
    const candidates = jobs
      .filter(
        (j) =>
          j.target === 'video' &&
          ['running', 'downloading'].includes(j.status) &&
          !this.pending.has(j.id) &&
          (this.due.get(j.id) || 0) <= now,
      )
      .slice(0, Math.max(0, 3 - this.pending.size));
    await Promise.all(
      candidates.map(async (job) => {
        this.pending.add(job.id);
        try {
          record(await refresh(job.id));
          this.failures.delete(job.id);
          this.due.set(job.id, Date.now() + 5000);
        } catch {
          const count = (this.failures.get(job.id) || 0) + 1;
          this.failures.set(job.id, count);
          this.due.set(
            job.id,
            Date.now() + Math.min(60000, 5000 * 2 ** Math.min(count, 4)),
          );
        } finally {
          this.pending.delete(job.id);
        }
      }),
    );
  }
}
