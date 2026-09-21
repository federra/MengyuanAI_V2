'use client';
import { VideoFileButton } from './video-file-button';
import { planVideoVoices } from '@/lib/video-voice';
import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ModelPicker } from './model-picker';
import {
  videoVoiceBindings,
  composeVideoContext,
  videoReferences,
  videoAssets,
} from '@/lib/video-context';
import { finalVideoPrompt, videoReferenceError } from '@/lib/video-request';
import { modelApi } from './model-settings';
import { type Project, shotVisualText, compilePrompt } from '@/lib/studio';
import {
  type GenerationInput,
  imageSizeForRatio,
  imageSizeOptions,
  type GenerationJob,
  type ModelConfig,
} from '@/lib/models';
export type GenerationTarget = {
  modelConfigId?: string;
  id: string;
  kind: GenerationInput['target'];
  prompt?: string;
  skillName?: string;
};
export function GenerationDialog({
  project,
  target,
  onClose,
  onTasks,
  onBeforeSubmit,
  onNotice,
  onJob,
}: {
  onJob: (job: GenerationJob) => void;
  onNotice: (message: string) => void;
  onBeforeSubmit?: () => Promise<void>;
  project: Project;
  target: GenerationTarget;
  onClose: () => void;
  onTasks: () => void;
}) {
  const shot = project.shots.find((s) => s.id === target.id);
  const asset = project.assets.find((a) => a.id === target.id);
  const video = target.kind === 'video';
  const [prompt, setPrompt] = useState(
    target.prompt ??
      (target.kind === 'asset'
        ? `${project.style}。${asset?.name}：${asset?.description}`
        : shot
          ? video
            ? shotVisualText(shot)
            : `${shotVisualText(shot)}\n${compilePrompt(project, shot)}`
          : ''),
  );
  const [selectedModelId, setSelectedModelId] = useState(
    target.modelConfigId || (video ? shot?.videoModelId : '') || '',
  );
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [mode, setMode] = useState(video ? 'all' : 'none');
  const [refs, setRefs] = useState<string[]>([]);
  const [size, setSize] = useState('video');
  const [selectedResolution, setResolution] = useState('');
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [duration, setDuration] = useState(Math.round(shot?.duration || 5));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [job, setJob] = useState<GenerationJob>();
  const requestId = useRef(crypto.randomUUID());
  const lock = useRef(false);
  useEffect(() => {
    modelApi<ModelConfig[]>('/api/models')
      .then((x) => {
        setModels(x);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  const model = models.find(
    (m) =>
      m.kind === (video ? 'video' : 'image') &&
      (selectedModelId ? m.id === selectedModelId : m.isDefault),
  );
  const sizeOptions = imageSizeOptions(model?.protocol, model?.model);
  const selectedSize = size === 'video' || sizeOptions.includes(size) ? size : 'video';
  let ratioSize = '', sizeError = '';
  try { ratioSize = imageSizeForRatio(project.ratio, model?.protocol, model?.model); }
  catch (e) { if (selectedSize === 'video') sizeError = (e as Error).message; }
  const effectiveSize = selectedSize === 'video' ? ratioSize : selectedSize;
  const sizeLabel = model?.protocol === 'images' ? '按画幅选择兼容尺寸' : '与视频比例一致';
  const minimax = model?.protocol === 'heima-minimax';
  const resolutions = minimax ? ['480p', '768p'] : ['480p', '720p', '1080p'];
  const resolution = resolutions.includes(selectedResolution)
    ? selectedResolution
    : minimax
      ? '768p'
      : '720p';
  const candidates = [
    ...(asset?.referenceImage
      ? [{ id: asset.referenceImage.id, name: asset.name + ' · 参考图' }]
      : []),
    ...(shot?.image ? [{ id: shot.image.id, name: '镜头画面' }] : []),
    ...(shot?.blockingImage
      ? [{ id: shot.blockingImage.id, name: '站位图' }]
      : []),
    ...project.assets
      .filter((a) => a.image && (!shot || shot.references.includes(a.id)))
      .map((a) => ({ id: a.image!.id, name: a.name })),
  ].filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i);
  const videoCandidates = shot && video ? videoReferences(project, shot) : [];
  const selectedVideoRefs =
    mode === 'all'
      ? videoCandidates
      : mode === 'refs'
        ? videoCandidates.filter((a) => refs.includes(a.mediaId))
        : [];
  const firstBinding = shot?.firstFrame
    ? [
        {
          mediaId: shot.firstFrame.id,
          label: `本分镜/${shot.title} 的自定义首帧；作为视频起始帧，人物外观与场景依据下方文字设定。`,
        },
      ]
    : [];
  let videoInput: GenerationInput | undefined;
  let videoPreview = '',
    videoError = '';
  try {
    videoInput =
      video && shot
        ? {
            modelConfigId: model?.id,
            ...(minimax ? { mediaUrls } : {}),
            projectId: project.id,
            targetId: shot.id,
            target: 'video',
            voiceBindings: videoVoiceBindings(project, shot),
            prompt: composeVideoContext(project, shot, prompt, {
              ratio: project.ratio,
              duration,
              resolution,
            }),
            ratio: project.ratio,
            duration,
            resolution,
            size: effectiveSize,
            referenceIds: selectedVideoRefs.map((a) => a.mediaId),
            referenceBindings:
              mode === 'first'
                ? firstBinding
                : selectedVideoRefs.map(({ mediaId, label }) => ({
                    mediaId,
                    label,
                  })),
            firstFrameId: mode === 'first' ? shot.firstFrame?.id : undefined,
          }
        : undefined;
  } catch (e) {
    videoError = (e as Error).message;
  }
  if (videoInput) {
    try {
      videoPreview = finalVideoPrompt(videoInput, model);
      videoError = videoReferenceError(model, videoInput);
    } catch (e) {
      videoError = (e as Error).message;
    }
  }
  const voicePlan = videoInput ? planVideoVoices(model, videoInput) : undefined;
  const missingVideoImages = shot
    ? videoAssets(project, shot)
        .filter(
          (a) =>
            ['人物', '场景', '道具', '服饰'].includes(a.kind) &&
            !a.image &&
            !a.referenceImage,
        )
        .map((a) => `${a.kind}/${a.name}`)
    : [];
  async function submit() {
    if (lock.current) return;
    if (!video && sizeError) { setMessage(sizeError); return; }
    if (video && (!videoInput || videoError)) {
      setMessage(videoError || '当前分镜不存在，请重新打开。');
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage('');
    let returned = false;
    let submissionStarted = false;
    const label = asset?.name || shot?.title || '生成任务';
    const returnToWork = (j: GenerationJob) => {
      onJob(j);
      if (
        returned ||
        j.error ||
        !['submitting', 'running', 'succeeded'].includes(j.status)
      )
        return;
      returned = true;
      onNotice(`${label}：任务已提交，正在后台处理，可在任务中心查看结果。`);
      onClose();
    };
    try {
      await onBeforeSubmit?.();
      submissionStarted = true;
      const j = await modelApi<GenerationJob>(
        '/api/generations',
        {
          id: requestId.current,
          input: videoInput || {
            modelConfigId: model?.id,
            projectId: project.id,
            targetId: target.id,
            target: target.kind,
            prompt,
            ratio: project.ratio,
            duration,
            referenceIds: video
              ? mode === 'refs'
                ? refs
                : []
              : model?.protocol === 'seedream'
                ? asset?.referenceImage
                  ? [asset.referenceImage.id]
                  : shot
                    ? candidates.map((a) => a.id).slice(0, 9)
                    : []
                : [],
            firstFrameId:
              video && mode === 'first' ? shot?.firstFrame?.id : undefined,
            size: effectiveSize,
            resolution,
          },
        },
        returnToWork,
      );
      returnToWork(j);
      const result =
        j.error ||
        (j.status === 'succeeded'
          ? target.kind === 'asset'
            ? '生成完成，图片已返回资产管理，可在图片栏预览并应用。'
            : target.kind === 'blockingImage'
              ? '生成完成，图片已返回对应分镜的站位图位置，请保存项目。'
              : '视频已自动下载到对应分镜的预览区，请保存项目。'
          : '任务已记录，可在任务中心查看进度。');
      if (returned) onNotice(`${label}：${result}`);
      else {
        setJob(j);
        setMessage(result);
      }
    } catch (e) {
      const error =
        (e as Error).message + (submissionStarted
          ? '。请先到任务中心核对记录，避免重复提交。'
          : ' 本次未提交生成任务，请先处理项目保存问题。');
      if (returned) onNotice(`${label}：${error}`);
      else setMessage(error);
    } finally {
      if (!returned) setBusy(false);
      lock.current = false;
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="generation-dialog">
        <DialogHeader>
          <DialogTitle>
            {video
              ? '生成分镜视频'
              : target.kind === 'blockingImage'
                ? '生成站位图'
                : '生成图片'}
          </DialogTitle>
          <DialogDescription>
            {shot?.title || asset?.name} ·{' '}
            {model?.enabled
              ? model.name + ' / ' + model.model
              : '请先在模型设置中配置并启用服务'}
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={busy || !!job}>
          <div className="field">
            <span>生成模型</span>
            <ModelPicker
              models={models}
              kind={video ? 'video' : 'image'}
              value={selectedModelId}
              onChange={setSelectedModelId}
            />
          </div>
          {video && model?.protocol === 'heima-video' && (
            <p className="helper">
              黑马 GROK：6 / 10 / 15秒，720p / 1080p，最多7张参考图。
            </p>
          )}
          {video && minimax && (
            <p className="helper">
              MiniMax H3：5至15秒，480p /
              768p，最多8张参考图片、3段参考音频。素材以 HTTPS 链接提交。
            </p>
          )}
          {video && model?.protocol === 'chat-video' && (
            <p className="helper">
              Firefly VEO 的时长、画幅与分辨率由完整模型 ID
              决定，请保持一致。帧模式下两张图片按首帧、尾帧顺序发送。
            </p>
          )}
          {target.skillName && (
            <p className="generation-skill-summary">
              生图 Skill：{target.skillName} · 技能规则已加入下方提示词
            </p>
          )}
          <label className="field">
            <span>{video ? '镜头内容与补充要求' : '本次生成提示词'}</span>
            <textarea
              rows={6}
              value={prompt}
              maxLength={10000}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          {video && (
            <label className="field" htmlFor="generation-mode">
              <span>参考模式</span>
              <Select
                value={mode}
                onValueChange={(v) => {
                  if (v) {
                    if (v === 'refs' && mode === 'all')
                      setRefs(videoCandidates.map((a) => a.mediaId));
                    setMode(v);
                  }
                }}
              >
                <SelectTrigger id="generation-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    组合全部关联参考图（默认）
                  </SelectItem>
                  <SelectItem value="none">仅文字设定，不发送图片</SelectItem>
                  {video && shot?.firstFrame && (
                    <SelectItem value="first">使用本镜头自定义首帧</SelectItem>
                  )}
                  {(video || model?.protocol === 'seedream') && (
                    <SelectItem value="refs">自选参考图</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </label>
          )}
          {video && (mode === 'all' || mode === 'refs') && (
            <div className="video-reference-summary">
              <strong>
                参考图对应清单 · 已选 {selectedVideoRefs.length} 张
              </strong>
              {videoCandidates.map((a) => {
                const index = selectedVideoRefs.findIndex(
                  (r) => r.mediaId === a.mediaId,
                );
                return (
                  <label key={a.mediaId} className="video-reference-card">
                    {mode === 'refs' && (
                      <Checkbox
                        checked={refs.includes(a.mediaId)}
                        onCheckedChange={(v) =>
                          setRefs((old) =>
                            v
                              ? [...old, a.mediaId]
                              : old.filter((id) => id !== a.mediaId),
                          )
                        }
                      />
                    )}
                    <Image
                      unoptimized
                      src={a.media.url}
                      alt={a.media.name}
                      width={52}
                      height={52}
                    />
                    <span>
                      <b>{index >= 0 ? `参考图${index + 1}` : '未选中'}</b>
                      <small>{a.summary}</small>
                    </span>
                  </label>
                );
              })}
              {!videoCandidates.length && (
                <p className="helper">
                  当前分镜尚无关联图片，本次只能使用文字设定。
                </p>
              )}
              {!!missingVideoImages.length && (
                <p className="helper">
                  以下资产没有图片，将使用文字描述：
                  {missingVideoImages.join('、')}。
                </p>
              )}
              {!shot?.blockingImage && (
                <p className="helper">
                  当前分镜未绑定站位图，可生成或上传后再提交。
                </p>
              )}
            </div>
          )}
          {video && mode === 'first' && (
            <p className="helper">
              本次只发送自定义首帧，其余资产仅使用文字描述。需要同时发送角色、场景、道具、服装和站位图时，请选择“组合全部关联参考图”及支持多参考图的模型。
            </p>
          )}
          {video ? (
            <div className="actions">
              <label className="field">
                <span>时长（秒）</span>
                <input
                  type="number"
                  min={2}
                  max={15}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </label>
              <label className="field" htmlFor="generation-resolution">
                <span>分辨率</span>
                <Select
                  value={resolution}
                  onValueChange={(v) => v && setResolution(v)}
                >
                  <SelectTrigger id="generation-resolution">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {resolutions.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
          ) : (
            <label className="field" htmlFor="generation-size">
              <span>图片尺寸</span>
              <Select value={selectedSize} onValueChange={(v) => v && setSize(v)}>
                <SelectTrigger id="generation-size">
                  <SelectValue>
                    {selectedSize === 'video'
                      ? `${sizeLabel} · ${project.ratio} · ${effectiveSize || '不支持此画幅'}`
                      : selectedSize}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">
                    {sizeLabel} · {project.ratio} · {ratioSize || '不支持此画幅'}
                  </SelectItem>
                  {sizeOptions.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          {!video && sizeError && <p role="alert">{sizeError}</p>}
          {!video && model?.protocol === 'images' && selectedSize === 'video' && <p className="helper">按横向、竖向或方形选择接口支持的尺寸，实际比例以像素尺寸为准。</p>}
          {video && (
            <div className="video-request-preview">
              <p className="helper">
                风格：{project.style} · 画幅：{project.ratio} · {resolution} ·{' '}
                {duration}秒。设置、台词及已绑定资产会一起提交。
              </p>
              {minimax && (
                <details className="helper">
                  <summary>
                    MiniMax 素材链接（自动复用生成来源，可手动补充）
                  </summary>
                  <p>
                    本机上传的素材需填写模型可访问的 HTTPS
                    链接。图片按对应表顺序提交，最多8张；音色样本最多3段。
                  </p>
                  {[
                    ...(videoInput?.referenceBindings || []).map((b) => ({
                      id: b.mediaId,
                      label: b.label,
                    })),
                    ...(voicePlan?.samples || []).map((b) => ({
                      id: b.mediaId,
                      label: b.label,
                    })),
                  ].map((b) => (
                    <label className="field" key={b.id}>
                      {b.label}
                      <input
                        type="url"
                        placeholder="留空使用生成来源链接"
                        value={mediaUrls[b.id] || ''}
                        onChange={(e) =>
                          setMediaUrls({ ...mediaUrls, [b.id]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                </details>
              )}
              {voicePlan && (
                <p className="helper">音色参考：{voicePlan.note}</p>
              )}
              <details>
                <summary>查看完整提示词、图片与音色对应表</summary>
                <pre>{videoPreview || '请先处理下方问题。'}</pre>
              </details>
              {videoError && (
                <p role="alert" className="error">
                  {videoError}
                </p>
              )}
            </div>
          )}
          <p className="helper">
            {!video &&
              `图片默认沿用视频画幅 ${project.ratio}。如服务商不支持该像素尺寸，可改选其支持的尺寸。${asset?.referenceImage ? (model?.protocol === 'seedream' ? '已自动使用上传的参考图。' : '当前图片协议不支持参考图，本次仅使用提示词。') : ''}`}
            提交成功后自动返回上一工作界面，任务在后台继续处理，请保持工作台开启。提交会调用服务商并产生费用。
            {target.kind === 'asset'
              ? '结果会显示在对应资产的图片栏，预览并应用后请保存项目。'
              : video
                ? '视频完成后自动下载到对应分镜的预览区。'
                : '结果需到任务中心预览后手动应用。'}
            参考图提交已取消8MB单图和12MB合计限制；具体支持范围以所选服务商为准。
          </p>
          <Button
            disabled={
              !model?.enabled ||
              !model.hasKey ||
              (video ? !videoInput || !!videoError : !prompt.trim() || !!sizeError)
            }
            onClick={submit}
          >
            {busy ? '正在提交，请稍候…' : '提交生成任务'}
          </Button>
        </fieldset>
        <output aria-live="polite">{message}</output>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            onClose();
            onTasks();
          }}
        >
          查看生成任务
        </Button>
      </DialogContent>
    </Dialog>
  );
}
const statusNames: Record<string, string> = {
  queued: '排队中',
  submitting: '提交中 / 待核对',
  running: '生成中',
  downloading: '下载中',
  attention: '需要处理',
  failed: '生成失败',
  succeeded: '生成完成',
};
export function GenerationTasks({
  project,
  onApply,
  backgroundJobs = [],
  onJob,
}: {
  backgroundJobs?: GenerationJob[];
  onJob?: (job: GenerationJob) => void;
  project: Project;
  onApply: (job: GenerationJob) => void;
}) {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState<GenerationJob>();
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const x = await modelApi<GenerationJob[]>(
          '/api/generations?projectId=' + encodeURIComponent(project.id),
        );
        if (!active) return;
        setJobs(x);
        if (x.some((j) => j.status === 'submitting' || j.status === 'running'))
          timer = setTimeout(load, 5000);
      } catch (e) {
        if (active) setMessage((e as Error).message);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [project.id]);
  async function refresh(j: GenerationJob) {
    setBusy(j.id);
    setMessage('');
    try {
      const n = await modelApi<GenerationJob>('/api/generations', {
        action: 'refresh',
        id: j.id,
      });
      setJobs((xs) => xs.map((x) => (x.id === n.id ? n : x)));
      onJob?.(n);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  const displayedJobs = [
    ...new Map(
      [
        ...jobs,
        ...backgroundJobs.filter((j) => j.projectId === project.id),
      ].map((j) => [j.id, j]),
    ).values(),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="panel">
      <div className="panel-body">
        <h2>生成任务</h2>
        <p className="helper">
          任务和结果保存在当前项目。图片处理状态会自动更新，视频可点击“查询进度”。生成期间可继续编辑，请保持工作台开启。提交状态不明时请先核对供应商后台，不要重复生成。
        </p>
        <output aria-live="polite">{message}</output>
        {!displayedJobs.length && (
          <p>暂无生成任务。从资产或分镜中的生成按钮开始。</p>
        )}
        {displayedJobs.map((j) => (
          <div className="model-config-card" key={j.id}>
            <div className="actions">
              <strong>
                {j.target === 'video'
                  ? '视频'
                  : j.target === 'blockingImage'
                    ? '站位图'
                    : j.target === 'audio'
                      ? '配音'
                      : '图片'}{' '}
                · {statusNames[j.status] || j.status}
              </strong>
              <span>{j.model}</span>
            </div>
            <p>{j.prompt.slice(0, 130)}</p>
            <small>{new Date(j.createdAt).toLocaleString('zh-CN')}</small>
            {j.error && <p role="alert">{j.error}</p>}
            {!!j.diagnostics?.length && (
              <details className="helper">
                <summary>接口诊断记录</summary>
                {j.diagnostics.map((d, i) => (
                  <p key={i}>
                    {d.phase} · HTTP {d.httpStatus} · {d.providerStatus || '未提供状态'}<br />
                    请求编号：{d.requestId || '未提供'}；供应商任务：{d.providerTaskId || '未提供'}<br />
                    响应字段：{d.fields.join(', ') || '无'}；正文类型：{d.contentType}；视频链接字段：{d.hasVideoUrl ? '有' : '无'}
                  </p>
                ))}
              </details>
            )}
            <div className="actions">
              {j.target !== 'audio' &&
                j.status !== 'queued' &&
                j.status !== 'succeeded' &&
                j.status !== 'failed' && (
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => refresh(j)}
                  >
                    {busy === j.id ? '查询中…' : '查询进度 / 重试下载'}
                  </Button>
                )}
              {j.media && (
                <Button onClick={() => setPreview(j)}>预览并应用</Button>
              )}
              {j.target === 'video' && j.media && (
                <VideoFileButton media={j.media} projectId={j.projectId} name={j.media.name} />
              )}
            </div>
          </div>
        ))}
      </div>
      <Dialog
        open={!!preview}
        onOpenChange={(open) => !open && setPreview(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>应用生成结果</DialogTitle>
            <DialogDescription>
              应用到发起生成时的资产或镜头；已有同类素材会被替换。应用后请保存项目。
            </DialogDescription>
          </DialogHeader>
          {preview?.media &&
            (preview.target === 'video' ? (
              <video controls src={preview.media.url} style={{ width: '100%' }}>
                <track
                  kind="captions"
                  src="data:text/vtt,WEBVTT"
                  label="视频"
                />
              </video>
            ) : preview.target === 'audio' ? (
              <audio controls src={preview.media.url}>
                <track kind="captions" src="data:text/vtt,WEBVTT" />
              </audio>
            ) : (
              <Image
                unoptimized
                src={preview.media.url}
                alt="生成结果"
                width={900}
                height={600}
                style={{
                  width: '100%',
                  height: 'auto',
                  maxHeight: '55vh',
                  objectFit: 'contain',
                }}
              />
            ))}
          <Button
            onClick={() => {
              if (preview) {
                onApply(preview);
                setPreview(undefined);
              }
            }}
          >
            确认应用到原目标
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
