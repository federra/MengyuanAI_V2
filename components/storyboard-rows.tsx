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
import { videoResolutionForModel, videoResolutionOptions, type ModelConfig } from '@/lib/models';
import type { GenerationTarget } from './generation-tools';
import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { doubaoCommand, doubaoJobPaused, type DoubaoSnapshot } from '@/lib/doubao-manager';
import { doubaoModels, doubaoRatios } from '@/lib/doubao';
import { AssetImagePreview } from './asset-image-preview';
import { SpeechControls } from './speech-controls';
import { DoubaoControls } from './doubao-controls';
import { useDoubaoTaskPreview } from './doubao-task-preview';
import type { Media } from '@/lib/studio';
import { PromptEditor } from '@/components/prompt-editor';
import { assetDisplayImage } from '@/lib/asset-image-state';
import { captureVideoTailFrame } from '@/lib/frame-capture-client';
import { ShotVideoPreview } from '@/components/shot-video-preview';
import { VideoFileButton } from './video-file-button';
import type { FrameTarget } from '@/lib/frame-reference';
import Image from 'next/image';
import {
  LoaderCircle,
  Pause,
  Plus,
  GripVertical,
  Trash2,
  Upload,
  ImageIcon,
  Sparkles,
  Users,
  Mic,
  Grid2X2,
  Columns3,
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
import { matchShotAssets } from '@/lib/assets';
import {
  dialogueLines,
  dialogueText,
  newLine,
  type DialogueLine,
} from '@/lib/dialogue';

const sheetFields = [
  { id: 'video', label: '视频', width: 'minmax(220px, 1fr)', min: 220 },
  { id: 'prompt', label: '提示词', width: 'minmax(230px, 1.25fr)', min: 230 },
  { id: 'dialogue', label: '台词', width: 'minmax(180px, 1fr)', min: 180 },
  { id: 'assets', label: '资产绑定', width: 'minmax(130px, .85fr)', min: 130 },
  { id: 'model', label: '模型生成', width: 'minmax(175px, .85fr)', min: 175 },
] as const;
type SheetField = (typeof sheetFields)[number]['id'];
const sheetFieldStorageKey = 'ai-director-storyboard-fields-v1';

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
  onReorder,
  onInsert,
  onDelete,
  onActivate,
  selectedId,
  onUpload,
  onModelSettings,
  onApplyFrame,
  onGenerate,
  onOptimize,
  onManageAssets,
  batchAction,
}: {
  onManageAssets: (shotIds: string[]) => void;
  batchAction?: { kind: 'audio' | 'blocking'; shotId: string; nonce: number };
  onOptimize: (shotId: string) => void;
  onGenerate: (target: GenerationTarget) => void;
  project: Project;
  generationJobs: GenerationJob[];
  onJob: (job: GenerationJob) => void;
  disabled: boolean;
  onEdit: (patch: Partial<Shot>, shotId: string) => void;
  onReorder: (from: number, to: number) => void;
  onInsert: (index: number) => void;
  onDelete: (ids: string[]) => void;
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
  const [settingsId, setSettingsId] = useState('');
  const [doubaoSettingsId, setDoubaoSettingsId] = useState('');
  const [message, setMessage] = useState('');
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [doubao, setDoubao] = useState<DoubaoSnapshot>();
  const doubaoPreview = useDoubaoTaskPreview(state => {setDoubao(state);setMessage('已确认并加入豆包队列，完成后返回本分镜。');});
  const sheetHead = useRef<HTMLDivElement>(null);
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
  const [capturingFrameId, setCapturingFrameId] = useState('');
  const frameCaptureLock = useRef(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [visibleFields, setVisibleFields] = useState<SheetField[]>(sheetFields.map((field) => field.id));
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = JSON.parse(localStorage.getItem(sheetFieldStorageKey) || 'null');
        if (Array.isArray(saved)) setVisibleFields(sheetFields.filter((field) => saved.includes(field.id)).map((field) => field.id));
      } catch { /* Invalid local preference uses the default columns. */ }
    });
    return () => { cancelled = true; };
  }, []);
  function updateVisibleFields(next: SheetField[]) {
    setVisibleFields(next);
    localStorage.setItem(sheetFieldStorageKey, JSON.stringify(next));
  }
  const fieldPosition = Object.fromEntries(sheetFields.map((field, index) => [field.id, 3 + sheetFields.slice(0, index).filter((item) => visibleFields.includes(item.id)).length])) as Record<SheetField, number>;
  const sheetStyle = {
    '--sheet-cols': `24px 65px ${sheetFields.filter((field) => visibleFields.includes(field.id)).map((field) => field.width).join(' ')}`,
    '--sheet-min-width': `${Math.max(180, 105 + sheetFields.filter((field) => visibleFields.includes(field.id)).reduce((total, field) => total + field.min, 0) + (visibleFields.length + 1) * 8)}px`,
    '--sheet-video-position': fieldPosition.video,
    '--sheet-prompt-position': fieldPosition.prompt,
    '--sheet-dialogue-position': fieldPosition.dialogue,
    '--sheet-assets-position': fieldPosition.assets,
    '--sheet-model-position': fieldPosition.model,
  } as CSSProperties;
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const pointerDrag = useRef<{ from: number; startY: number; active: boolean; shotId: string } | null>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  const suppressClickId = useRef('');
  const [batch, setBatch] = useState('');
  const handledBatchAction = useRef(0);
  useEffect(() => {
    if (!batchAction || handledBatchAction.current === batchAction.nonce) return;
    handledBatchAction.current = batchAction.nonce;
    queueMicrotask(() => {
      onActivate(batchAction.shotId);
      if (batchAction.kind === 'blocking') setBlockingId(batchAction.shotId);
      else onUpload('audio', batchAction.shotId);
    });
  }, [batchAction, onActivate, onUpload]);
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
  const checkedIds = checkedShots.map((s) => s.id);
  function nearestInsertion(y: number) {
    const points = document.querySelectorAll<HTMLElement>('.storyboard-rows .sheet-insertion');
    let nearest = 0;
    let distance = Infinity;
    points.forEach((point) => {
      const rect = point.getBoundingClientRect();
      const next = Math.abs(y - (rect.top + rect.bottom) / 2);
      if (next < distance) { distance = next; nearest = Number(point.dataset.index); }
    });
    return nearest;
  }
  function finishDrag(y: number) {
    const drag = pointerDrag.current;
    if (drag?.active) {
      const to = nearestInsertion(y);
      if (to !== drag.from && to !== drag.from + 1) onReorder(drag.from, to);
      suppressClickId.current = drag.shotId;
      window.setTimeout(() => { if (suppressClickId.current === drag.shotId) suppressClickId.current = ''; }, 0);
    }
    dragCleanup.current?.();
    dragCleanup.current = null;
    pointerDrag.current = null;
    setDraggingIndex(null);
    setDropIndex(null);
  }
  function beginDrag(from: number, shotId: string, y: number) {
    dragCleanup.current?.();
    pointerDrag.current = { from, shotId, startY: y, active: false };
    const move = (event: PointerEvent) => {
      const drag = pointerDrag.current;
      if (!drag || Math.abs(event.clientY - drag.startY) < 6) return;
      if (!drag.active) {
        drag.active = true;
        window.getSelection()?.removeAllRanges();
        setDraggingIndex(drag.from);
      }
      if (event.clientY < 45) window.scrollBy(0, -24);
      else if (event.clientY > window.innerHeight - 45) window.scrollBy(0, 24);
      setDropIndex(nearestInsertion(event.clientY));
    };
    const up = (event: PointerEvent) => finishDrag(event.clientY);
    const cancel = () => finishDrag(y);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
    dragCleanup.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }
  useEffect(() => () => dragCleanup.current?.(), []);
  async function capturePreviousTailFrame(index: number) {
    if (frameCaptureLock.current) return;
    const source = project.shots[index - 1];
    const target = project.shots[index];
    if (!source?.video || !target) {
      setMessage('上一分镜尚无视频，请先生成或上传视频');
      return;
    }
    frameCaptureLock.current = true;
    setCapturingFrameId(target.id);
    setMessage('');
    try {
      const captured = await captureVideoTailFrame(source.video.url, index);
      await onApplyFrame(captured.file, {
        projectId: project.id,
        sourceShotId: source.id,
        sourceVideoId: source.video.id,
        targetShotId: target.id,
        previousFrameId: target.firstFrame?.id || '',
        time: captured.time,
      });
      setMessage(`分镜${index + 1}已引用上一视频尾帧`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '引用上一视频尾帧失败');
    } finally {
      frameCaptureLock.current = false;
      setCapturingFrameId('');
    }
  }
  function insertionPoint(index: number) {
    return <div className={`sheet-insertion ${index === 0 ? 'sheet-insertion-first' : ''} ${dropIndex === index ? 'is-drop-target' : ''}`}
      data-index={index}>
      <button type="button" disabled={disabled || project.shots.length >= 200}
        aria-label={`在${index === 0 ? '第一条分镜前' : index === project.shots.length ? '最后一条分镜后' : `第${index}和第${index + 1}条分镜之间`}添加分镜`}
        title="在此添加分镜" onClick={() => onInsert(index - 1)}><Plus size={15} /></button>
    </div>;
  }

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
  const settingsShot = project.shots.find((s) => s.id === settingsId);
  const doubaoSettingsShot = project.shots.find((s) => s.id === doubaoSettingsId);
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
    <div className={`storyboard-rows ${draggingIndex !== null ? 'is-dragging' : ''}`} style={sheetStyle}>
      {doubaoPreview.dialog}
      <Dialog open={fieldsOpen} onOpenChange={setFieldsOpen}>
        <DialogContent className="sheet-fields-dialog">
          <DialogHeader>
            <DialogTitle>字段管理</DialogTitle>
            <DialogDescription>选择分镜表要显示的字段。分镜序号固定显示，便于选择和排序；设置保存在本机。</DialogDescription>
          </DialogHeader>
          <div className="sheet-fields-list">
            <div className="sheet-field-fixed"><Checkbox checked disabled aria-label="分镜序号固定显示" /><span>分镜序号</span><small>固定</small></div>
            {sheetFields.map((field) => <div key={field.id}>
              <Checkbox id={`sheet-field-${field.id}`} checked={visibleFields.includes(field.id)} aria-label={`显示${field.label}`}
                onCheckedChange={(checked) => updateVisibleFields(checked
                  ? sheetFields.filter((item) => item.id === field.id || visibleFields.includes(item.id)).map((item) => item.id)
                  : visibleFields.filter((id) => id !== field.id))} />
              <label htmlFor={`sheet-field-${field.id}`}>{field.label}</label>
            </div>)}
          </div>
          <div className="sheet-fields-actions">
            <Button variant="outline" onClick={() => updateVisibleFields(sheetFields.map((field) => field.id))}>全部显示</Button>
            <Button onClick={() => setFieldsOpen(false)}>完成</Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="sheet-toolbar">
        {checkedShots.length > 0 && <Button variant="outline" className="sheet-bulk-delete" disabled={disabled}
          onClick={() => setDeleteConfirmOpen(true)}><Trash2 />删除分镜（{checkedShots.length}）</Button>}
        <Button variant="outline" disabled={disabled} onClick={() => onManageAssets(checkedShots.map((shot) => shot.id))}>
          <Users />
          资产管理
        </Button>
        <Button variant="outline" onClick={() => setBatch('doubao')}>
          <Grid2X2 />
          豆包插件
        </Button>
        <Button variant="outline" className="sheet-fields-trigger" onClick={() => setFieldsOpen(true)}>
          <Columns3 />
          字段管理
        </Button>
      </div>
      <div className="sheet-head-sticky"><div className="sheet-head-scroll" ref={sheetHead}>
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
          {sheetFields.filter((field) => visibleFields.includes(field.id)).map((field) => <span key={field.id}>{field.label}</span>)}
        </div>
      </div></div>
      <div className="sheet-scroll" onScroll={event=>{if(sheetHead.current)sheetHead.current.scrollLeft=event.currentTarget.scrollLeft;}}>
        {message && <output className="row-message">{message}</output>}
        {insertionPoint(0)}
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
          const videoModel = models.find((m) => m.kind === 'video' && (s.videoModelId ? m.id === s.videoModelId : m.isDefault));
          const resolutionOptions = videoResolutionOptions(videoModel);
          const selectedResolution = videoResolutionForModel(s.videoResolution, videoModel);
          const frameActions = <div className="sheet-frame-actions">
            {i > 0 && (s.firstFrameSource && s.firstFrame ? (
              <button type="button" className="sheet-previous-frame-tag" title="预览已引用的首帧图"
                onClick={() => setAssetPreview({media: s.firstFrame!, name: '引用上一视频尾帧'})}>
                已引用上一视频尾帧
              </button>
            ) : (
              <Button type="button" variant="outline" className="sheet-frame-reference"
                disabled={disabled || !!capturingFrameId || !project.shots[i - 1]?.video}
                title={project.shots[i - 1]?.video ? '自动截取上一分镜视频尾帧作为本镜头首帧' : '上一分镜尚无视频'}
                onClick={() => void capturePreviousTailFrame(i)}>
                {capturingFrameId === s.id ? <LoaderCircle className="animate-spin" /> : <ImageIcon />}
                {capturingFrameId === s.id ? '截取中…' : '引用上一视频尾帧'}
              </Button>
            ))}
            <div className="sheet-frame-edit-actions">
              <Button type="button" variant="outline" onClick={() => onUpload('firstFrame', s.id)}>
                <Upload />{s.firstFrame ? '替换' : '上传首帧'}
              </Button>
              {s.firstFrame && <Button type="button" variant="outline"
                onClick={() => onEdit({firstFrame: undefined, firstFrameSource: undefined}, s.id)}>
                <X />移除
              </Button>}
            </div>
            {s.firstFrameSource && project.shots[i - 1]?.video?.id !== s.firstFrameSource.videoId && <>
              <small className="sheet-frame-warning">来源视频或顺序已变化</small>
              <Button type="button" variant="outline" className="sheet-frame-reference"
                disabled={disabled || !!capturingFrameId || !project.shots[i - 1]?.video}
                onClick={() => void capturePreviousTailFrame(i)}>重新引用</Button>
            </>}
            {s.firstFrame && !s.firstFrameSource && <button type="button" className="sheet-custom-frame-tag"
              onClick={() => setAssetPreview({media: s.firstFrame!, name: '自定义首帧'})}>已上传自定义首帧 · 点击预览</button>}
          </div>;
          return (<div key={s.id} className={`sheet-row-wrap ${draggingIndex === i ? 'is-drag-source' : ''}`}>
            <article
              className={`storyboard-row ${selectedId === s.id ? 'is-selected' : ''}`}
              aria-label={`分镜${i + 1}`}
              onPointerDown={(event) => {
                if (disabled || event.button !== 0) return;
                const target = event.target as HTMLElement;
                const dragControl = target.closest('.sheet-drag-handle, .sheet-shot-name');
                if (!dragControl && target.closest('button, input, textarea, select, a, summary, [role="combobox"], [contenteditable="true"]')) return;
                if (!dragControl) event.preventDefault();
                beginDrag(i, s.id, event.clientY);
              }}
              onClickCapture={(event) => {
                if (suppressClickId.current !== s.id) return;
                event.preventDefault();
                event.stopPropagation();
                suppressClickId.current = '';
              }}
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
                  onClick={() => { onActivate(s.id); setSettingsId(s.id); }}
                  title={s.title}
                >
                  #{String(i + 1).padStart(2, '0')}
                  <small>{s.reviewRequired ? '待复核' : ''}</small>
                </button>
                <button type="button" className="sheet-drag-handle"
                  aria-label={`拖动分镜${i + 1}调整顺序`} title="拖动调整分镜顺序"
                  onKeyDown={event => {
                    if (event.key === 'ArrowUp' && i > 0) { event.preventDefault(); onReorder(i, i - 1); }
                    if (event.key === 'ArrowDown' && i < project.shots.length - 1) { event.preventDefault(); onReorder(i, i + 2); }
                  }}
                  ><GripVertical size={15} /></button>
                <div className={`dialogue-column ${visibleFields.includes('dialogue') ? '' : 'sheet-column-hidden'}`}>
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
                <div className={`asset-rail ${visibleFields.includes('assets') ? '' : 'sheet-column-hidden'}`} aria-label={`分镜${i + 1}资产绑定`}>
                  <div className="shot-asset-tag-group">
                    {refs.filter((asset) => ['人物', '道具', '场景', '服饰', '声音'].includes(asset.kind)).map((asset) => {
                      const image = assetDisplayImage(asset, generationJobs, project.id);
                      const media = image.media;
                      const pendingImage = asset.kind !== '声音' && !media;
                      return <button key={asset.id} type="button" className="shot-asset-tag" data-kind={asset.kind}
                        data-image-state={pendingImage ? 'pending' : 'ready'}
                        title={image.source === 'generated' ? `${asset.name}已生成图片、待应用；点击管理绑定` : media ? `点击管理${asset.name}绑定` : `${asset.name}尚无图片，点击管理绑定`}
                        onClick={() => setAssetDialog({ shotId: s.id, kind: asset.kind })}>
                        {asset.kind === '人物' ? '角色' : asset.kind} · {asset.name}{pendingImage ? '（待生成）' : media ? ' ✓' : ''}
                      </button>;
                    })}
                  </div>
                  <button type="button" className="shot-asset-tag" data-kind="站位图" data-image-state={s.blockingImage ? 'ready' : 'pending'} onClick={() => {
                    onActivate(s.id);
                    if (s.blockingImage) setAssetPreview({ media: s.blockingImage, name: `分镜${i + 1}站位图` });
                    else setBlockingId(s.id);
                  }}
                    aria-label={`镜头${i + 1}站位图`} title={s.blockingImage ? '预览站位图' : '打开站位图生成设置'}>
                    站位图{generatingBlocking ? ' · 生成中' : job?.status === 'attention' ? ' · 失败' : s.blockingImage ? ' · 已生成' : '（待生成）'}
                  </button>
                  {visibleFields.includes('assets') && frameActions}
                  <details className="shot-asset-add-menu">
                    <summary>+ 绑定资产</summary>
                    <div>{(['人物', '道具', '场景', '服饰', '声音'] as const).map((kind) => (
                      <button type="button" key={kind} onClick={() => setAssetDialog({ shotId: s.id, kind })}>
                        {kind === '人物' ? '角色' : kind}
                      </button>
                    ))}</div>
                  </details>
                </div>
                <div className={`row-prompt ${visibleFields.includes('prompt') ? '' : 'sheet-column-hidden'}`}>
                  <PromptEditor
                    value={shotVisualText(s)}
                    assets={refs}
                    availableAssets={project.assets}
                    disabled={disabled}
                    label={`镜头${i + 1}提示词`}
                    onChange={(text) =>
                      onEdit({ description: text, prompt: text }, s.id)
                    }
                    onAsset={(asset) =>
                      setAssetDialog({ shotId: s.id, kind: asset.kind })
                    }
                    onInsertAsset={(text, asset) =>
                      onEdit({ description: text, prompt: text, references: [...new Set([...s.references, asset.id])] }, s.id)
                    }
                  />
                  <div className="sheet-prompt-footer">
                    <div className="sheet-tags">
                      <span>{s.size}</span>
                      <span>{s.camera}</span>
                      <span>{project.style}</span>
                    </div>
                    <div className="sheet-prompt-actions">
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
                  </div>
                </div>
                <div className={`row-media ${visibleFields.includes('video') ? '' : 'sheet-column-hidden'}`}>
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
                  {!visibleFields.includes('assets') && frameActions}
                  <div className="sheet-video-actions">
                    {s.video && <VideoFileButton iconOnly media={s.video} projectId={project.id} name={s.title}/>}
                    <Button
                      variant="outline"
                      size="icon"
                      data-tooltip={s.video ? '上传替换视频' : '上传视频'}
                      aria-label={s.video ? '上传替换视频' : '上传视频'}
                      title={s.video ? '上传替换视频' : '上传视频'}
                      onClick={() => onUpload('video', s.id)}
                    >
                      <Upload />
                    </Button>
                    {s.video && (
                      <Button variant="outline" className="remove-current-video" size="icon"
                        data-tooltip="删除当前视频" aria-label="删除当前视频" title="删除当前视频"
                        onClick={() => onEdit(manualVideoPatch(), s.id)}><X /></Button>
                    )}
                    <details className="sheet-more">
                      <summary data-tooltip="更多视频操作" aria-label="更多视频操作" title="更多视频操作">•••</summary>
                      <div>
                        <Button
                          variant="outline"
                          onClick={() => { onActivate(s.id); setSettingsId(s.id); }}
                        >
                          分镜参数 / 镜头名称
                        </Button>
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
                </div>
                <div className={`row-model-generation ${visibleFields.includes('model') ? '' : 'sheet-column-hidden'}`}>
                  <div className="shot-video-settings">
                    <div className="row-column-heading">模型与生成设置</div>
                  <div className="row-generation">
                    <div className="sheet-model-field sheet-model-choice"><small>选择模型</small><ModelPicker
                      models={models}
                      kind="video"
                      channels={[{ id: 'doubao', label: '豆包插件 · 分组轮询' }]}
                      value={s.videoModelId}
                      onChange={(id) =>
                        onEdit({ videoModelId: id || undefined, videoResolution: undefined }, s.id)
                      }
                      onSettings={onModelSettings}
                    /></div>
                    <label className="sheet-model-field sheet-model-duration"><small>时长</small><span>
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
                    </span></label>
                    <div className="sheet-model-field sheet-model-resolution">
                      <small>分辨率</small>
                      {s.videoModelId === 'doubao' ? <span className="sheet-model-unavailable" title="豆包网页当前没有清晰度选项">由豆包页面决定</span> : <Select value={selectedResolution} onValueChange={(value) => value && onEdit({videoResolution: value}, s.id)}>
                        <SelectTrigger aria-label={`镜头${i + 1}分辨率`}><SelectValue /></SelectTrigger>
                        <SelectContent className="sheet-resolution-options">{resolutionOptions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                      </Select>}
                    </div>
                    <Button type="button" variant="outline" className="sheet-generation-details"
                      onClick={() => s.videoModelId === 'doubao' ? setDoubaoSettingsId(s.id) : onGenerate({id: s.id, kind: 'video', modelConfigId: s.videoModelId})}>
                      详情
                    </Button>
                    <Button
                      className="video-submit"
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
                          autoSubmit: true,
                        });
                      }}
                    >
                      {canResumeDoubao ? '恢复生成' : generatingVideo ? (
                        <>
                          <LoaderCircle className="animate-spin" />
                          {videoStatus}
                        </>
                      ) : pluginAttention ? (pluginJob?.submittedAt ? '重新获取' : '核对任务') : pluginFailed ? '重新生成' : (
                        <><Sparkles />生成视频</>
                      )}
                    </Button>
                  </div>
                  </div>
                </div>
              </fieldset>
            </article>{insertionPoint(i + 1)}</div>
          );
        })}
      </div>
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>删除分镜</DialogTitle>
            <DialogDescription>是否删除选中的{checkedShots.length}条分镜？</DialogDescription></DialogHeader>
          <div className="sheet-delete-confirm-actions">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>取消</Button>
            <Button variant="destructive" disabled={disabled || !checkedShots.length} onClick={() => {
              onDelete(checkedIds);
              setChecked([]);
              setDeleteConfirmOpen(false);
            }}>确认删除</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!doubaoSettingsShot} onOpenChange={(open) => !open && setDoubaoSettingsId('')}>
        <DialogContent className="sheet-doubao-settings-dialog">
          <DialogHeader>
            <DialogTitle>豆包生成设置 · 分镜{project.shots.findIndex((shot) => shot.id === doubaoSettingsId) + 1}</DialogTitle>
            <DialogDescription>设置当前分镜使用的账号分组、豆包模型和画幅。</DialogDescription>
          </DialogHeader>
          {doubaoSettingsShot && <div className="sheet-doubao-settings-fields">
            <label>豆包分组 <select aria-label="豆包分组" value={doubaoSettingsShot.doubaoGroup || ''} onChange={e => onEdit({ doubaoGroup: e.target.value }, doubaoSettingsShot.id)}>
              <option value="">{doubaoGroups.length ? '请选择账号分组' : '请先勾选调用的账号'}</option>
              {[...new Set([...(doubaoSettingsShot.doubaoGroup ? [doubaoSettingsShot.doubaoGroup] : []), ...doubaoGroups])].map(group => <option key={group} value={group}>{group}</option>)}
            </select></label>
            <label>豆包模型 <select aria-label="豆包模型" value={doubaoSettingsShot.doubaoModel || ''} onChange={e => onEdit({ doubaoModel: e.target.value }, doubaoSettingsShot.id)}>
              <option value="">插件默认</option>
              {[...new Set([...doubaoModels, ...(doubaoSettingsShot.doubaoModel ? [doubaoSettingsShot.doubaoModel] : [])])].map(model => <option key={model} value={model}>{model}</option>)}
            </select></label>
            <label>豆包画幅 <select aria-label="豆包画幅" value={doubaoSettingsShot.doubaoRatio || ''} onChange={e => onEdit({ doubaoRatio: e.target.value }, doubaoSettingsShot.id)}>
              <option value="">项目画幅 · {project.ratio || doubao?.settings.ratio}</option>
              {doubaoRatios.map(ratio => <option key={ratio} value={ratio}>{ratio}</option>)}
            </select></label>
            <Button variant="outline" onClick={() => { setDoubaoSettingsId(''); setBatch('doubao'); }}>管理豆包账号</Button>
          </div>}
        </DialogContent>
      </Dialog>
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
      <Dialog open={!!settingsShot} onOpenChange={(open) => !open && setSettingsId('')}>
        <DialogContent className="shot-settings-dialog">
          <DialogHeader>
            <DialogTitle>分镜参数 · {settingsShot?.title}</DialogTitle>
            <DialogDescription>修改当前分镜的标题、画面与镜头设定。</DialogDescription>
          </DialogHeader>
          {settingsShot && <div className="shot-settings-fields">
            <label>镜头标题<input aria-label="镜头标题" value={settingsShot.title} onChange={(event) => onEdit({ title: event.target.value }, settingsShot.id)} /></label>
            <label>画面描述<textarea aria-label="画面描述" rows={3} value={settingsShot.description} onChange={(event) => onEdit({ description: event.target.value }, settingsShot.id)} /></label>
            <label>景别<select aria-label="景别" value={settingsShot.size} onChange={(event) => onEdit({ size: event.target.value }, settingsShot.id)}>
              {[settingsShot.size, '远景', '全景', '中景', '近景', '特写'].filter((value, index, list) => list.indexOf(value) === index).map((value) => <option key={value} value={value}>{value}</option>)}
            </select></label>
            <label>机位 / 运镜<input aria-label="机位或运镜" value={settingsShot.camera} onChange={(event) => onEdit({ camera: event.target.value }, settingsShot.id)} /></label>
            <label>人物<input aria-label="人物" value={settingsShot.character} onChange={(event) => onEdit({ character: event.target.value }, settingsShot.id)} /></label>
            <label>场景<input aria-label="场景" value={settingsShot.scene} onChange={(event) => onEdit({ scene: event.target.value }, settingsShot.id)} /></label>
            {settingsShot.reviewRequired && <p className="shot-review-note">{settingsShot.reviewRequired}</p>}
            <div className="actions">
              <Button variant="outline" onClick={() => onEdit(matchShotAssets(settingsShot, project.assets), settingsShot.id)}>按镜头内容匹配资产</Button>
              {settingsShot.reviewRequired && <Button variant="outline" onClick={() => onEdit({ reviewRequired: undefined }, settingsShot.id)}>已人工复核</Button>}
            </div>
          </div>}
        </DialogContent>
      </Dialog>
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
                  .map((a) => {
                    const image = assetDisplayImage(a, generationJobs, project.id);
                    return (
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
                      <div className="row-asset-picker-image" title={image.source === 'generated' ? '已生成，待到资产管理应用' : image.source === 'reference' ? '参考图' : undefined}>
                        {image.media ? (
                          <>
                            <Image unoptimized src={image.media.url} alt={`${a.name}图片`} width={60} height={60} />
                            {image.source === 'generated' && <small>待应用</small>}
                          </>
                        ) : '未生成'}
                      </div>
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
                  );})}
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
