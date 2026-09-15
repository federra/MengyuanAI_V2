import type { Media, Project } from './studio';
import { videoResultSuppressed } from './video-generation';
export type DoubaoAccount = {
  serial?: number;
  extensionSetup?: {status:'verified'|'failed';version?:string;checkedAt:string;message?:string};
  nickname?: string;
  loginCheckedAt?: string;
  loginCheck?: {id: string; status: string; message?: string; waitingFor?: string};
  id: string;
  name: string;
  group: string;
  enabled: boolean;
  openSkipReason?: string;
  loginStatus: string;
  connected: boolean;
  runtimeState?: string;
  executionBuild?: string;
  extensionUpdating?: boolean;
  extensionUpdateMessage?: string;
  points: number | null;
  remaining: number | null;
  dailyLimit: number | null;
  balanceSource?: string;
  balanceAt?: string;
  today: {
    submitted: number;
    completed: number;
    failed: number;
    active: number;
  };
};
export type DoubaoJob = {
  retryJobId?: string;
  retryOf?: string;
  createdAt?: string;
  id: string;
  projectId: string;
  shotId: string;
  title: string;
  status: string;
  accountId?: string;
  accountName?: string;
  originalVideoId?: string;
  media?: Media;
  error?: string;
  submittedAt?: string;
  slotReleased?: boolean;
  aiWatermarkRemoved?: boolean;
  brandWatermark?: boolean;
  generationAcceptedAt?: number;
  terminalAt?: number;
  promptExcerpt?: string;
  requestId?: string;
  videoId?: string;
  completedAt?: string;
  hasSavedResult?: boolean;
  resultFoundAt?: string;
  recoveryCount?: number;
  recoveryKey?: string;
  parameters?: { model?: string; actualModel?: string; ratio?: string; duration?: number; sources?: Record<string, string> };
  history?: { at: string; message: string }[];
};
export type DoubaoSettings = {
  timeoutMinutes: number;
  concurrency: number;
  autoSubmit: boolean;
  automaticPage?: boolean;
  mode: string;
  model: string;
  ratio: string;
  duration: number;
  resolution: string;
  promptSelector: string;
  uploadSelector: string;
  uploadReadySelector: string;
  submitSelector: string;
  resultSelector: string;
  pointsSelector: string;
  remainingSelector: string;
  runningSelector: string;
  idleSelector: string;
  nicknameSelector?: string;
  failureKeywords: string[];
};
export type DoubaoSnapshot = {
  operationReport?: {opened:number;skipped:string[];failed:string[]};
  participatingAccountIds: string[];
  accounts: DoubaoAccount[];
  jobs: DoubaoJob[];
  settings: DoubaoSettings;
  paused: boolean;
  helper: {
    pid: number;
    port: number;
    address: string;
    root: string;
    database: string;
    startedAt: string;
    chrome: string;
    version: string;
  };
};
export async function doubaoCommand<T = DoubaoSnapshot>(
  action = 'snapshot',
  data?: unknown,
): Promise<T> {
  if (!window.directorDesktop?.doubao)
    throw Error('多账号管理需要桌面版，请更新桌面版后打开。');
  const result = await window.directorDesktop.doubao(action, data) as T;
  if (['participation', 'pause', 'account', 'enqueue', 'regenerate', 'resume', 'cancel', 'checkLogin', 'deleteAccount'].includes(action))
    window.dispatchEvent(new Event('director-doubao-change'));
  return result;
}
export function doubaoSubmissionAccounts(state: DoubaoSnapshot, group?: string) {
  if (state.paused) throw Error('豆包任务已暂停，请在豆包插件中恢复任务后再提交；本次未加入队列。');
  const accounts = state.accounts.filter(a => a.enabled && state.participatingAccountIds?.includes(a.id));
  if (!accounts.length) throw Error('请先在豆包插件的账号页勾选“调用”的账号；本次未加入队列。');
  const selected = group ? accounts.filter(a => a.group === group) : accounts;
  if (!selected.length) throw Error('此分组没有勾选“调用”的可用账号，请先到豆包插件设置；本次未加入队列。');
  return selected;
}
export function doubaoJobPaused(job: DoubaoJob | undefined, queuePaused: boolean) {
  return job?.status === 'paused' || (!!job && queuePaused && ['queued', 'prepared'].includes(job.status) && !job.submittedAt);
}
export function doubaoJobFailed(job?: DoubaoJob) {
  return !!job && ['failed', 'attention'].includes(job.status);
}
export function receiveDoubaoVideos(
  project: Project,
  jobs: DoubaoJob[],
): Project {
  let changed = false;
  const shots = project.shots.map((s) => {
    const job = [...jobs]
      .reverse()
      .find(
        (j) =>
          j.projectId === project.id &&
          j.shotId === s.id &&
          j.status === 'succeeded' &&
          j.media &&
          !videoResultSuppressed(s, j.createdAt) &&
          s.videoGenerationId !== `doubao-${j.id}` &&
          (s.video?.id || '') === (j.originalVideoId || ''),
      );
    if (!job) return s;
    changed = true;
    return {
      ...s,
      video: job.media,
      trimStart: 0,
      videoGenerationId: `doubao-${job.id}`,
      videoPendingJobId: undefined,
    };
  });
  return changed ? { ...project, shots } : project;
}
