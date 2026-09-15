'use client';
import { modelApi } from './model-settings';
import { ModelPicker } from './model-picker';
import { BusinessSelect } from './skill-center';
import { assetImageSkills } from '@/lib/asset-image-skill';
import {
  defaultBlockingSkill,
  blockingImageSkill,
  blockingImagePrompt,
  latestBlockingJob,
  blockingJobActive,
} from '@/lib/blocking-image';
import {
  latestVideoJob,
  selectedVideoActive,
  manualVideoPatch,
} from '@/lib/video-generation';
import type { GenerationJob } from '@/lib/models';
import type { ModelConfig } from '@/lib/models';
import type { GenerationTarget } from './generation-tools';
import { useState, useEffect, useRef } from 'react';
import { doubaoCommand, doubaoJobPaused, type DoubaoSnapshot } from '@/lib/doubao-manager';
import { doubaoModels, doubaoRatios } from '@/lib/doubao';
import { ShotAssetThumbnails } from './shot-asset-thumbnails';
import { AssetImagePreview } from './asset-image-preview';
import { SpeechControls } from './speech-controls';
import { DoubaoControls } from './doubao-controls';
import { useDoubaoTaskPreview } from './doubao-task-preview';
import type { Media } from '@/lib/studio';
import { PromptEditor } from '@/components/prompt-editor';
import { FirstFrameControl } from '@/components/first-frame-control';
import { ShotVideoPreview } from '@/components/shot-video-preview';
import { VideoFileButton } from './video-file-button';
import type { FrameTarget } from '@/lib/frame-reference';
import Image from 'next/image';
import {
  LoaderCircle,
  Pause,
  Plus,
  ArrowUp,
  ArrowDown,
  Upload,
  Copy,
  ImageIcon,
  Sparkles,
  Users,
  Box,
  Shirt,
  Mic,
  Grid2X2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { type Project, type Shot, shotVisualText } from '@/lib/studio';
import { assetKinds, matchShotAssets } from '@/lib/assets';
import {
  dialogueLines,
  dialogueText,
  newLine,
  type DialogueLine,
} from '@/lib/dialogue';

function Choice({
  label,
  value,
  options,
  onChange,
  placeholder = '未指定',
}: {
  placeholder?: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const items = [...new Set([value, ...options])].filter(Boolean);
  return (
    <Select
      value={value || '未指定'}
      onValueChange={(v) => v && onChange(v === '未指定' ? '' : v)}
    >
      <SelectTrigger aria-label={label} title={value || placeholder}>
        <SelectValue>{value || placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {[...new Set(['未指定', ...items])].map((v) => (
          <SelectItem key={v} value={v}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function StoryboardRows({
  project,
  generationJobs,
  onJob,
  disabled,
  onEdit,
  onMove,
  onInsert,
  onDelete,
  onSelect,
  onActivate,
  selectedId,
  onUpload,
  onModelSettings,
  onApplyFrame,
  onGenerate,
  onImport,
  onOptimize,
  onManageAssets,
}: {
  onManageAssets: (kind: string) => void;
  onImport: () => void;
  onOptimize: (shotId: string) => void;
  onGenerate: (target: GenerationTarget) => void;
  project: Project;
  generationJobs: GenerationJob[];
  onJob: (job: GenerationJob) => void;
  disabled: boolean;
  onEdit: (patch: Partial<Shot>, shotId: string) => void;
  onMove: (index: number, delta: number) => void;
  onInsert: (index: number) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  onActivate: (id: string) => void;
  selectedId?: string;
  onUpload: (
    kind: 'image' | 'video' | 'audio' | 'blockingImage' | 'firstFrame',
    id: string,
  ) => void;
  onModelSettings: () => void;
  onApplyFrame: (file: File, target: FrameTarget) => Promise<void>;
}) {
  const [assetDialog, setAssetDialog] = useState<{
    shotId: string;
    kind: string;
  } | null>(null);
  const [message, setMessage] = useState('');
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [doubao, setDoubao] = useState<DoubaoSnapshot>();
  const doubaoPreview = useDoubaoTaskPreview(state => {setDoubao(state);setMessage('已确认并加入豆包队列，完成后返回本分镜。');});
  const submittingDoubao = useRef(new Set<string>());
  const [doubaoPending, setDoubaoPending] = useState<string[]>([]);
  useEffect(() => {
    if (!window.directorDesktop?.doubao) return;
    let disposed = false;
    const load = () => void doubaoCommand().then(s => { if (!disposed) setDoubao(s); }).catch(() => {});
    load(); const timer = setInterval(load, 4000);
    window.addEventListener('director-doubao-change', load);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('director-doubao-change', load); };
  }, []);
  const doubaoGroups = [...new Set(doubao?.accounts.filter(a => a.enabled && doubao.participatingAccountIds?.includes(a.id)).map(a => a.group) || [])];
  async function submitDoubao(s: Shot) {
    if (submittingDoubao.current.has(s.id)) return;
    submittingDoubao.current.add(s.id); setDoubaoPending([...submittingDoubao.current]);
    try {
      const state = await doubaoCommand();
      setDoubao(state);
      await doubaoPreview.open(project, [s.id], {group:s.doubaoGroup,onGroupSelected:group=>onEdit({doubaoGroup:group},s.id)});
    } catch (e) { setMessage((e as Error).message); if ((e as Error).message.includes('调用')) setBatch('doubao'); }
    finally { submittingDoubao.current.delete(s.id); setDoubaoPending([...submittingDoubao.current]); }
  }
  useEffect(() => {
    modelApi<ModelConfig[]>('/api/models')
      .then(setModels)
      .catch((e) => setMessage(e.message));
  }, []);
  const [assetPreview, setAssetPreview] = useState<{
    media: Media;
    name: string;
  } | null>(null);
  const [blockingId, setBlockingId] = useState('');
  const [blockingPreview, setBlockingPreview] = useState(false);
  const [previewId, setPreviewId] = useState('');
  const [checked, setChecked] = useState<string[]>([]);
  const [batch, setBatch] = useState('');
  const [dubbing, setDubbing] = useState<{
    shotId: string;
    lineId: string;
  } | null>(null);
  const dubbingShot = project.shots.find((s) => s.id === dubbing?.shotId);
  const dubbingLines = dubbingShot
    ? dialogueLines(
        dubbingShot,
        project.assets.filter((a) => a.kind === '人物').map((a) => a.name),
      )
    : [];
  const dubbingLine = dubbingLines.find((l) => l.id === dubbing?.lineId);
  const dubbingRole = project.assets.find(
    (a) => a.kind === '人物' && a.name === dubbingLine?.speaker,
  );
  const dubbingVoice = project.assets.find(
    (a) =>
      a.kind === '声音' &&
      (dubbingLine?.voiceName
        ? a.name === dubbingLine.voiceName
        : a.id === dubbingRole?.attributes?.声音资产),
  );
  const checkedShots = project.shots.filter((s) => checked.includes(s.id));

  const blockingShot = project.shots.find((s) => s.id === blockingId);
  const blockingJob = latestBlockingJob(generationJobs, project.id, blockingId);
  const blockingActive = blockingJobActive(blockingJob);
  const blockingSkills = assetImageSkills(project);
  const [blockingError, setBlockingError] = useState('');

  function blockingBrief(s: Shot) {
    return `为当前分镜制作单帧站位参考图，画幅${project.ratio}。明确人物位置、朝向、彼此距离、道具位置和摄影机视角。保持参考资产的角色造型与服饰，不添加无关人物。\n场景：${s.scene || '按镜头正文确定'}\n景别与机位：${s.size}，${s.camera}\n镜头正文：${shotVisualText(s)}\n关联设定：${project.assets
      .filter(
        (a) =>
          s.references.includes(a.id) &&
          ['人物', '场景', '道具', '服饰'].includes(a.kind),
      )
      .map((a) => `${a.kind}/${a.name}：${a.description}`)
      .join('；')}`.slice(0, 10000);
  }
  const target = project.shots.find((s) => s.id === assetDialog?.shotId);
  function updateLines(s: Shot, lines: DialogueLine[]) {
    if (dialogueText(lines).length > 10000) {
      setMessage('每镜台词最多10000字');
      return;
    }
    const references = new Set(s.references);
    for (const line of lines)
      for (const a of project.assets)
        if (
          (a.kind === '人物' && a.name === line.speaker) ||
          (a.kind === '声音' && a.name === line.voiceName)
        )
          references.add(a.id);
    onEdit(
      { lines, dialogue: dialogueText(lines), references: [...references] },
      s.id,
    );
  }
  return (
    <div className="storyboard-rows">
      {doubaoPreview.dialog}
      <div className="sheet-toolbar">
        <Button variant="outline" onClick={onImport}>
          <Upload />
          导入分镜
        </Button>
        {[
          { kind: '人物', label: '角色管理', Icon: Users },
          { kind: '场景', label: '场景管理', Icon: Shirt },
          { kind: '道具', label: '道具管理', Icon: Box },
        ].map(({ kind, label, Icon }) => (
          <Button
            key={kind}
            variant="outline"
            disabled={disabled}
            onClick={() => onManageAssets(kind)}
          >
            <Icon />
            {label}
          </Button>
        ))}
        <Button variant="outline" onClick={() => setBatch('audio')}>
          <Mic />
          批量配音
        </Button>
        <Button variant="outline" onClick={() => setBatch('blocking')}>
          <ImageIcon />
          批量站位图
        </Button>
        <Button variant="outline" onClick={() => setBatch('doubao')}>
          <Grid2X2 />
          豆包插件
        </Button>
      </div>
      <div className="sheet-scroll">
        <div className="sheet-column-head">
          <Checkbox
            aria-label="选择全部分镜"
            checked={
              !!project.shots.length &&
              checkedShots.length === project.shots.length
            }
            onCheckedChange={(v) =>
              setChecked(v ? project.shots.map((s) => s.id) : [])
            }
          />
          <span>分镜序号</span>
          <span>台词</span>
          <span>角色/道具/场景/站位图</span>
          <span>提示词</span>
          <span>视频</span>
          <span>操作</span>
        </div>
        {message && <output className="row-message">{message}</output>}
        {project.shots.map((s, i) => {
          const job = latestBlockingJob(generationJobs, project.id, s.id);
          const generatingBlocking = blockingJobActive(job);
          const pluginJob = [...(doubao?.jobs || [])].reverse().find(j => j.projectId === project.id && j.shotId === s.id);
          const pluginActive = s.videoModelId === 'doubao' && selectedVideoActive('doubao', undefined, pluginJob);
          const pluginFailed = s.videoModelId === 'doubao' && pluginJob?.status === 'failed';
          const pluginAttention = s.videoModelId === 'doubao' && pluginJob?.status === 'attention';
          const videoJob = s.videoModelId === 'doubao' ? pluginJob : latestVideoJob(generationJobs, project.id, s.id);
          const generatingVideo = selectedVideoActive(s.videoModelId, latestVideoJob(generationJobs, project.id, s.id), pluginJob) || (s.videoModelId === 'doubao' && doubaoPending.includes(s.id));
          const doubaoPaused = s.videoModelId === 'doubao' && !!doubao?.paused;
          const pluginPaused = s.videoModelId === 'doubao' && doubaoJobPaused(pluginJob, !!doubao?.paused);
          const canResumeDoubao = doubaoPaused && (!pluginActive || pluginPaused);
          const videoStatus =
            pluginPaused ? '已暂停' : videoJob?.status === 'downloading' ? '下载中' : pluginActive && pluginJob?.status === 'queued' ? '排队中' : pluginActive && pluginJob?.generationAcceptedAt ? '等待视频返回' : '生成中';
          const lines = dialogueLines(
            s,
            project.assets.filter((a) => a.kind === '人物').map((a) => a.name),
          );
          const refs = project.assets.filter((a) =>
            s.references.includes(a.id),
          );
          return (
            <article
              className={`storyboard-row ${selectedId === s.id ? 'is-selected' : ''}`}
              key={s.id}
              aria-label={`分镜${i + 1}`}
            >
              <fieldset disabled={disabled} className="storyboard-row-body">
                <div className="sheet-check">
                  <Checkbox
                    aria-label={`选择分镜${i + 1}`}
                    checked={checked.includes(s.id)}
                    onCheckedChange={(v) =>
                      setChecked(
                        v
                          ? [...checked.filter((id) => id !== s.id), s.id]
                          : checked.filter((id) => id !== s.id),
                      )
                    }
                  />
                </div>
                <button
                  className="sheet-shot-name"
                  onClick={() => onSelect(s.id)}
                  title={s.title}
                >
                  分镜{i + 1}
                  <small>{s.reviewRequired ? '待复核' : ''}</small>
                </button>
                <div className="dialogue-column">
                  <div className="row-column-heading">
                    台词与声音 <span>{lines.length} 条</span>
                  </div>
                  <div className="dialogue-stack">
                    {!lines.length && s.dialogue.trim() && (
                      <p className="helper">
                        此段无人物台词，声音说明保留在分镜正文中。
                      </p>
                    )}
                    {lines.map((line, n) => (
                      <section className="dialogue-card" key={line.id}>
                        <div className="dialogue-controls">
                          <Choice
                            label={`第${n + 1}条台词类型`}
                            value={line.kind}
                            options={['台词', '旁白']}
                            onChange={(v) =>
                              v &&
                              updateLines(
                                s,
                                lines.map((x, j) =>
                                  j === n
                                    ? { ...x, kind: v as DialogueLine['kind'] }
                                    : x,
                                ),
                              )
                            }
                          />
                          <Choice
                            label={`第${n + 1}条说话角色`}
                            placeholder="选择角色"
                            value={line.speaker}
                            options={project.assets
                              .filter((a) => a.kind === '人物')
                              .map((a) => a.name)}
                            onChange={(speaker) => {
                              const role = project.assets.find(
                                (a) => a.kind === '人物' && a.name === speaker,
                              );
                              const voice = project.assets.find(
                                (a) =>
                                  a.kind === '声音' &&
                                  a.id === role?.attributes?.声音资产,
                              );
                              updateLines(
                                s,
                                lines.map((x, j) =>
                                  j === n
                                    ? {
                                        ...x,
                                        speaker,
                                        voiceName: voice?.name || '',
                                      }
                                    : x,
                                ),
                              );
                            }}
                          />
                          <Choice
                            label={`第${n + 1}条音色资产绑定`}
                            placeholder="绑定音色"
                            value={line.voiceName}
                            options={project.assets
                              .filter((a) => a.kind === '声音')
                              .map((a) => a.name)}
                            onChange={(voiceName) =>
                              updateLines(
                                s,
                                lines.map((x, j) =>
                                  j === n ? { ...x, voiceName } : x,
                                ),
                              )
                            }
                          />
                          <Button
                            variant="outline"
                            className="line-preview-button"
                            title={
                              line.audio
                                ? '配音已生成，点击试听或重新生成'
                                : '配音设置'
                            }
                            aria-label={`第${n + 1}条配音`}
                            onClick={() =>
                              setDubbing({ shotId: s.id, lineId: line.id })
                            }
                          >
                            {line.speechPendingId &&
                            generationJobs.some(
                              (j) =>
                                j.id === line.speechPendingId &&
                                j.status === 'submitting',
                            ) ? (
                              <LoaderCircle className="animate-spin" />
                            ) : (
                              <Mic />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            className="line-delete-button"
                            title="删除此条台词"
                            aria-label={`删除第${n + 1}条台词`}
                            onClick={() =>
                              updateLines(
                                s,
                                lines.filter((_, j) => j !== n),
                              )
                            }
                          >
                            <X />
                          </Button>
                        </div>
                        <textarea
                          aria-label={`镜头${i + 1}第${n + 1}条台词`}
                          rows={3}
                          maxLength={10000}
                          value={line.text}
                          onChange={(e) =>
                            updateLines(
                              s,
                              lines.map((x, j) =>
                                j === n
                                  ? {
                                      ...x,
                                      text: e.target.value,
                                      audio: undefined,
                                      speechPendingId: undefined,
                                      speechGenerationId: undefined,
                                    }
                                  : x,
                              ),
                            )
                          }
                          placeholder="输入台词或旁白…"
                        />
                      </section>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    className="add-dialogue"
                    disabled={lines.length >= 40}
                    onClick={() =>
                      updateLines(s, [
                        ...lines,
                        {
                          ...newLine(),
                          speaker:
                            s.character.split(/[、,，]/).filter(Boolean)
                              .length === 1
                              ? s.character
                              : '',
                        },
                      ])
                    }
                  >
                    <Plus />
                    添加台词
                  </Button>
                </div>
                <div className="asset-rail">
                  <div className="row-column-heading">资产</div>
                  {assetKinds
                    .filter((k) => ['人物', '场景', '道具'].includes(k))
                    .map((kind) => {
                      const assets = refs.filter((a) => a.kind === kind);
                      return (
                        <ShotAssetThumbnails
                          key={kind}
                          kind={kind}
                          assets={assets}
                          onPick={() => setAssetDialog({ shotId: s.id, kind })}
                          onRemove={(id) =>
                            onEdit(
                              {
                                references: s.references.filter(
                                  (ref) => ref !== id,
                                ),
                              },
                              s.id,
                            )
                          }
                          onPreview={(media, name) =>
                            setAssetPreview({ media, name })
                          }
                        />
                      );
                    })}
                  <button
                    className="asset-rail-item"
                    onClick={() => {
                      onActivate(s.id);
                      setBlockingId(s.id);
                    }}
                    aria-label={`镜头${i + 1}站位图`}
                    title="查看本镜头站位图与生成要求"
                  >
                    {s.blockingImage ? (
                      <Image
                        unoptimized
                        src={s.blockingImage.url}
                        width={58}
                        height={48}
                        alt="站位图"
                      />
                    ) : (
                      <ImageIcon size={22} />
                    )}
                    <span>
                      <b>站位图</b>
                      <small aria-live="polite">
                        {generatingBlocking
                          ? '生成中…'
                          : job?.status === 'attention'
                            ? '生成失败 · 点击查看'
                            : s.blockingImage
                              ? '1 张图片'
                              : '待生成'}
                      </small>
                    </span>
                  </button>
                  <details className="sheet-extra-assets">
                    <summary>服饰 / 声音</summary>
                    {['服饰', '声音'].map((kind) => (
                      <Button
                        key={kind}
                        variant="ghost"
                        onClick={() => setAssetDialog({ shotId: s.id, kind })}
                      >
                        {kind} · {refs.filter((a) => a.kind === kind).length}
                      </Button>
                    ))}
                  </details>
                </div>
                <div className="row-prompt">
                  <div className="row-column-heading">
                    提示词
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="复制提示词"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(shotVisualText(s))
                          .then(() => setMessage(`已复制镜头${i + 1}提示词`))
                          .catch(() =>
                            setMessage('复制失败，请选择提示词手动复制'),
                          );
                      }}
                    >
                      <Copy size={15} />
                    </Button>
                  </div>
                  <PromptEditor
                    value={shotVisualText(s)}
                    assets={refs}
                    disabled={disabled}
                    label={`镜头${i + 1}提示词`}
                    onChange={(text) =>
                      onEdit({ description: text, prompt: text }, s.id)
                    }
                    onAsset={(asset) =>
                      setAssetDialog({ shotId: s.id, kind: asset.kind })
                    }
                  />
                  <div className="sheet-prompt-footer">
                    <small>{shotVisualText(s).length} 字</small>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onOptimize(s.id)}
                    >
                      <Sparkles />
                      AI 优化
                    </Button>
                  </div>
                  <div className="sheet-tags">
                    <span>{s.size}</span>
                    <span>{s.camera}</span>
                    <span>{project.style}</span>
                  </div>
                  {s.firstFrame && (
                    <FirstFrameControl
                      shot={s}
                      disabled={disabled}
                      onUpload={() => onUpload('firstFrame', s.id)}
                      onRemove={() =>
                        onEdit(
                          {
                            firstFrame: undefined,
                            firstFrameSource: undefined,
                          },
                          s.id,
                        )
                      }
                    />
                  )}
                  {s.firstFrameSource &&
                    project.shots[i - 1]?.video?.id !==
                      s.firstFrameSource.videoId && (
                      <p className="helper">来源视频或顺序已变化，请复核首帧</p>
                    )}
                  <div className="row-generation">
                    <small className="sheet-model-caption">
                      选择模型　　比例　　时长
                    </small>
                    <ModelPicker
                      models={models}
                      kind="video"
                      channels={[{ id: 'doubao', label: '豆包插件 · 分组轮询' }]}
                      value={s.videoModelId}
                      onChange={(id) =>
                        onEdit({ videoModelId: id || undefined }, s.id)
                      }
                      onSettings={onModelSettings}
                    />
                    <span>{s.videoModelId === 'doubao' ? s.doubaoRatio || project.ratio || doubao?.settings.ratio : project.ratio}</span>
                    <label>
                      <input
                        type="number"
                        aria-label={`镜头${i + 1}时长`}
                        min={0.1}
                        max={120}
                        step={0.1}
                        value={s.duration}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n))
                            onEdit(
                              { duration: Math.min(120, Math.max(0.1, n)) },
                              s.id,
                            );
                        }}
                      />
                      秒
                    </label>
                    <Button
                      className="video-submit"
                      size={generatingVideo || doubaoPaused || pluginFailed || pluginAttention ? 'default' : 'icon'}
                      disabled={generatingVideo && !canResumeDoubao}
                      aria-label={
                        canResumeDoubao ? '恢复豆包生成任务' : generatingVideo
                          ? `镜头${i + 1}视频${videoStatus}`
                          : pluginAttention ? '重新获取原任务结果' : `${pluginFailed ? '重新生成' : '生成'}镜头${i + 1}视频`
                      }
                      title={canResumeDoubao ? '点击恢复豆包任务，继续原有等待任务，不重复提交' : generatingVideo ? videoStatus : '生成视频'}
                      onClick={() => {
                        onActivate(s.id);
                        if (pluginAttention) {
                          if(pluginJob?.submittedAt) void doubaoCommand('resume', {id: pluginJob.id}).then(setDoubao).catch(e => setMessage(e.message));
                          else setBatch('doubao');
                          return;
                        }
                        if (canResumeDoubao) {
                          void doubaoCommand('pause', { paused: false }).then(setDoubao).catch(e => setMessage(e.message));
                          return;
                        }
                        if (s.videoModelId === 'doubao') { void submitDoubao(s); return; }
                        onGenerate({
                          id: s.id,
                          kind: 'video',
                          modelConfigId: s.videoModelId,
                        });
                      }}
                    >
                      {canResumeDoubao ? '恢复生成' : generatingVideo ? (
                        <>
                          <LoaderCircle className="animate-spin" />
                          {videoStatus}
                        </>
                      ) : pluginAttention ? (pluginJob?.submittedAt ? '重新获取' : '核对任务') : pluginFailed ? '重新生成' : (
                        <Sparkles />
                      )}
                    </Button>
                  </div>
                  {s.videoModelId === 'doubao' && (
                    <div className="actions" style={{ marginTop: 8 }}>
                      <label className="helper">豆包分组 <select aria-label={`镜头${i + 1}豆包分组`} value={s.doubaoGroup || ''} onChange={e => onEdit({ doubaoGroup: e.target.value }, s.id)}>
                        <option value="">{doubaoGroups.length?'请选择账号分组':'请先勾选调用的账号'}</option>
                        {[...new Set([...(s.doubaoGroup ? [s.doubaoGroup] : []), ...doubaoGroups])].map(g => <option key={g} value={g}>{g}</option>)}
                      </select></label>
                      <label className="helper">豆包模型 <select aria-label={`镜头${i + 1}豆包模型`} value={s.doubaoModel || ''} onChange={e => onEdit({ doubaoModel: e.target.value }, s.id)}><option value="">插件默认</option>{[...new Set([...doubaoModels, ...(s.doubaoModel ? [s.doubaoModel] : [])])].map(m => <option key={m} value={m}>{m}</option>)}</select></label>
                      <label className="helper">豆包画幅 <select aria-label={`镜头${i + 1}豆包画幅`} value={s.doubaoRatio || ''} onChange={e => onEdit({ doubaoRatio: e.target.value }, s.id)}><option value="">项目画幅 · {project.ratio || doubao?.settings.ratio}</option>{doubaoRatios.map(r => <option key={r} value={r}>{r}</option>)}</select></label>
                      <Button variant="ghost" onClick={() => setBatch('doubao')}>管理豆包账号</Button>
                    </div>
                  )}
                </div>
                <div className="row-media">
                  <div className="row-column-heading">画面预览</div>
                  {pluginFailed && <output className="video-job-error">生成失败</output>}
                  {pluginAttention && <output className="video-job-error">待核对结果</output>}
                  {videoJob?.status === 'cancelled' && <output className="video-job-status">已取消</output>}
                  {generatingVideo && (
                    <output className="video-job-status">
                      <>{pluginPaused ? <Pause /> : <LoaderCircle className="animate-spin" />}</>
                      {videoStatus}{pluginPaused ? '' : '…'}
                    </output>
                  )}
                  {videoJob &&
                    ['failed', 'attention'].includes(videoJob.status) && (
                      <output className="video-job-error">
                        {videoJob.error || '视频生成未完成'}
                        {pluginAttention ? '。请先核对或重新获取原任务结果。' : s.videoModelId === 'doubao' ? '。可点击“重新生成”。' : '。请到任务中心查看或重试下载。'}
                      </output>
                    )}
                  {s.video ? (
                    <button
                      type="button"
                      className="shot-video-thumbnail"
                      aria-label={`放大预览视频：${s.title}`}
                      title="点击放大预览"
                      onClick={() => {
                        onActivate(s.id);
                        setPreviewId(s.id);
                      }}
                    >
                      <video
                        key={s.video.id}
                        muted
                        playsInline
                        preload="metadata"
                        src={s.video.url}
                        poster={s.image?.url}
                      >
                        <track
                          kind="captions"
                          label="镜头对白"
                          src={
                            'data:text/vtt;charset=utf-8,' +
                            encodeURIComponent(
                              'WEBVTT\n\n00:00:00.000 --> ' +
                                new Date(s.duration * 1000)
                                  .toISOString()
                                  .slice(11, 23) +
                                '\n' +
                                s.dialogue +
                                '\n',
                            )
                          }
                        />
                      </video>
                      <span className="shot-video-open-hint">▶ 点击放大</span>
                    </button>
                  ) : s.image ? (
                    <Image
                      unoptimized
                      src={s.image.url}
                      width={320}
                      height={200}
                      alt={s.title}
                    />
                  ) : (
                    <div className="row-media-empty">
                      <ImageIcon />
                      <span>
                        {pluginPaused ? '已暂停，恢复后继续生成' : generatingVideo
                          ? '完成后自动显示视频'
                          : '添加镜头画面'}
                      </span>
                    </div>
                  )}
                  <button
                    className="sheet-preview-label"
                    disabled={!s.video}
                    onClick={() => {
                      onActivate(s.id);
                      setPreviewId(s.id);
                    }}
                  >
                    视频预览
                  </button>
                  {s.video && (
                    <VideoFileButton
                      media={s.video}
                      projectId={project.id}
                      name={s.title}
                    />
                  )}
                  <div className="sheet-upload-line">
                    <Button
                      variant="outline"
                      onClick={() => onUpload('video', s.id)}
                    >
                      <Upload />
                      {s.video ? '上传替换' : '上传'}
                    </Button>
                    <details className="sheet-more">
                      <summary>更多⌄</summary>
                      <div>
                        <Button
                          variant="outline"
                          disabled={!i}
                          onClick={() => onMove(i, -1)}
                        >
                          <ArrowUp />
                          上移
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => onSelect(s.id)}
                        >
                          详细参数 / 镜头名称
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => onUpload('firstFrame', s.id)}
                        >
                          {s.firstFrame ? '替换自定义首帧' : '上传自定义首帧'}
                        </Button>{' '}
                        <div className="actions">
                          <Button
                            variant="outline"
                            onClick={() => onUpload('image', s.id)}
                          >
                            <Upload />
                            图片
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => onUpload('video', s.id)}
                          >
                            视频
                          </Button>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => onUpload('audio', s.id)}
                        >
                          {s.audio ? '替换镜头配音' : '导入镜头配音'}
                        </Button>
                        {s.audio && (
                          <audio controls src={s.audio.url}>
                            <track
                              kind="captions"
                              label="对白"
                              src="data:text/vtt,WEBVTT"
                            />
                          </audio>
                        )}
                        <p className="helper">
                          台词音色与情绪用于创作设定；自动配音尚未接入。
                        </p>
                        <Button
                          variant="outline"
                          onClick={() =>
                            onGenerate({ id: s.id, kind: 'image' })
                          }
                        >
                          生成镜头图片
                        </Button>
                        {s.video && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              onActivate(s.id);
                              setPreviewId(s.id);
                            }}
                          >
                            预览 / 截取下一镜头首帧
                          </Button>
                        )}
                      </div>
                    </details>
                  </div>
                  {s.video && (
                    <Button
                      variant="outline"
                      className="remove-current-video"
                      onClick={() => onEdit(manualVideoPatch(), s.id)}
                    >
                      删除当前视频
                    </Button>
                  )}
                </div>
                <div className="row-operations">
                  <Button
                    variant="outline"
                    disabled={i === project.shots.length - 1}
                    onClick={() => onMove(i, 1)}
                  >
                    <ArrowDown />
                    下移
                  </Button>
                  <Button
                    variant="outline"
                    disabled={project.shots.length >= 200}
                    onClick={() => onInsert(i)}
                  >
                    <Plus />
                    向下添加
                  </Button>

                  <Button
                    variant="outline"
                    className="generate-blocking"
                    disabled={disabled || generatingBlocking}
                    aria-busy={generatingBlocking}
                    onClick={() => {
                      onActivate(s.id);
                      setBlockingId(s.id);
                    }}
                  >
                    {generatingBlocking ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Sparkles />
                    )}
                    {generatingBlocking
                      ? '生成中…'
                      : s.blockingImage
                        ? '重新生成站位图'
                        : '生成站位图'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="delete-shot"
                    onClick={() => onDelete(s.id)}
                  >
                    删除分镜
                  </Button>
                </div>
              </fieldset>
            </article>
          );
        })}
      </div>
      <Dialog open={!!batch} onOpenChange={(v) => !v && setBatch('')}>
        <DialogContent
          className={batch === 'doubao' ? 'doubao-dialog' : undefined}
        >
          <DialogHeader>
            <DialogTitle>
              {batch === 'blocking'
                ? '批量站位图'
                : batch === 'audio'
                  ? '批量配音'
                  : '豆包插件'}
            </DialogTitle>
            <DialogDescription>
              {batch === 'doubao'
                ? '使用 Chrome 登录豆包，将当前分镜的提示词与参考图导入插件。'
                : batch === 'audio'
                  ? '逐条台词的麦克风按钮可调用声音模型。这里可逐镜导入已有配音。'
                  : '先勾选镜头，再逐镜确认模型、参考图和生成参数。此处不会直接提交收费任务。'}
            </DialogDescription>
          </DialogHeader>
          {batch === 'doubao' ? (
            <DoubaoControls
              project={project}
              shotIds={
                checkedShots.length
                  ? checkedShots.map((s) => s.id)
                  : selectedId
                    ? [selectedId]
                    : project.shots.slice(0, 1).map((s) => s.id)
              }
              onEdit={onEdit}
            />
          ) : (
            <>
              <p>已选 {checkedShots.length} 个镜头</p>
              {!checkedShots.length && <p>请关闭面板，勾选表格左侧复选框。</p>}
              <div className="sheet-batch-list">
                {checkedShots.map((s) => (
                  <div key={s.id}>
                    <span>
                      {s.title}
                      <small>
                        {batch === 'blocking'
                          ? s.blockingImage
                            ? '已有站位图'
                            : '待生成'
                          : s.audio
                            ? '已有配音'
                            : '待上传'}
                      </small>
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setBatch('');
                        onActivate(s.id);
                        if (batch === 'blocking') setBlockingId(s.id);
                        else onUpload('audio', s.id);
                      }}
                    >
                      {batch === 'blocking' ? '确认生成' : '上传配音'}
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {previewId && (
        <ShotVideoPreview
          key={`${project.id}:${previewId}:${project.shots.find((s) => s.id === previewId)?.video?.id}`}
          project={project}
          sourceId={previewId}
          onClose={() => setPreviewId('')}
          onApply={onApplyFrame}
        />
      )}
      {assetPreview && (
        <AssetImagePreview
          key={assetPreview.media.id}
          {...assetPreview}
          projectId={project.id}
          onClose={() => setAssetPreview(null)}
          returnLabel="返回分镜"
        />
      )}
      <Dialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open) setAssetDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>匹配{assetDialog?.kind}资产</DialogTitle>
            <DialogDescription>
              勾选当前镜头需要的资产；同一镜头可以引用多个人物和多个道具。
            </DialogDescription>
          </DialogHeader>
          {target && (
            <>
              <div className="row-asset-picker">
                {project.assets
                  .filter((a) => a.kind === assetDialog?.kind)
                  .map((a) => (
                    <label key={a.id}>
                      <Checkbox
                        disabled={disabled}
                        checked={target.references.includes(a.id)}
                        onCheckedChange={(checked) =>
                          onEdit(
                            {
                              references: checked
                                ? [...target.references, a.id]
                                : target.references.filter(
                                    (ref) => ref !== a.id,
                                  ),
                            },
                            target.id,
                          )
                        }
                      />
                      <strong>{a.name}</strong>
                      <span>{a.description || '尚未填写设定'}</span>
                      {a.kind === '声音' && a.audio && (
                        <audio controls src={a.audio.url}>
                          <track
                            kind="captions"
                            label="声音样本"
                            src="data:text/vtt,WEBVTT"
                          />
                        </audio>
                      )}
                    </label>
                  ))}
                {!project.assets.some((a) => a.kind === assetDialog?.kind) && (
                  <p className="helper">
                    该分类还没有资产，请到资产中心添加，或在剧本中补充后重新整理。
                  </p>
                )}
              </div>
              <Button
                disabled={disabled}
                variant="outline"
                onClick={() =>
                  onEdit(matchShotAssets(target, project.assets), target.id)
                }
              >
                按镜头内容匹配全部分类
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!blockingShot}
        onOpenChange={(open) => {
          if (!open) {
            setBlockingId('');
            setBlockingError('');
            setBlockingPreview(false);
          }
        }}
      >
        <DialogContent className="blocking-dialog">
          <DialogHeader>
            <DialogTitle>生成当前镜头站位图</DialogTitle>
            <DialogDescription>
              用于说明本镜头的人物位置、朝向和机位；单独保存在当前分镜。
            </DialogDescription>
          </DialogHeader>
          {blockingShot && (
            <>
              <strong>{blockingShot.title}</strong>
              <label className="field">
                <span>站位图生成要求</span>
                <textarea
                  rows={7}
                  maxLength={10000}
                  disabled={disabled}
                  value={
                    blockingShot.blockingPrompt ?? blockingBrief(blockingShot)
                  }
                  onChange={(e) =>
                    onEdit({ blockingPrompt: e.target.value }, blockingShot.id)
                  }
                />
              </label>
              <div className="actions">
                <Button
                  disabled={disabled}
                  variant="outline"
                  onClick={() =>
                    onEdit(
                      { blockingPrompt: blockingBrief(blockingShot) },
                      blockingShot.id,
                    )
                  }
                >
                  按最新分镜更新要求
                </Button>
              </div>
              <p className="helper">
                只生成当前镜头的站位图。点击开始生成可确认提示词、参考图和图片尺寸。
              </p>
              <fieldset
                className="blocking-skill-field"
                disabled={disabled || blockingActive}
              >
                <label htmlFor="blocking-skill">站位图 Skill</label>
                <BusinessSelect
                  id="blocking-skill"
                  label="站位图 Skill"
                  value={blockingShot.blockingSkillId || defaultBlockingSkill}
                  options={[
                    { value: 'none', label: '不使用 Skill' },
                    ...blockingSkills.map((s) => ({
                      value: s.id,
                      label: s.name,
                    })),
                  ]}
                  favorites={project.favoriteSkillIds}
                  onChange={(blockingSkillId) => {
                    onEdit({ blockingSkillId }, blockingShot.id);
                    setBlockingError('');
                  }}
                />
                <small>
                  与 Skill
                  中心同步，收藏优先显示；技能规则将加入本次生图提示词。
                </small>
              </fieldset>
              {blockingError && (
                <p role="alert" className="error">
                  {blockingError}
                </p>
              )}
              {blockingActive && (
                <output className="helper">
                  正在后台生成，完成后自动返回本分镜的站位图位置，可关闭此窗口继续工作。
                </output>
              )}
              {blockingJob?.status === 'attention' && (
                <p role="alert" className="error">
                  {blockingJob.error ||
                    '站位图生成未完成，请到任务中心检查任务。'}
                </p>
              )}
              <div className="actions">
                <Button
                  disabled={disabled || blockingActive}
                  onClick={() => {
                    try {
                      const prompt = blockingImagePrompt(
                        project,
                        blockingShot,
                        blockingShot.blockingPrompt ??
                          blockingBrief(blockingShot),
                      );
                      onGenerate({
                        id: blockingShot.id,
                        kind: 'blockingImage',
                        prompt,
                        skillName: blockingImageSkill(project, blockingShot)
                          ?.name,
                      });
                      setBlockingError('');
                      setBlockingId('');
                    } catch (e) {
                      setBlockingError((e as Error).message);
                    }
                  }}
                >
                  {blockingActive ? '生成中…' : '开始生成'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setBlockingId('');
                    onModelSettings();
                  }}
                >
                  查看模型接入状态
                </Button>
              </div>
              {blockingShot.blockingImage ? (
                <>
                  <button
                    type="button"
                    className="blocking-preview-trigger"
                    onClick={() => setBlockingPreview(true)}
                    aria-label={`放大查看${blockingShot.title}站位图`}
                  >
                    <Image
                      unoptimized
                      src={blockingShot.blockingImage.url}
                      width={900}
                      height={600}
                      className="blocking-preview"
                      alt={`${blockingShot.title}站位图`}
                    />
                    <span>点击放大查看</span>
                  </button>
                  {blockingPreview && (
                    <AssetImagePreview
                      key={blockingShot.blockingImage.id}
                      media={blockingShot.blockingImage}
                      name={`${blockingShot.title} · 站位图`}
                      projectId={project.id}
                      onClose={() => setBlockingPreview(false)}
                      returnLabel="返回站位图设置"
                    />
                  )}
                </>
              ) : (
                <p className="helper">
                  上传 JPG、PNG 或 WebP 站位图，最大50MB。
                </p>
              )}
              <div className="actions">
                <Button
                  disabled={disabled || blockingActive}
                  onClick={() => onUpload('blockingImage', blockingShot.id)}
                >
                  {blockingShot.blockingImage ? '替换站位图' : '上传站位图'}
                </Button>
                {blockingShot.blockingImage && (
                  <Button
                    variant="outline"
                    disabled={disabled || blockingActive}
                    onClick={() =>
                      onEdit({ blockingImage: undefined }, blockingShot.id)
                    }
                  >
                    移除引用
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!dubbingLine}
        onOpenChange={(open) => !open && setDubbing(null)}
      >
        <DialogContent className="speech-dialog">
          <DialogHeader>
            <DialogTitle>台词配音</DialogTitle>
            <DialogDescription>
              {dubbingLine?.speaker || '未指定角色'} ·{' '}
              {dubbingVoice?.name || '尚未绑定音色'}
            </DialogDescription>
          </DialogHeader>
          <p className="dubbing-dialogue">
            {dubbingLine?.text || '尚未填写台词'}
          </p>
          {dubbingLine && dubbingShot && (
            <div className="field">
              <span>表演情绪</span>
              <Choice
                label="配音情绪"
                value={dubbingLine.emotion}
                options={[
                  '平静',
                  '开心',
                  '期待',
                  '恐惧',
                  '悲伤',
                  '愤怒',
                  '惊讶',
                  '紧张',
                  '低落',
                ]}
                onChange={(emotion) =>
                  updateLines(
                    dubbingShot,
                    dubbingLines.map((line) =>
                      line.id === dubbingLine.id ? { ...line, emotion } : line,
                    ),
                  )
                }
              />
            </div>
          )}
          {dubbingVoice?.audio && (
            <div>
              <p className="helper">音色样本试听</p>
              <audio controls src={dubbingVoice.audio.url}>
                <track kind="captions" src="data:text/vtt,WEBVTT" />
              </audio>
            </div>
          )}
          {dubbingLine && dubbingShot && (
            <SpeechControls
              key={dubbingLine.id}
              project={project}
              shot={dubbingShot}
              line={dubbingLine}
              voiceAsset={dubbingVoice}
              jobs={generationJobs}
              onPrepared={(lines) => updateLines(dubbingShot, lines)}
              onJob={onJob}
              onSettings={() => {
                setDubbing(null);
                onModelSettings();
              }}
            />
          )}
          <Button
            variant="outline"
            onClick={() => {
              if (dubbingShot) {
                onUpload('audio', dubbingShot.id);
                setDubbing(null);
              }
            }}
          >
            <Upload />
            导入当前镜头配音
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
