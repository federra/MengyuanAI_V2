'use client';
import { recoverProject } from '@/lib/project-recovery';
import { AdminConsole } from '@/components/admin-console';
import {AccessGate,AccessProfile} from '@/components/access-gate';
import type {AccessState} from '@/lib/access';
import {ThemeToggle} from '@/components/theme-toggle';
import { readApiResponse, progressType } from '@/lib/api-response';
import {
  CreativeWorkspace,
  WorkflowAssistant,
} from '@/components/creative-workspace';
import { SequencePreview } from '@/components/sequence-preview';
import { creativeStages, parseStoryPlans } from '@/lib/creative';
import { BusinessCenter } from '@/components/business-center';
import { SkillCenter } from '@/components/skill-center';
import { AssetCenter } from '@/components/asset-center';
import { ProjectAssetDialog } from '@/components/project-asset-dialog';
import { useImageBatches } from '@/components/use-image-batches';
import { ImageBatchStatus } from '@/components/image-batch-status';
import { useGenerationJobs } from '@/components/use-generation-jobs';
import { revisedAsset } from '@/lib/asset-library';
import { ModelSettings } from '@/components/model-settings';
import {
  GenerationDialog,
  GenerationTasks,
  type GenerationTarget,
} from '@/components/generation-tools';
import type { GenerationJob } from '@/lib/models';
import {
  receiveGeneratedVideos,
  manualVideoPatch,
} from '@/lib/video-generation';
import { receiveGeneratedSpeech } from '@/lib/speech';
import { doubaoCommand, receiveDoubaoVideos } from '@/lib/doubao-manager';
import { dialogueLines } from '@/lib/dialogue';
import { receiveBlockingImages } from '@/lib/blocking-image';
import { DirectorTools } from '@/components/director-tools';
import {
  undoLast,
  applyStoryboardImport,
  exportStoryboard,
  parseStoryboardImport,
  builtinSkills,
} from '@/lib/director';
import { AssetSync } from '@/components/asset-sync';
import { StoryboardRows } from '@/components/storyboard-rows';
import { FirstFrameControl } from '@/components/first-frame-control';
import {
  assertFrameTarget,
  bindFrame,
  type FrameTarget,
} from '@/lib/frame-reference';
import { assetKinds, matchShotAssets } from '@/lib/assets';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Image from 'next/image';
import {
  Clapperboard,
  FolderOpen,
  Sparkles,
  Layers3,
  ListVideo,
  Scissors,
  Settings2,
  Wrench,
  Blocks,
  Wallet,
  Users,
  ShieldCheck,
  Plus,
  Check,
  Save,
  Download,
  Image as ImageIcon,
  ChevronRight,
  Upload,
  ArrowUp,
  ArrowDown,
  Copy,
  Film,
  Music2,
  FileText,
  LoaderCircle,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  stages,
  type Stage,
  type Project,
  type Shot,
  type Asset,
  type Media,
  newProject,
  newShot,
  exampleProject,
  id,
  continuity,
  compilePrompt,
  subtitle,
} from '@/lib/studio';
import { download, exportKit, exportJianyingDraft } from '@/lib/export';
import { DirectorySettings } from '@/components/directory-settings';
const menus = [
  { icon: FolderOpen, name: '项目中心' },
  { icon: Clapperboard, name: '创作工作台' },
  { icon: Layers3, name: '资产中心' },
  { icon: Blocks, name: 'Skill 中心' },
  { icon: ListVideo, name: '任务中心' },
  { icon: Wallet, name: '收益中心' },
  { icon: Users, name: '渠道代理' },
  { icon: Scissors, name: '剪辑输出' },
  { icon: Settings2, name: '模型设置' },
];
function caption(s: Shot) {
  return (
    'data:text/vtt;charset=utf-8,' +
    encodeURIComponent(
      'WEBVTT\n\n00:00:00.000 --> ' +
        new Date(s.duration * 1000).toISOString().slice(11, 23) +
        '\n' +
        s.dialogue +
        '\n',
    )
  );
}
function Picker({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label={label} className="picker">
        <SelectValue>{value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((v) => (
          <SelectItem key={v} value={v}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Field({
  label,
  value,
  onChange,
  rows,
  fieldKey,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  fieldKey?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {rows ? (
        <textarea
          data-stage-field={fieldKey}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}
function Title({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
async function api<T>(url: string, options?: RequestInit, onAccepted?: (body: T) => void): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set('Accept', progressType);
  return readApiResponse<T>(await fetch(url, { ...options, headers }), undefined, onAccepted);
}
export default function Home(){return <AccessGate>{state=><Workbench accessState={state}/>}</AccessGate>;}
function Workbench({accessState}:{accessState:AccessState}) {
  const [project, setProject] = useState<Project>(() => exampleProject());
  const [projects, setProjects] = useState<Project[]>([]);
  const [step, setStep] = useState<Stage>('分镜');
  const [rowView, setRowView] = useState(true);
  const [menu, setMenu] = useState('创作工作台');
  const lastWorkbench = useRef<{ projectId: string; stage: Stage }>({
    projectId: project.id,
    stage: '分镜',
  });
  useEffect(() => {
    if (menu === '创作工作台') {
      lastWorkbench.current = {
        projectId: project.id,
        stage: ['资产', '视频', '配音'].includes(step) ? '分镜' : step,
      };
    }
  }, [menu, step, project.id]);
  const [skillLaunch, setSkillLaunch] = useState<{
    nonce: number;
    skillId: string;
    projectId: string;
    instruction?: string;
    panel?: string;
    scope?: string;
  }>();
  const businessMode = ['Skill 中心', '收益中心', '渠道代理'].includes(menu);
  const [selected, setSelected] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState('');
  const [directorySettingsOpen, setDirectorySettingsOpen] = useState(false);
  const [desktopVersion,setDesktopVersion]=useState('');
  useEffect(()=>{let active=true;window.directorDesktop?.getVersion?.().then(version=>{if(active)setDesktopVersion(version);}).catch(()=>{});return()=>{active=false;};},[]);
  const [newName, setNewName] = useState('');
  const [assetKind, setAssetKind] = useState('人物');
  const [assetManagementKind, setAssetManagementKind] = useState('');
  useEffect(() => {
    if (loading || !window.directorDesktop?.doubao) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const state = await doubaoCommand();
        if (!disposed) {
          const next = receiveDoubaoVideos(project, state.jobs);
          if (next !== project) {
            setProject(next);
            setDirty(true);
            setNotice('豆包原始视频已下载并返回对应分镜，请保存项目。');
          }
        }
      } catch {
        /* Helper errors are shown in the management panel. */
      }
      if (!disposed) timer = setTimeout(poll, 4000);
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [project, loading]);
  const generationState = useGenerationJobs(project.id, !loading);
  const { record: recordJob } = generationState;
  const liveBlockingIds = useRef(new Set<string>());
  const recordGeneration = useCallback(
    (job: GenerationJob) => {
      if (job.target === 'blockingImage' || job.target === 'video')
        liveBlockingIds.current.add(job.id);
      recordJob(job);
    },
    [recordJob],
  );
  useEffect(() => {
    if (loading) return;
    const blocked = receiveBlockingImages(
      project,
      generationState.jobs,
      liveBlockingIds.current,
    );
    const videoReceived = receiveGeneratedVideos(
      blocked,
      generationState.jobs,
      liveBlockingIds.current,
    );
    const next = receiveGeneratedSpeech(videoReceived, generationState.jobs);
    if (next !== videoReceived)
      setNotice('配音已生成并返回对应台词，请保存项目。');
    if (next !== project) {
      setProject(next);
      setDirty(true);
      if (
        next.shots.some(
          (s, i) => s.blockingImage !== project.shots[i]?.blockingImage,
        )
      ) {
        setNotice('站位图生成完成，已返回对应分镜。请保存项目。');
      }
    }
    if (next.shots.some((s, i) => s.video !== project.shots[i]?.video)) {
      setNotice('视频已自动下载到对应分镜的预览区，可直接播放。请保存项目。');
    }
  }, [project, generationState.jobs, loading]);
  const imageBatches = useImageBatches(generationState.record);
  const batchesActive = useRef(false);
  useEffect(() => {
    batchesActive.current = imageBatches.active;
  }, [imageBatches.active]);
  const [skillSelection, setSkillSelection] = useState<{
    field: 'creativeSkillId' | 'storySkillId' | 'scriptSkillId' | 'shotSkillId';
    returnStage: Stage;
    stage: string;
  }>();
  const [model, setModel] = useState({ text: false, model: '' });
  const [generationTarget, setGenerationTarget] =
    useState<GenerationTarget | null>(null);
  const [aiText, setAiText] = useState('');
  const [aiTask, setAiTask] = useState('');
  const aiStoryboard = useMemo(() => {
    if (aiTask !== 'shots' || !aiText.trim()) return null;
    try {
      const parsed = parseStoryboardImport(aiText);
      return {
        segments: parsed.shots.length,
        seconds: parsed.shots.reduce((sum, s) => sum + s.duration, 0),
        assets: parsed.assets.length,
      };
    } catch {
      return null;
    }
  }, [aiTask, aiText]);
  const [undo, setUndo] = useState<Project | null>(null);
  const [savedTime, setSavedTime] = useState('');
  const recoveryCopies = useRef(new Set<string>());
  const current = useRef(project);
  const lock = useRef(false);
  const isDirty = useRef(dirty);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{
    kind:
      | 'image'
      | 'video'
      | 'audio'
      | 'asset'
      | 'assetAudio'
      | 'assetVideo'
      | 'assetReference'
      | 'bgm'
      | 'blockingImage'
      | 'firstFrame';
    target: string;
  }>({ kind: 'image', target: '' });
  useEffect(() => {
    current.current = project;
    isDirty.current = dirty;
  }, [project, dirty]);
  useEffect(()=>{
    if(loading)return;
    const snapshot={project,dirty,recoveredCopy:recoveryCopies.current.has(project.id)};
    const timer=setTimeout(()=>{void window.directorDesktop?.auth?.('recovery-write',snapshot);},300);
    return()=>{clearTimeout(timer);void window.directorDesktop?.auth?.('recovery-write',snapshot);};
  },[project,dirty,loading]);
  useEffect(()=>{
    const guard=(event:Event)=>{if(lock.current||batchesActive.current)(event as CustomEvent<{blocked:boolean}>).detail.blocked=true;};
    window.addEventListener('director-before-logout',guard);return()=>window.removeEventListener('director-before-logout',guard);
  },[]);
  useEffect(() => {
    api<Project[]>('/api/projects')
      .then(async (data: Project[]) => {
        setProjects(data);
        if (data.length) {
          setProject(data[0]);
          setSelected(data[0].shots[0]?.id || '');
        } else setDirty(true);
        const recovery=await window.directorDesktop?.auth?.('recovery-read') as {project?:Project;dirty?:boolean;recoveredCopy?:boolean}|null;
        if (recovery?.dirty && recovery.project && window.confirm('发现该账号上次未保存的项目，是否恢复？如已保存版本发生变化，将另建恢复草稿，保留两份内容。')) {
          const restored = recoverProject(recovery.project, data);
          if (restored.copied || recovery.recoveredCopy) recoveryCopies.current.add(restored.project.id);
          current.current = restored.project;
          isDirty.current = restored.dirty;
          setProject(restored.project);
          setSelected(restored.project.shots[0]?.id || '');
          setDirty(restored.dirty);
          if (restored.copied) setNotice('旧草稿与已保存版本不同，已恢复为独立草稿。保存后可继续生成；原项目和历史任务仍保留在项目中心。');
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    api<{ text: boolean; model: string }>('/api/ai')
      .then(setModel)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (isDirty.current || batchesActive.current || lock.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, []);
  const shot = project.shots.find((s) => s.id === selected) || project.shots[0];
  const shotIndex = shot ? project.shots.findIndex((s) => s.id === shot.id) : 0;
  const total = project.shots
    .filter((s) => s.enabled)
    .reduce((a, s) => a + s.duration, 0);
  const issues = continuity(project);
  function applyGeneration(job: GenerationJob) {
    if (job.projectId !== project.id || !job.media) {
      setError('生成结果不属于当前项目');
      return;
    }
    if (job.target === 'audio') {
      const source = project.shots.find((s) => s.id === job.targetId);
      const lines = source && dialogueLines(source);
      if (
        !source ||
        !lines?.some((l) => l.id === job.lineId && l.text === job.speechText)
      ) {
        setError('原台词已修改或删除，请先核对配音内容');
        return;
      }
      const updated = lines.map((l) =>
        l.id === job.lineId
          ? {
              ...l,
              audio: job.media,
              audioStart: 0,
              speechPendingId: undefined,
              speechGenerationId: job.id,
            }
          : l,
      );
      editShot(
        { lines: updated, dialogue: updated.map((l) => l.text).join('\n') },
        source.id,
      );
    } else if (job.target === 'asset') {
      if (!project.assets.some((a) => a.id === job.targetId)) {
        setError('原资产已删除，无法应用');
        return;
      }
      edit({
        assets: project.assets.map((a) =>
          a.id === job.targetId ? { ...a, image: job.media } : a,
        ),
      });
    } else {
      if (!project.shots.some((s) => s.id === job.targetId)) {
        setError('原镜头已删除，无法应用');
        return;
      }
      editShot({ [job.target]: job.media }, job.targetId);
    }
    setNotice('生成结果已应用，请保存项目');
  }
  function edit(patch: Partial<Project>) {
    setUndo(null);
    setProject((p) => ({
      ...p,
      ...patch,
      ...(patch.assets
        ? {
            assets: patch.assets.map((a) =>
              revisedAsset(
                p.assets.find((old) => old.id === a.id),
                a,
              ),
            ),
            shots: (patch.shots || p.shots).map((s) =>
              s.references.some((ref) => {
                const old = p.assets.find((a) => a.id === ref);
                const next = patch.assets!.find((a) => a.id === ref);
                return (
                  old &&
                  next &&
                  (old.name !== next.name ||
                    old.description !== next.description ||
                    JSON.stringify(old.attributes) !==
                      JSON.stringify(next.attributes))
                );
              })
                ? {
                    ...s,
                    reviewRequired: '关联资产设定已修改，请复核画面和声音',
                  }
                : s,
            ),
          }
        : {}),
      ...(patch.shots
        ? {
            shots: patch.shots.map((s) =>
              p.shots.some((old) => old.id === s.id)
                ? s
                : matchShotAssets(s, patch.assets || p.assets),
            ),
          }
        : {}),
    }));
    setDirty(true);
    setNotice('');
  }
  function editShot(patch: Partial<Shot>, target = shot?.id) {
    if (!target) return;
    setUndo(null);
    setProject((p) => ({
      ...p,
      shots: p.shots.map((s) =>
        s.id === target
          ? ['title', 'description', 'scene', 'character', 'dialogue'].some(
              (k) => k in patch,
            )
            ? matchShotAssets({ ...s, ...patch }, p.assets)
            : { ...s, ...patch }
          : s,
      ),
    }));
    setDirty(true);
    setNotice('');
  }
  async function applyCapturedFrame(file: File, target: FrameTarget) {
    if (lock.current) throw Error('请等待当前操作完成后再关联首帧');
    assertFrameTarget(current.current, target);
    lock.current = true;
    setBusy('上传首帧');
    try {
      const form = new FormData();
      form.set('file', file);
      const media = await api<Media>('/api/media', {
        method: 'POST',
        body: form,
      });
      const next = bindFrame(current.current, target, media);
      setUndo(structuredClone(current.current));
      setProject(next);
      setDirty(true);
      setNotice('截图已关联为下一镜头首帧，请保存项目');
    } finally {
      lock.current = false;
      setBusy('');
    }
  }
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  async function save(input?: Project) {
    const pending = saveQueue.current.then(async () => {
      const p = input ?? current.current;
      const atStart = current.current;
      const result: Project = await api<Project>('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(recoveryCopies.current.has(p.id) ? { 'x-director-import': '1' } : {}) },
        body: JSON.stringify(p),
      });
      setProjects((all) => [result, ...all.filter((x) => x.id !== result.id)]);
      const changedDuringSave = current.current !== atStart;
      if (changedDuringSave && current.current.id === result.id) {
        const next = { ...current.current, revision: result.revision, updatedAt: result.updatedAt };
        current.current = next;
        isDirty.current = true;
        setProject(next);
        setDirty(true);
      } else if (!changedDuringSave) {
        current.current = result;
        isDirty.current = false;
        setProject(result);
        setDirty(false);
      }
      setSavedTime(
        new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
      setNotice(
        changedDuringSave
          ? '已保存提交时的版本，新增修改仍待保存。'
          : '项目已保存',
      );
      return result;
    });
    saveQueue.current = pending.catch(() => {});
    return pending;
  }
  async function action(name: string, fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(name);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      lock.current = false;
      setBusy('');
    }
  }
  async function choose(p: Project) {
    await action('切换项目', async () => {
      if (isDirty.current) await save();
      setProject(p);
      setUndo(null);
      setSelected(p.shots[0]?.id || '');
      setDirty(false);
      setMenu('创作工作台');
      setStep('创意');
    });
  }
  function addShot() {
    const s = newShot();
    edit({ shots: [...project.shots, s] });
    setSelected(s.id);
    setStep('分镜');
    setMenu('创作工作台');
  }
  function move(index: number, delta: number) {
    const shots = [...project.shots];
    if (index + delta < 0 || index + delta >= shots.length) return;
    [shots[index], shots[index + delta]] = [shots[index + delta], shots[index]];
    edit({ shots });
  }
  function upload(kind: typeof uploadTarget.current.kind, target = '') {
    uploadTarget.current = { kind, target };
    if (fileInput.current) {
      fileInput.current.accept =
        kind === 'image' ||
        kind === 'asset' ||
        kind === 'assetReference' ||
        kind === 'blockingImage' ||
        kind === 'firstFrame'
          ? 'image/png,image/jpeg,image/webp'
          : kind === 'video' || kind === 'assetVideo'
            ? 'video/mp4,video/webm'
            : 'audio/*';
      fileInput.current.click();
    }
  }
  async function fileChanged(file?: File) {
    if (!file) return;
    const target = { ...uploadTarget.current };
    await action('上传素材', async () => {
      if (
        target.kind === 'video' &&
        !['video/mp4', 'video/webm'].includes(file.type)
      )
        throw Error('请选择 MP4 或 WebM 视频');
      if (
        target.kind === 'firstFrame' &&
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      )
        throw Error('首帧请选择 JPG、PNG 或 WebP 图片');
      const data = new FormData();
      data.set('file', file);
      const m: Media = await api<Media>('/api/media', {
        method: 'POST',
        body: data,
      });
      if (
        target.kind === 'asset' ||
        target.kind === 'assetReference' ||
        target.kind === 'assetAudio' ||
        target.kind === 'assetVideo'
      ) {
        setUndo(null);
        setProject((p) => ({
          ...p,
          assets: p.assets.map((a) =>
            a.id === target.target
              ? revisedAsset(a, {
                  ...a,
                  [target.kind === 'assetReference'
                    ? 'referenceImage'
                    : target.kind === 'assetAudio'
                      ? 'audio'
                      : target.kind === 'assetVideo'
                        ? 'video'
                        : 'image']: m,
                })
              : a,
          ),
        }));
        setDirty(true);
      } else if (target.kind === 'bgm') edit({ bgm: m });
      else if (target.kind === 'firstFrame')
        editShot({ firstFrame: m, firstFrameSource: undefined }, target.target);
      else if (target.kind === 'video')
        editShot(manualVideoPatch(m), target.target);
      else editShot({ [target.kind]: m }, target.target);
      setNotice('素材已上传，请保存项目');
    });
    if (fileInput.current) fileInput.current.value = '';
  }
  async function generate(task: string, context?: string, source: Project = project) {
    const content =
      task === 'story' || task === 'storyOptions'
        ? source.brief
        : task === 'script'
          ? source.story
          : task === 'prompt' && shot
            ? compilePrompt(project, shot)
            : source.script;
    if (!content.trim()) {
      setError('请先填写上一步内容');
      return;
    }
    setAiTask(task);
    await action('AI 正在创作', async () => {
      const result = await api<{ text: string; phase?: string }>('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          storyLength: source.storyLength || '500～1000字',
          storyCount:
            task === 'storyOptions'
              ? source.storyVersionCount || 3
              : undefined,
          content:
            context ||
            (task === 'script'
              ? JSON.stringify({
                  story: content,
                  videoType: source.videoType,
                  style: source.style,
                  ratio: source.ratio,
                  scriptSkill:
                    [...builtinSkills, ...(source.skills || [])].find(
                      (s) =>
                        s.id === (source.scriptSkillId || 'script') &&
                        ['剧本', '全项目'].includes(s.stage),
                    ) || builtinSkills.find((s) => s.id === 'script'),
                })
              : task === 'shots'
                ? JSON.stringify({
                    script: content,
                    ratio: source.ratio,
                    videoType: source.videoType,
                    style: source.style,
                    shotSkill:
                      [...builtinSkills, ...(source.skills || [])].find(
                        (s) =>
                          s.id === (source.shotSkillId || 'shot') &&
                          ['分镜', '全项目'].includes(s.stage),
                      ) || builtinSkills.find((s) => s.id === 'shot'),
                    assets: source.assets.map((a) => ({
                      kind: a.kind,
                      name: a.name,
                      description: a.description,
                    })),
                  })
                : task === 'story' ? JSON.stringify({brief: content, videoType: source.videoType, style: source.style, ratio: source.ratio, storyLength: source.storyLength || '500～1000字', creativeSkill: [...builtinSkills, ...(source.skills || [])].find(s => s.id === (source.creativeSkillId || 'idea'))}) : content),
        }),
      }, progress => { if (progress.phase === 'storyboard-converting') setBusy('剧本格式转换中'); });
      if (task === 'storyOptions') {
        const plans = parseStoryPlans(result.text);
        if ((source.storyPlans?.length || 0) + plans.length > 12)
          throw Error('故事方案超过12个，请先删除不再使用的候选');
        edit({ storyPlans: [...(source.storyPlans || []), ...plans] });
        setNotice(
          `已生成${plans.length}个故事方案${plans.length !== (source.storyVersionCount || 3) ? `（模型未按要求返回${source.storyVersionCount || 3}个，已保留完整方案）` : ''}，请选择并保存项目。`,
        );
        return;
      }
      if (task === 'script' && !source.script.trim()) {
        setProject(current => current.id === source.id && current.story === source.story && !current.script.trim() ? {...current, script: result.text} : current);
        setDirty(true);
        setNotice('剧本已生成，请审阅并保存项目。');
        return;
      }
      setAiText(result.text);
      setDialog('ai');
    });
  }
  async function applyAi() {
    if (lock.current) return;
    lock.current = true;
    setBusy('正在校验分镜格式');
    try {
      setUndo(structuredClone(project));
      if (aiTask === 'shots') {
        const prepared = await api<{text: string; phase?: string}>('/api/storyboards/normalize', {
          method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({source: aiText}),
        }, progress => { if (progress.phase === 'storyboard-converting') setBusy('剧本格式转换中'); });
        if (current.current.id !== project.id) throw Error('项目已切换，请重新应用。');
        const next = applyStoryboardImport(project, prepared.text, 'append');
        setAiText(prepared.text);
        edit({ shots: next.shots, assets: next.assets });
        setSelected(next.shots[project.shots.length].id);
        setStep('分镜');
      } else if (aiTask === 'prompt') editShot({ prompt: aiText });
      else edit({ [aiTask]: aiText });
      setUndo(structuredClone(project));
      setDialog('');
      setNotice('已应用 AI 建议，可撤销');
    } catch (e) {
      setError(e instanceof Error ? e.message : '应用失败');
    } finally { lock.current = false; setBusy(''); }
  }
  function stageDone(s: Stage) {
    if (s === '创意') return !!project.brief.trim();
    if (s === '故事') return !!project.story.trim();
    if (s === '剧本') return !!project.script.trim();
    if (s === '分场') return !!project.scenes.trim();
    if (s === '分镜') return project.shots.length > 0;
    if (s === '资产') return project.assets.some((a) => a.image);
    if (s === '视频')
      return (
        project.shots.length > 0 &&
        project.shots.every((s) => s.video && !s.reviewRequired)
      );
    if (s === '配音') return project.shots.some((s) => s.audio);
    return false;
  }
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: 'read_current_project',
        description: '读取当前工作台项目与未保存编辑',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => ({
          id: current.current.id,
          title: current.current.title,
          shots: current.current.shots,
          dirty: isDirty.current,
        }),
      },
      {
        name: 'stage_new_shot',
        description:
          '在当前项目添加一个未保存镜头，显示在分镜工作区；不调用模型或产生费用',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 150 },
          },
          required: ['title'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute: (input: unknown) => {
          const value = input as { title?: unknown };
          if (
            typeof value?.title !== 'string' ||
            !value.title.trim() ||
            value.title.length > 150
          )
            throw Error('镜头标题不正确');
          if (lock.current) throw Error('工作台忙碌，请稍后重试');
          const s = { ...newShot(), title: value.title };
          setUndo(null);
          setProject((p) => ({ ...p, shots: [...p.shots, s] }));
          setDirty(true);
          setSelected(s.id);
          setMenu('创作工作台');
          setStep('分镜');
          return { id: s.id, status: 'unsaved' };
        },
      },
    ];
    tools.forEach((t) => {
      try {
        Promise.resolve(
          context.registerTool(t, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    });
    return () => lifecycle.abort();
  }, []);
  const creativeMode = menu === '创作工作台' || menu === '剪辑输出';
  const primaryStep = ['资产', '视频', '配音'].includes(step)
    ? '分镜'
    : step === '分场'
      ? '剧本'
      : step;
  const workflowStages = creativeMode ? creativeStages : stages;
  const inputStage = ['创意', '故事', '剧本', '分场'].includes(step);
  return (
    <>
    <Dialog open={busy === '剧本格式转换中'}><DialogContent showCloseButton={false}><DialogHeader><DialogTitle>剧本格式转换中</DialogTitle><DialogDescription>正在校验并适配分镜格式，请稍候。</DialogDescription></DialogHeader></DialogContent></Dialog>
    <SidebarProvider
      style={{ '--sidebar-width': '216px', '--sidebar-width-icon': '64px' } as React.CSSProperties}
    >
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="brand">
            <span className="brand-icon">
              <Clapperboard />
            </span>
            <div>
              <b>AI 短片导演</b>
              <small>{desktopVersion ? `桌面版 v${desktopVersion}` : 'DIRECTOR STUDIO'}</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-caption">工作空间</p>
          <SidebarMenu>
            {menus.map(({ icon: Icon, name }) => (
              <SidebarMenuItem key={name}>
                <SidebarMenuButton
                  tooltip={name} aria-label={name}
                  disabled={!!busy}
                  isActive={menu === name}
                  onClick={() => {
                    setMenu(name);
                    setSkillSelection(undefined);
                    setAssetManagementKind('');
                    if (name === '创作工作台') {
                      const restored =
                        lastWorkbench.current.projectId === project.id
                          ? lastWorkbench.current.stage
                          : '分镜';
                      setStep(restored);
                      if (restored === '分镜') setRowView(true);
                    }
                    if (name === '资产中心') setStep('资产');
                    if (name === '剪辑输出') setStep('剪辑');
                  }}
                >
                  <Icon />
                  <span>{name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="系统设置" aria-label="系统设置" onClick={()=>setDirectorySettingsOpen(true)}>
                <Wrench /><span>系统设置</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {accessState.user?.role === 'super_admin' && <SidebarMenuItem><SidebarMenuButton tooltip="管理员后台" aria-label="管理员后台" disabled={!!busy} isActive={menu === '管理员后台'} onClick={(event)=>{setMenu('管理员后台');event.currentTarget.scrollIntoView({block:'nearest'});}}><ShieldCheck /><span>管理员后台</span></SidebarMenuButton></SidebarMenuItem>}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <div className="studio-note">
            <Sparkles size={18} />
            <b>让每一个想法成片</b>
            <p>创意有起点，创作无边界。</p>
          </div>
          <AccessProfile state={accessState}/>
        </SidebarFooter>
      </Sidebar>
      <main
        className={`workspace ${businessMode ? 'business-workspace' : ''} ${creativeMode ? 'creative-mode' : 'management-workspace'} ${creativeMode && step === '分镜' && rowView ? 'shot-sheet-mode' : ''}`}
      >
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger />
            <span>{menu}</span>
            {creativeMode && <><ChevronRight size={15} /><b>{project.title}</b></>}
          </div>
          <div className="topbar-tools">
          {creativeMode && <div className="save-state">
            {loading ? (
              '读取项目中'
            ) : busy ? (
              <>
                <LoaderCircle size={13} className="spin" />
                {busy}
              </>
            ) : dirty ? (
              '● 有未保存修改'
            ) : (
              <>
                <CheckCircle2 size={14} />
                已保存 {savedTime}
              </>
            )}
          </div>}
          <ThemeToggle />
          </div>
        </header>
        {creativeMode && <div className="project-heading">
          <div>
            <div className="eyebrow">SHORT FILM PROJECT</div>
            <h1>
              {project.title}{' '}
              <span className="tag">
                {project.ratio} · {project.style}
              </span>
            </h1>
            <p>{project.brief || '从一个想法开始，完成你的第一部短片。'}</p>
          </div>
          <div className="actions">
            {undo && (
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() => {
                  if (
                    project.changeLog?.at(-1)?.id !==
                      undo.changeLog?.at(-1)?.id &&
                    project.changeLog?.length
                  ) {
                    try {
                      setProject(undoLast(project));
                      setDirty(true);
                      setUndo(null);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : '撤销失败');
                    }
                    return;
                  }
                  setProject({
                    ...undo,
                    revision: project.revision,
                    updatedAt: project.updatedAt,
                  });
                  setDirty(true);
                  setUndo(null);
                }}
              >
                <RotateCcw />
                撤销上次操作
              </Button>
            )}
            <Button
              variant="outline"
              disabled={!!busy || loading}
              onClick={() =>
                action('保存项目', async () => {
                  await save();
                })
              }
            >
              <Save />
              保存
            </Button>
            <Button
              disabled={!!busy || loading}
              onClick={() => setDialog('export')}
            >
              <Download />
              导出
            </Button>
          </div>
        </div>}
        {(error || (creativeMode && notice)) && (
          <div
            className={error ? 'notice error' : 'notice'}
            role={error ? 'alert' : 'status'}
          >
            {error || notice}
            <button
              aria-label="关闭提示"
              onClick={() => {
                setError('');
                setNotice('');
              }}
            >
              ×
            </button>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          hidden
          onChange={(e) => fileChanged(e.target.files?.[0])}
        />
        {menu === '管理员后台' && accessState.user?.role === 'super_admin' ? <AdminConsole/> : <fieldset
          disabled={!!busy || loading}
          className={`studio-fieldset ${businessMode ? 'business-fieldset' : ''}`}
        >
          {creativeMode && <nav className="workflow" aria-label="创作阶段">
            {workflowStages.map((s, i) => (
              <button
                key={s}
                onClick={() => {
                  setStep(s);
                  setMenu('创作工作台');
                }}
                className={s === primaryStep && creativeMode ? 'active' : ''}
                aria-current={s === primaryStep ? 'step' : undefined}
              >
                <span>
                  {stageDone(s) ? (
                    <Check size={14} />
                  ) : (
                    String(i + 1).padStart(2, '0')
                  )}
                </span>
                <div>
                  <b>{s === '剪辑' ? '成品导出' : s}</b>
                  {creativeMode && (
                    <small>
                      {
                        (
                          {
                            创意: '灵感与主题',
                            故事: '故事结构与方案',
                            剧本: '撰写与优化',
                            分镜: '镜头、资产与生成',
                            剪辑: '预览与导出',
                          } as Record<string, string>
                        )[s]
                      }
                    </small>
                  )}
                </div>
                {i < workflowStages.length - 1 && (
                  <ChevronRight size={14} className="step-arrow" />
                )}
              </button>
            ))}
          </nav>}
          {creativeMode && primaryStep === '分镜' && (
            <nav className="production-subnav" aria-label="分镜制作工具">
              {(['分镜', '资产', '视频', '配音'] as Stage[]).map((s) => (
                <Button
                  key={s}
                  variant={step === s ? 'default' : 'outline'}
                  onClick={() => setStep(s)}
                >
                  {s === '分镜'
                    ? '分镜编辑'
                    : s === '资产'
                      ? '关联资产'
                      : s === '视频'
                        ? '视频素材与生成'
                        : '配音素材'}
                </Button>
              ))}
              <Button variant="outline" onClick={() => setStep('剪辑')}>
                预览与导出
                <ChevronRight />
              </Button>
            </nav>
          )}
          {creativeMode && <DirectorTools
            key={`${project.id}-${skillLaunch?.nonce || 0}`}
            launch={
              skillLaunch?.projectId === project.id ? skillLaunch : undefined
            }
            project={project}
            stage={step}
            shotId={shot?.id}
            disabled={!!busy || loading}
            onApply={(next, message) => {
              setUndo(structuredClone(project));
              setProject({
                ...next,
                shots: next.shots.map((s) => matchShotAssets(s, next.assets)),
              });
              setDirty(true);
              setNotice(message);
              setError('');
            }}
          />}
          {creativeMode && step === '分镜' && rowView && (
            <header className="sheet-heading">
              <div>
                <h1>分镜工作区</h1>
                <p>
                  每行是一个完整视频段，内部可包含多个子镜头 · 共
                  {project.shots.length}个分镜，
                  {Number(
                    project.shots
                      .reduce((sum, s) => sum + s.duration, 0)
                      .toFixed(3),
                  )}
                  秒
                </p>
              </div>
              <span className="sheet-save-state">
                {dirty ? '● 有未保存修改' : `已保存 ${savedTime}`}
              </span>
              <Button
                variant="outline"
                onClick={() =>
                  action('保存项目', async () => {
                    await save();
                  })
                }
              >
                <Save />
                保存
              </Button>
              <Button variant="outline" onClick={() => setStep('剪辑')}>
                <Film />
                预览全片
              </Button>
              <Button onClick={() => setDialog('export')}>
                <Download />
                导出分镜
                <ChevronRight />
              </Button>
            </header>
          )}
          <div
            className={`work-grid ${businessMode ? 'business-mode' : ''} ${(creativeMode && step === '资产') || menu === '资产中心' ? 'asset-mode' : ''} ${step === '分镜' && rowView && menu === '创作工作台' ? 'storyboard-mode' : ''}`}
          >
            <div className="main-panels">
              <AssetSync
                project={project}
                ready={model.text}
                enabled={!loading}
                visible={
                  creativeMode && (step === '剧本' || step === '资产')
                }
                onApply={(next) => {
                  setProject(next);
                  setDirty(true);
                }}
                onOpen={() => {
                  setMenu('资产中心');
                  setStep('资产');
                }}
              />
              {menu === '项目中心' ? (
                <section className="panel">
                  <Title
                    title="项目中心"
                    description="每个故事，拥有独立的创作空间"
                  >
                    <Button
                      onClick={() => {
                        setNewName('');
                        setDialog('project');
                      }}
                    >
                      <Plus />
                      新建项目
                    </Button>
                  </Title>
                  <div className="project-cards">
                    {projects.length === 0 ? (
                      <div className="empty-note">
                        <FolderOpen />
                        <h3>还没有保存的项目</h3>
                        <p>可以保存当前示例，或新建你的短片。</p>
                      </div>
                    ) : (
                      projects.map((p) => (
                        <button
                          className="project-card"
                          key={p.id}
                          onClick={() => choose(p)}
                        >
                          <Clapperboard />
                          <span className="tag">{p.ratio}</span>
                          <h3>{p.title}</h3>
                          <p>{p.brief || '尚未填写创意'}</p>
                          <small>
                            {p.shots.length} 个镜头 ·{' '}
                            {new Date(p.updatedAt).toLocaleDateString('zh-CN')}
                          </small>
                        </button>
                      ))
                    )}
                  </div>
                </section>
              ) : menu === 'Skill 中心' ? (
                <SkillCenter
                  key={project.id + (skillSelection?.field || '')}
                  selectionStage={skillSelection?.stage}
                  onBack={
                    skillSelection
                      ? () => {
                          setStep(skillSelection.returnStage);
                          setMenu('创作工作台');
                          setSkillSelection(undefined);
                        }
                      : undefined
                  }
                  project={project}
                  projects={projects}
                  disabled={!!busy || loading}
                  onChange={edit}
                  onUse={(skill) => {
                    if (skill.stage === '生图') {
                      edit({
                        assetImageSkillIds: {
                          ...project.assetImageSkillIds,
                          人物: skill.id,
                        },
                      });
                      setStep('分镜');
                      setMenu('创作工作台');
                      setAssetManagementKind('人物');
                      return;
                    }
                    if (skillSelection) {
                      edit({ [skillSelection.field]: skill.id });
                      setStep(skillSelection.returnStage);
                      setMenu('创作工作台');
                      setSkillSelection(undefined);
                      return;
                    }
                    if ([...stages, '分场'].includes(skill.stage))
                      setStep(skill.stage as Stage);
                    setMenu('创作工作台');
                    setSkillLaunch({
                      nonce: Date.now(),
                      skillId: skill.id,
                      projectId: project.id,
                    });
                  }}
                />
              ) : menu === '收益中心' || menu === '渠道代理' ? (
                <BusinessCenter key={menu} mode={menu} onNavigate={setMenu} />
              ) : menu === '模型设置' ? (
                <ModelSettings
                  onChanged={() =>
                    api<{ text: boolean; model: string }>('/api/ai')
                      .then(setModel)
                      .catch((e) => setError(e.message))
                  }
                />
              ) : menu === '任务中心' ? (
                <GenerationTasks
                  key={project.id}
                  project={project}
                  onApply={applyGeneration}
                  backgroundJobs={generationState.jobs}
                  onJob={generationState.record}
                />
              ) : step === '资产' || menu === '资产中心' ? (
                <AssetCenter
                  key={project.id}
                  project={project}
                  projects={projects}
                  disabled={!!busy || loading}
                  onChange={edit}
                  onUpload={upload}
                  onGenerate={setGenerationTarget}
                  onExport={() => {
                    setMenu('剪辑输出');
                    setStep('剪辑');
                  }}
                />
              ) : inputStage ? (
                <CreativeWorkspace
                  onOpenSkills={(field) => {
                    setSkillSelection({
                      field,
                      returnStage: step,
                      stage: {
                        creativeSkillId: '创意',
                        storySkillId: '故事',
                        scriptSkillId: '剧本',
                        shotSkillId: '分镜',
                      }[field],
                    });
                    setMenu('Skill 中心');
                  }}
                  key={`${project.id}-${step}`}
                  project={project}
                  stage={step as '创意' | '故事' | '剧本' | '分场'}
                  disabled={!!busy || loading}
                  onEdit={edit}
                  onGenerate={generate}
                  onStage={setStep}
                />
              ) : step === '剪辑' || menu === '剪辑输出' ? (
                <>
                  <SequencePreview
                    project={project}
                    onChangeLines={(shotId, lines) =>
                      editShot(
                        {
                          lines,
                          dialogue: lines.map((l) => l.text).join('\n'),
                        },
                        shotId,
                      )
                    }
                    onExport={() => setDialog('export')}
                    onEditShot={(id) => {
                      setSelected(id);
                      setMenu('创作工作台');
                      setStep('分镜');
                    }}
                  />
                  <section className="panel">
                    <Title
                      title="作品时间轴 / 剪辑编排"
                      description={`${project.shots.filter((s) => s.enabled).length} 个启用镜头 · 总时长 ${total.toFixed(1)} 秒`}
                    >
                      <Button onClick={() => setDialog('export')}>
                        <Download />
                        导出剪辑包
                      </Button>
                    </Title>
                    <div className="timeline-preview">
                      {project.shots
                        .filter((s) => s.enabled)
                        .map((s, i) => (
                          <div key={s.id} style={{ flex: s.duration }}>
                            <span>{String(i + 1).padStart(2, '0')}</span>
                            <b>{s.duration}s</b>
                          </div>
                        ))}
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {[
                            '使用',
                            '镜头',
                            '入点 / 秒',
                            '时长 / 秒',
                            '排序',
                          ].map((x) => (
                            <TableHead key={x}>{x}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {project.shots.map((s, i) => (
                          <TableRow key={s.id}>
                            <TableCell>
                              <Checkbox
                                aria-label={`启用镜头${i + 1}`}
                                checked={s.enabled}
                                onCheckedChange={(enabled) =>
                                  editShot({ enabled }, s.id)
                                }
                              />
                            </TableCell>
                            <TableCell>
                              {s.title}
                              <small className="block-muted">
                                {s.video
                                  ? '视频'
                                  : s.image
                                    ? '静帧画面'
                                    : '缺少画面'}
                                {s.audio ? ' · 独立配音' : ''}
                              </small>
                            </TableCell>
                            <TableCell>
                              <input
                                aria-label={`镜头${i + 1}入点`}
                                className="number-input"
                                type="number"
                                min="0"
                                max="86400"
                                value={s.trimStart}
                                onChange={(e) =>
                                  editShot(
                                    {
                                      trimStart: Math.max(
                                        0,
                                        Number(e.target.value),
                                      ),
                                    },
                                    s.id,
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <input
                                aria-label={`镜头${i + 1}时长`}
                                className="number-input"
                                type="number"
                                min="0.1"
                                max="120"
                                step="0.1"
                                value={s.duration}
                                onChange={(e) =>
                                  editShot(
                                    {
                                      duration: Math.max(
                                        0.1,
                                        Math.min(120, Number(e.target.value)),
                                      ),
                                    },
                                    s.id,
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <div className="actions">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={!i}
                                  aria-label={`上移镜头${i + 1}`}
                                  onClick={() => move(i, -1)}
                                >
                                  <ArrowUp />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={i === project.shots.length - 1}
                                  aria-label={`下移镜头${i + 1}`}
                                  onClick={() => move(i, 1)}
                                >
                                  <ArrowDown />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </section>
                  <section className="panel">
                    <Title
                      title="背景音乐"
                      description="导出时按 20% 音量与镜头原声或配音混合"
                    >
                      <Button variant="outline" onClick={() => upload('bgm')}>
                        <Upload />
                        上传 BGM
                      </Button>
                    </Title>
                    {project.bgm ? (
                      <div className="panel-body">
                        <audio src={project.bgm.url} controls>
                          <track
                            kind="captions"
                            label="背景音乐"
                            src="data:text/vtt,WEBVTT"
                          />
                        </audio>
                        <Button
                          variant="ghost"
                          onClick={() => edit({ bgm: undefined })}
                        >
                          移除 BGM
                        </Button>
                      </div>
                    ) : (
                      <p className="panel-foot">尚未添加背景音乐</p>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <section className="panel">
                    <Title
                      title={
                        step === '配音'
                          ? '对白与配音'
                          : step === '视频'
                            ? '镜头视频'
                            : '分镜列表'
                      }
                      description={`${project.shots.length} 个镜头 · 预计 ${total.toFixed(1)} 秒`}
                    >
                      <div className="actions">
                        {step === '分镜' && (
                          <Button
                            variant="outline"
                            onClick={() => setRowView(!rowView)}
                          >
                            {rowView ? '切换表格视图' : '切换组合视图'}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          onClick={() => generate('shots')}
                        >
                          <Sparkles />
                          AI 拆分镜头
                        </Button>
                        <Button variant="outline" onClick={addShot}>
                          <Plus />
                          新增
                        </Button>
                      </div>
                    </Title>
                    {!project.shots.length && !(step === '分镜' && rowView) ? (
                      <div className="empty-note">
                        <Film />
                        <h3>从第一个镜头开始</h3>
                        <p>手动新增镜头，或从剧本生成分镜。</p>
                      </div>
                    ) : step === '分镜' && rowView ? (
                      <StoryboardRows
                        onJob={recordGeneration}
                        generationJobs={generationState.jobs}
                        onImport={() =>
                          setSkillLaunch({
                            nonce: Date.now(),
                            projectId: project.id,
                            skillId: 'shot',
                            panel: 'import',
                          })
                        }
                        onOptimize={(target) => {
                          setSelected(target);
                          setSkillLaunch({
                            nonce: Date.now(),
                            projectId: project.id,
                            skillId: 'shot',
                            scope: 'shot',
                            instruction:
                              '优化当前分镜提示词，保留剧情、人物、台词与关联资产，明确构图、动作与运镜。',
                          });
                        }}
                        project={project}
                        onGenerate={setGenerationTarget}
                        onManageAssets={(kind) => {
                          setAssetManagementKind(kind);
                        }}
                        onApplyFrame={applyCapturedFrame}
                        onModelSettings={() => setMenu('模型设置')}
                        selectedId={shot?.id}
                        onActivate={setSelected}
                        disabled={!!busy || loading}
                        onEdit={(patch, target) => {
                          setSelected(target);
                          editShot(patch, target);
                        }}
                        onMove={move}
                        onInsert={(i) => {
                          const next = newShot();
                          const shots = [...project.shots];
                          shots.splice(i + 1, 0, next);
                          edit({ shots });
                          setSelected(next.id);
                        }}
                        onDelete={(target) => {
                          const before = structuredClone(project);
                          edit({
                            shots: project.shots.filter((s) => s.id !== target),
                          });
                          setUndo(before);
                          setNotice('镜头已删除，可撤销；素材文件仍保留');
                        }}
                        onSelect={(target) => {
                          setSelected(target);
                          setRowView(false);
                        }}
                        onUpload={upload}
                      />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {['镜头', '画面内容', '时长', '景别', '状态'].map(
                              (x) => (
                                <TableHead key={x}>{x}</TableHead>
                              ),
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {project.shots.map((s, i) => (
                            <TableRow
                              key={s.id}
                              className={
                                s.id === shot?.id ? 'selected-row' : ''
                              }
                            >
                              <TableCell>
                                <button
                                  className="shot-code"
                                  onClick={() => setSelected(s.id)}
                                >
                                  SHOT_{String(i + 1).padStart(3, '0')}
                                </button>
                              </TableCell>
                              <TableCell>
                                <button
                                  className="shot-title"
                                  onClick={() => setSelected(s.id)}
                                >
                                  {s.title}
                                </button>
                              </TableCell>
                              <TableCell>{s.duration}s</TableCell>
                              <TableCell>{s.size}</TableCell>
                              <TableCell>
                                <span className={s.video ? 'tag' : 'status'}>
                                  {s.reviewRequired
                                    ? '待复核'
                                    : s.video
                                      ? '视频就绪'
                                      : s.image
                                        ? '画面就绪'
                                        : '待制作'}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </section>
                  {shot && !(step === '分镜' && rowView) && (
                    <section className="panel">
                      <Title
                        title={`当前镜头 · SHOT_${String(shotIndex + 1).padStart(3, '0')}`}
                        description="独立编辑每个镜头的画面、声音和参考设定"
                      >
                        <Button
                          variant="ghost"
                          aria-label="复制当前镜头"
                          onClick={() => {
                            const s = {
                              ...structuredClone(shot),
                              id: id(),
                              title: shot.title + ' · 副本',
                            };
                            edit({ shots: [...project.shots, s] });
                            setSelected(s.id);
                          }}
                        >
                          <Copy />
                          复制
                        </Button>
                      </Title>
                      {shot.reviewRequired && (
                        <div className="notice">
                          {shot.reviewRequired}
                          <Button
                            variant="ghost"
                            onClick={() =>
                              editShot({ reviewRequired: undefined })
                            }
                          >
                            已人工复核
                          </Button>
                        </div>
                      )}
                      <div className="shot-workspace">
                        <div>
                          <Field
                            label="镜头标题"
                            value={shot.title}
                            onChange={(title) => editShot({ title })}
                          />
                          <Field
                            label="画面描述"
                            value={shot.description}
                            rows={4}
                            onChange={(description) =>
                              editShot({ description })
                            }
                          />
                          <div className="field-grid">
                            <div className="field">
                              <span>景别</span>
                              <Picker
                                label="景别"
                                value={shot.size}
                                options={[
                                  '远景',
                                  '全景',
                                  '中景',
                                  '近景',
                                  '特写',
                                ]}
                                onChange={(size) => editShot({ size })}
                              />
                            </div>
                            <label>
                              时长 / 秒
                              <input
                                type="number"
                                min="0.1"
                                max="120"
                                step="0.1"
                                value={shot.duration}
                                onChange={(e) =>
                                  editShot({
                                    duration: Math.max(
                                      0.1,
                                      Math.min(120, Number(e.target.value)),
                                    ),
                                  })
                                }
                              />
                            </label>
                          </div>
                          <div className="field-grid">
                            <Field
                              label="人物"
                              value={shot.character}
                              onChange={(character) => editShot({ character })}
                            />
                            <Field
                              label="场景"
                              value={shot.scene}
                              onChange={(scene) => editShot({ scene })}
                            />
                          </div>
                          <Field
                            label="机位 / 运镜"
                            value={shot.camera}
                            onChange={(camera) => editShot({ camera })}
                          />
                        </div>
                        <div className="media-column">
                          {step === '视频' && shot.video ? (
                            <video
                              key={shot.video.id}
                              src={shot.video.url}
                              controls
                              className="media-preview"
                            >
                              <track
                                kind="captions"
                                label="对白"
                                srcLang="zh"
                                src={caption(shot)}
                              />
                            </video>
                          ) : shot.image ? (
                            <Image
                              unoptimized
                              width={640}
                              height={360}
                              className="media-preview"
                              src={shot.image.url}
                              alt={shot.title}
                            />
                          ) : (
                            <div className="frame-empty">
                              <ImageIcon size={32} />
                              <b>为这个镜头添加画面</b>
                              <p>上传关键帧，建立视觉参考</p>
                              <Button
                                variant="outline"
                                onClick={() => upload('image', shot.id)}
                              >
                                <Upload />
                                上传参考图
                              </Button>
                            </div>
                          )}
                          <div className="actions">
                            <Button
                              variant="outline"
                              onClick={() => upload('image', shot.id)}
                            >
                              <ImageIcon />
                              {shot.image ? '替换参考图' : '参考图'}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => upload('video', shot.id)}
                            >
                              <Film />
                              {shot.video ? '替换视频' : '导入视频'}
                            </Button>
                          </div>
                          {shot.video && step !== '视频' && (
                            <video
                              key={shot.video.id}
                              src={shot.video.url}
                              controls
                              className="media-preview small"
                            >
                              <track
                                kind="captions"
                                label="对白"
                                srcLang="zh"
                                src={caption(shot)}
                              />
                            </video>
                          )}
                          <p className="helper">
                            支持 JPG / PNG / WebP、MP4 / WebM；单个文件不超过 50
                            MB。
                          </p>
                        </div>
                      </div>
                      <div className="panel-body border-top">
                        <FirstFrameControl
                          shot={shot}
                          disabled={!!busy || loading}
                          onUpload={() => upload('firstFrame', shot.id)}
                          onRemove={() =>
                            editShot(
                              {
                                firstFrame: undefined,
                                firstFrameSource: undefined,
                              },
                              shot.id,
                            )
                          }
                        />
                        <div className="actions">
                          <strong>分镜资产匹配</strong>
                          <Button
                            variant="outline"
                            onClick={() =>
                              editShot(matchShotAssets(shot, project.assets))
                            }
                          >
                            按镜头内容匹配
                          </Button>
                        </div>
                        <p className="helper">
                          按名称匹配并保留已选资产，可逐类调整；同角色不同服装需分别确认。声音样本用于保持音色，镜头配音仍单独管理。
                        </p>
                        {assetKinds.map((kind) => (
                          <div key={kind}>
                            <p className="helper">
                              {kind} · 已选{' '}
                              {
                                project.assets.filter(
                                  (a) =>
                                    a.kind === kind &&
                                    shot.references.includes(a.id),
                                ).length
                              }
                            </p>
                            <div className="reference-list">
                              {project.assets
                                .filter((a) => a.kind === kind)
                                .map((a) => (
                                  <label key={a.id}>
                                    <Checkbox
                                      checked={shot.references.includes(a.id)}
                                      onCheckedChange={(checked) =>
                                        editShot({
                                          references: checked
                                            ? [...shot.references, a.id]
                                            : shot.references.filter(
                                                (x) => x !== a.id,
                                              ),
                                        })
                                      }
                                    />
                                    {a.name}
                                    <small>{a.kind}</small>
                                  </label>
                                ))}
                              {!project.assets.some((a) => a.kind === kind) && (
                                <span className="helper">
                                  暂无{kind}资产，请在资产中心补充
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                        {shot.assetNames
                          ?.filter(
                            (n) =>
                              !project.assets.some(
                                (a) => a.kind === n.kind && a.name === n.name,
                              ),
                          )
                          .map((n) => (
                            <p className="helper" key={n.kind + n.name}>
                              待建立资产：{n.kind} / {n.name}
                            </p>
                          ))}
                        <Field
                          label="对白 / 字幕"
                          value={shot.dialogue}
                          onChange={(dialogue) => editShot({ dialogue })}
                        />
                        <div className="actions">
                          <Button
                            variant="outline"
                            onClick={() => upload('audio', shot.id)}
                          >
                            <Music2 />
                            {shot.audio ? '替换配音' : '导入配音'}
                          </Button>
                          {shot.audio && (
                            <audio controls src={shot.audio.url}>
                              <track
                                kind="captions"
                                label="对白"
                                src={caption(shot)}
                              />
                            </audio>
                          )}
                        </div>
                        <div className="actions">
                          <Button
                            onClick={() =>
                              setGenerationTarget({
                                id: shot.id,
                                kind: 'image',
                              })
                            }
                          >
                            生成镜头图片
                          </Button>
                          <Button
                            onClick={() =>
                              setGenerationTarget({
                                id: shot.id,
                                kind: 'video',
                              })
                            }
                          >
                            生成镜头视频
                          </Button>
                        </div>
                        <Field
                          label="视频提示词"
                          value={shot.prompt}
                          rows={4}
                          onChange={(prompt) => editShot({ prompt })}
                        />
                        <div className="actions">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setUndo(structuredClone(project));
                              editShot({
                                prompt: compilePrompt(project, shot),
                              });
                            }}
                          >
                            <Layers3 />
                            从镜头设定组装
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => generate('prompt')}
                          >
                            <Sparkles />
                            AI 优化
                          </Button>
                        </div>
                        <p className="helper">
                          “组装”按已填写的设定生成文本，不调用模型。AI
                          优化需要配置文本模型。
                        </p>
                      </div>
                    </section>
                  )}
                  <section className="panel">
                    <Title
                      title="故事时间线"
                      description="选择镜头，继续完善故事"
                    >
                      <Button variant="ghost" onClick={() => setStep('剪辑')}>
                        进入剪辑
                        <ChevronRight />
                      </Button>
                    </Title>
                    <div className="timeline-preview">
                      {project.shots
                        .filter((s) => s.enabled)
                        .map((s, i) => (
                          <div key={s.id} style={{ flex: s.duration }}>
                            <button onClick={() => setSelected(s.id)}>
                              {String(i + 1).padStart(2, '0')} · {s.size}
                            </button>
                            <b>{s.duration}s</b>
                          </div>
                        ))}
                    </div>
                  </section>
                </>
              )}
            </div>
            {creativeMode && (
              <WorkflowAssistant
                onInsert={
                  project.shots.length >= 200
                    ? undefined
                    : () => {
                        const s = newShot();
                        const list = [...project.shots];
                        list.splice(
                          shot
                            ? list.findIndex((x) => x.id === shot.id) + 1
                            : list.length,
                          0,
                          s,
                        );
                        edit({ shots: list });
                        setSelected(s.id);
                      }
                }
                key={`${project.id}-${step}`}
                project={project}
                stage={step}
                onStage={setStep}
                onUse={(skillId, instruction) =>
                  setSkillLaunch({
                    nonce: Date.now(),
                    projectId: project.id,
                    skillId,
                    instruction,
                    scope:
                      step === '分镜' && shot
                        ? 'shot'
                        : step === '剪辑'
                          ? 'project'
                          : 'stage',
                  })
                }
              />
            )}
          </div>
        </fieldset>}
      </main>
      <ImageBatchStatus
        batches={imageBatches.batches}
        onResults={async (batch) => {
          if (lock.current) throw Error('请等待当前保存操作完成');
          lock.current = true;
          setBusy('打开生成结果');
          try {
            if (current.current.id !== batch.projectId) {
              if (isDirty.current) await save();
              const all = await api<Project[]>('/api/projects');
              const original = all.find((p) => p.id === batch.projectId);
              if (!original) throw Error('原项目已不存在，无法打开任务结果');
              setProjects(all);
              setProject(original);
              setDirty(false);
              setUndo(null);
              setSelected(original.shots[0]?.id || '');
            }
            setAssetManagementKind('');
            setGenerationTarget(null);
            setMenu('任务中心');
          } finally {
            lock.current = false;
            setBusy('');
          }
        }}
      />
      {generationTarget && (
        <GenerationDialog
          key={project.id + generationTarget.id + generationTarget.kind}
          project={project}
          target={generationTarget}
          onNotice={setNotice}
          onJob={recordGeneration}
          onBeforeSubmit={async () => {
            if (isDirty.current) await save();
          }}
          onClose={() => setGenerationTarget(null)}
          onTasks={() => {
            setAssetManagementKind('');
            setMenu('任务中心');
          }}
        />
      )}
      {assetManagementKind && (
        <ProjectAssetDialog
          key={project.id + assetManagementKind}
          open={!generationTarget}
          kind={assetManagementKind}
          generationJobs={generationState.jobs}
          onBatch={(request) => {
            imageBatches.start(request);
            setNotice(
              `已开始后台生成 ${request.items.length} 项图片，可以继续创作，完成后会弹窗提醒。`,
            );
          }}
          project={project}
          projects={projects}
          disabled={!!busy || loading}
          onClose={() => setAssetManagementKind('')}
          onChange={edit}
          onSave={async () => {
            await save();
          }}
          onUpload={upload}
          onGenerate={setGenerationTarget}
          onTasks={() => {
            setAssetManagementKind('');
            setMenu('任务中心');
          }}
        />
      )}
      <Dialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open && !busy) setDialog('');
        }}
      >
        <DialogContent
          className={dialog === 'ai' ? 'studio-dialog wide' : 'studio-dialog'}
        >
          <DialogHeader>
            <DialogTitle>
              {
                (
                  {
                    project: '新建短片项目',
                    asset: '新增创作资产',
                    export: '导出项目',
                    ai: '审阅 AI 结果',
                    check: '连续性规则检查',
                  } as Record<string, string>
                )[dialog]
              }
            </DialogTitle>
            <DialogDescription>
              {dialog === 'export'
                ? '保存你的创作数据，或打包素材进入成片制作。'
                : dialog === 'ai'
                  ? '检查结果后应用到项目。应用不会直接发起图片或视频生成。'
                  : '修改会进入当前项目，点击保存后持久保存。'}
            </DialogDescription>
          </DialogHeader>
          {dialog === 'project' && (
            <>
              <Field label="项目名称" value={newName} onChange={setNewName} />
              <Button
                disabled={!!busy || !newName.trim()}
                onClick={() =>
                  action('创建项目', async () => {
                    if (dirty) await save();
                    const p = await save(newProject(newName.trim()));
                    setProject(p);
                    setStep('创意');
                    setMenu('创作工作台');
                    setSelected('');
                    setDialog('');
                  })
                }
              >
                创建项目
              </Button>
            </>
          )}
          {dialog === 'asset' && (
            <>
              <Field label="资产名称" value={newName} onChange={setNewName} />
              <Picker
                label="资产类型"
                value={assetKind}
                options={[...assetKinds]}
                onChange={setAssetKind}
              />
              <Button
                disabled={!newName.trim()}
                onClick={() => {
                  const a: Asset = {
                    id: id(),
                    name: newName.trim(),
                    kind: assetKind,
                    description: '',
                  };
                  edit({ assets: [...project.assets, a] });
                  setDialog('');
                }}
              >
                添加资产
              </Button>
            </>
          )}
          {dialog === 'check' && (
            <div className="checks">
              {issues.length ? (
                issues.map((x, i) => (
                  <p key={i}>
                    {i + 1}. {x}
                  </p>
                ))
              ) : (
                <p>未发现设定缺项。</p>
              )}
              <p className="helper">
                本版检查描述、引用与对白时长，不对实际画面的一致性作保证。
              </p>
            </div>
          )}
          {dialog === 'ai' && (
            <>
              {error && (
                <p role="alert" className="error-banner">
                  {error}
                </p>
              )}
              <textarea
                aria-label="AI生成结果"
                disabled={!!busy}
                rows={16}
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
              />
              {aiTask === 'shots' && (
                <p className="helper">
                  {aiStoryboard
                    ? `已识别${aiStoryboard.segments}个视频段，共${aiStoryboard.seconds}秒；内部子镜头保留在各段中，随附${aiStoryboard.assets}项项目资产。应用后追加到现有分镜。`
                    : '当前结果尚未通过分镜结构校验，应用时将尝试一次AI格式转换；转换失败则保留原内容。'}
                </p>
              )}
              <Button
                onClick={applyAi}
                disabled={!!busy || !aiText.trim()}
              >
                应用到项目
              </Button>
            </>
          )}
          {dialog === 'export' && (
            <div className="export-options">
              <Button
                disabled={!!busy}
                onClick={() =>
                  action('正在导出剪映草稿', async () => {
                    const result = await exportJianyingDraft(project);
                    setNotice(
                      `剪映草稿已导出：${result.path}。请在剪映首页打开该草稿。`,
                    );
                    setDialog('');
                  })
                }
              >
                <Download />
                导出到剪映草稿
              </Button>
              <Button
                variant="outline"
                onClick={() => setDirectorySettingsOpen(true)}
              >
                设置剪映草稿 / 项目文件位置
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  download(
                    'storyboard.json',
                    JSON.stringify(exportStoryboard(project), null, 2),
                  )
                }
              >
                <FileText />
                下载分镜 JSON
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  download('project.json', JSON.stringify(project, null, 2))
                }
              >
                <FileText />
                下载项目 JSON
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  download(
                    'subtitles.srt',
                    subtitle(project),
                    'text/plain;charset=utf-8',
                  )
                }
              >
                <FileText />
                下载字幕 SRT
              </Button>
              <Button
                disabled={!!busy}
                onClick={() =>
                  action('正在打包素材', async () => {
                    await exportKit(project);
                    setNotice('剪辑包已下载');
                    setDialog('');
                  })
                }
              >
                <Download />
                下载完整剪辑包
              </Button>
              <p>
                剪辑包包含素材、项目、字幕和本机渲染工具。使用 Python + FFmpeg
                输出
                MP4。桌面版可直接导出剪映草稿，保留画面、配音、字幕和背景音乐轨道。若剪映首页未刷新，请保存当前剪映工程后重新打开剪映。
              </p>
              {project.shots.some((s) => s.enabled && !s.video && !s.image) && (
                <p className="warning">
                  部分启用镜头还没有画面，可先下载项目，补齐后再渲染。
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <DirectorySettings
        open={directorySettingsOpen}
        onOpenChange={setDirectorySettingsOpen}
      />
    </SidebarProvider>
    </>
  );
}
