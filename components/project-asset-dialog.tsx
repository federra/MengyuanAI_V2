'use client';
import { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { type Asset, type Project, id } from '@/lib/studio';
import { libraryEntries, copyToProject } from '@/lib/asset-library';
import { ModelPicker } from './model-picker';
import { modelApi } from './model-settings';
import {
  activeImageStatus,
  type ImageBatchRequest,
} from '@/lib/image-batch-queue';
import type { GenerationTarget } from './generation-tools';
import type { ModelConfig, GenerationJob } from '@/lib/models';
import { imageSizeForRatio } from '@/lib/models';
import type { Media } from '@/lib/studio';
import { AssetImagePreview, ImageFileButton } from './asset-image-preview';
import { BusinessSelect } from './skill-center';
import {
  defaultAssetImageSkill,
  selectedAssetImageSkill,
  wantsThreeViews,
  threeViewSkill,
  assetImageSkills,
  assetImageSkill,
  assetImagePrompt,
} from '@/lib/asset-image-skill';

export function ProjectAssetDialog({
  open,
  kind,
  project,
  projects,
  disabled,
  onClose,
  onChange,
  onSave,
  onUpload,
  onGenerate,
  onTasks,
  generationJobs,
  onBatch,
}: {
  generationJobs: GenerationJob[];
  onBatch: (request: ImageBatchRequest) => void;
  open: boolean;
  kind: string;
  project: Project;
  projects: Project[];
  disabled: boolean;
  onClose: () => void;
  onChange: (p: Partial<Project>) => void;
  onSave: () => Promise<void>;
  onUpload: (k: 'asset' | 'assetReference', id: string) => void;
  onGenerate: (t: GenerationTarget) => void;
  onTasks: () => void;
}) {
  const label = kind === '人物' ? '角色' : kind;
  const assets = project.assets.filter((a) => a.kind === kind);
  const [message, setMessage] = useState('');
  const [library, setLibrary] = useState(false);
  const [batch, setBatch] = useState(false);
  const [batchModelId, setBatchModelId] = useState('');
  const [models, setModels] = useState<ModelConfig[]>([]);
  useEffect(() => {
    if (open)
      modelApi<ModelConfig[]>('/api/models')
        .then(setModels)
        .catch((e) => setMessage(e.message));
  }, [open]);
  const [selected, setSelected] = useState<string[]>([]);
  const [concurrency, setConcurrency] = useState(2);
  const [preparing, setPreparing] = useState(false);
  const [preview, setPreview] = useState<GenerationJob | null>(null);
  const [imagePreview, setImagePreview] = useState<{
    media: Media;
    name: string;
  } | null>(null);
  const imageSkills = assetImageSkills(project);
  const defaultSkill = defaultAssetImageSkill(project, kind);
  const skillOptions = [
    { value: 'none', label: '不使用 Skill' },
    ...imageSkills.map((s) => ({ value: s.id, label: s.name })),
  ];
  function optionsFor(value: string) {
    return value !== 'inherit' && !skillOptions.some((o) => o.value === value)
      ? [...skillOptions, { value, label: '技能已不可用，请重新选择' }]
      : skillOptions;
  }
  const assetJobs = generationJobs
    .filter((j) => j.projectId === project.id && j.target === 'asset')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const locked = useRef(false);
  const generating = new Set(
    generationJobs
      .filter(
        (j) =>
          j.projectId === project.id &&
          j.target === 'asset' &&
          activeImageStatus(j.status),
      )
      .map((j) => j.targetId),
  );
  const entries = libraryEntries([
    project,
    ...projects.filter((p) => p.id !== project.id),
  ]).filter((e) => e.asset.inLibrary === true && e.asset.kind === kind);
  function edit(a: Asset, patch: Partial<Asset>) {
    onChange({
      assets: project.assets.map((x) =>
        x.id === a.id ? { ...x, ...patch } : x,
      ),
    });
  }
  function prompt(a: Asset) {
    return assetImagePrompt(project, a);
  }
  function applyImage(job: GenerationJob) {
    const asset = project.assets.find(a => a.id === job.targetId);
    if (!asset || !job.media || job.projectId !== project.id) {
      setMessage('原资产已删除或项目已切换，无法应用。'); setPreview(null); return;
    }
    edit(asset, { image: job.media, dismissedImageId: undefined });
    setMessage(`${asset.name}的生成图片已应用，请保存项目。`);
    setPreview(null);
  }
  async function save() {
    try {
      await onSave();
      setMessage('项目资产已保存');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function submitBatch() {
    if (locked.current) return;
    locked.current = true;
    setPreparing(true);
    setMessage('');
    try {
      await onSave();
      const available = await modelApi<ModelConfig[]>('/api/models');
      const model = available.find(
        (m) =>
          m.kind === 'image' &&
          m.enabled &&
          m.hasKey &&
          (batchModelId ? m.id === batchModelId : m.isDefault),
      );
      if (!model) throw Error('请先在模型设置中配置并启用图片模型');
      const queue = assets.filter(
        (a) => selected.includes(a.id) && !generating.has(a.id),
      );
      if (!queue.length) throw Error('所选资产已在生成中，请选择其他资产');
      // Resolve every skill and snapshot all inputs before transferring ownership.
      onBatch({
        projectId: project.id,
        projectTitle: project.title,
        assetKind: kind,
        modelName: model.model,
        concurrency,
        items: queue.map((a) => ({
          id: id(),
          name: a.name,
          input: {
            modelConfigId: model.id,
            projectId: project.id,
            targetId: a.id,
            target: 'asset',
            prompt: prompt(a),
            ratio: project.ratio,
            duration: 5,
            resolution: '720p',
            size: imageSizeForRatio(project.ratio, model.protocol, model.model),
            referenceIds:
              model.protocol === 'seedream' && a.referenceImage
                ? [a.referenceImage.id]
                : [],
          },
        })),
      });
      onClose();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      locked.current = false;
      setPreparing(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !preparing) onClose();
      }}
    >
      <DialogContent className="project-assets-dialog">
        <DialogHeader>
          <DialogTitle>{label}设置</DialogTitle>
          <DialogDescription>
            {project.title} ·
            默认仅保存在当前项目，点击“添加到资产中心”后才可跨项目复用。
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={disabled || preparing}>
          <div className="project-assets-toolbar">
            <Button
              variant="outline"
              disabled={project.assets.length >= 200}
              onClick={() =>
                onChange({
                  assets: [
                    ...project.assets,
                    {
                      id: id(),
                      kind,
                      name: `新${label}`,
                      description: '',
                      inLibrary: false,
                    },
                  ],
                })
              }
            >
              新增{label}
            </Button>
            <Button variant="outline" onClick={save}>
              保存{label}
            </Button>
            <Button variant="outline" onClick={() => setLibrary(!library)}>
              从资产库添加
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify({ assets }, null, 2)], {
                    type: 'application/json',
                  }),
                );
                const a = document.createElement('a');
                a.href = url;
                a.download = label + '资产.json';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              {label}导出
            </Button>
            <Button variant="outline" onClick={onTasks}>
              查看生成任务
            </Button>
            <div className="asset-default-skill">
              <span>默认生图 Skill</span>
              <BusinessSelect
                label="默认生图 Skill"
                value={defaultSkill}
                options={optionsFor(defaultSkill)}
                favorites={project.favoriteSkillIds}
                onChange={(value) =>
                  onChange({
                    assetImageSkillIds: {
                      ...project.assetImageSkillIds,
                      [kind]: value,
                    },
                  })
                }
              />
            </div>
            <Button
              className="asset-batch-button"
              variant="outline"
              disabled={!assets.length}
              onClick={() => {
                setSelected(
                  assets.filter((a) => !generating.has(a.id)).map((a) => a.id),
                );
                setBatch(!batch);
              }}
            >
              批量生成{label}图片
            </Button>
          </div>
          {library && (
            <section className="project-library-picker">
              <h3>选择已加入资产中心的{label}</h3>
              {!entries.length && <p>资产库暂时没有此类资产，请先添加。</p>}
              {entries.map((e) => (
                <Button
                  key={e.projectId + e.asset.id}
                  variant="outline"
                  onClick={() => {
                    try {
                      const copied = copyToProject(project, e);
                      onChange({
                        assets: copied.project.assets.map((a) =>
                          a.id === copied.asset.id && e.projectId !== project.id
                            ? { ...a, inLibrary: false }
                            : a,
                        ),
                      });
                      setMessage('已调用到当前项目');
                      setLibrary(false);
                    } catch (err) {
                      setMessage((err as Error).message);
                    }
                  }}
                >
                  {e.asset.name} · {e.projectTitle}
                </Button>
              ))}
            </section>
          )}
          {batch && (
            <section className="project-batch">
              <ModelPicker
                models={models}
                kind="image"
                value={batchModelId}
                onChange={setBatchModelId}
                disabled={preparing}
              />
              <p>
                按每项的生图 Skill 生成，未单独选择的使用顶部默认
                Skill。提交后自动返回工作台，后台继续生成，完成后弹窗提醒。结果不会自动覆盖现有图片。
              </p>
              <label>
                并发数{' '}
                <select
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <Button
                disabled={
                  preparing || !selected.some((id) => !generating.has(id))
                }
                onClick={submitBatch}
              >
                {preparing
                  ? '正在提交…'
                  : `后台生成 ${selected.filter((id) => !generating.has(id)).length} 项`}
              </Button>
              <span>参考图仅在模型协议支持时发送。</span>
            </section>
          )}
          <output aria-live="polite">{message}</output>
          <div className="project-assets-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    '序号',
                    `${label}名称`,
                    `${label}描述`,
                    ...(kind === '人物' ? ['音色'] : []),
                    '参考图',
                    '图片',
                    '操作',
                  ].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assets.map((a, i) => {
                  const latest = assetJobs.find((j) => j.targetId === a.id);
                  const completed = assetJobs.find(
                    (j) =>
                      j.targetId === a.id &&
                      j.status === 'succeeded' &&
                      j.media,
                  );
                  const candidate =
                    completed?.media && completed.media.id !== a.image?.id && completed.media.id !== a.dismissedImageId
                      ? completed
                      : undefined;
                  const shownImage = a.image || candidate?.media;
                  return (
                    <tr key={a.id}>
                      <td>
                        {batch && (
                          <Checkbox
                            aria-label={'选择' + a.name}
                            checked={selected.includes(a.id)}
                            disabled={generating.has(a.id)}
                            onCheckedChange={(v) =>
                              setSelected((s) =>
                                v ? [...s, a.id] : s.filter((x) => x !== a.id),
                              )
                            }
                          />
                        )}{' '}
                        {i + 1}
                      </td>
                      <td>
                        <textarea
                          aria-label={label + '名称' + (i + 1)}
                          maxLength={150}
                          value={a.name}
                          onChange={(e) => edit(a, { name: e.target.value })}
                        />
                      </td>
                      <td>
                        <textarea
                          className="asset-description-input"
                          aria-label={label + '描述' + (i + 1)}
                          maxLength={10000}
                          value={a.description}
                          placeholder="描述外观、材质、风格与固定设定…"
                          onChange={(e) =>
                            edit(a, { description: e.target.value })
                          }
                        />
                      </td>
                      {kind === '人物' && (
                        <td>
                          <select
                            aria-label={a.name + '音色'}
                            value={a.attributes?.声音资产 || ''}
                            onChange={(e) =>
                              edit(a, {
                                attributes: {
                                  ...a.attributes,
                                  声音资产: e.target.value,
                                },
                              })
                            }
                          >
                            <option value="">选择项目音色</option>
                            {project.assets
                              .filter((x) => x.kind === '声音')
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name}
                                </option>
                              ))}
                          </select>
                          {project.assets.find(
                            (x) => x.id === a.attributes?.声音资产,
                          )?.audio && (
                            <a
                              target="_blank"
                              rel="noreferrer"
                              href={
                                project.assets.find(
                                  (x) => x.id === a.attributes?.声音资产,
                                )?.audio?.url
                              }
                            >
                              试听音色
                            </a>
                          )}
                          <small>使用当前项目声音资产</small>
                        </td>
                      )}
                      <td>
                        {a.referenceImage ? (
                          <button
                            type="button"
                            className="asset-preview-trigger"
                            aria-label={`预览${a.name}参考图`}
                            onClick={() =>
                              setImagePreview({
                                media: a.referenceImage!,
                                name: a.name + ' · 参考图',
                              })
                            }
                          >
                            <Image
                              unoptimized
                              src={a.referenceImage.url}
                              alt={a.name + '参考图'}
                              width={160}
                              height={110}
                            />
                          </button>
                        ) : (
                          <div className="project-asset-placeholder">
                            暂无参考图
                          </div>
                        )}
                        <div className="actions">
                          <Button
                            variant="outline"
                            onClick={() => onUpload('assetReference', a.id)}
                          >
                            上传
                          </Button>
                          <Button
                            variant="outline"
                            disabled={!a.referenceImage}
                            onClick={() =>
                              edit(a, { referenceImage: undefined })
                            }
                          >
                            清除
                          </Button>
                        </div>
                      </td>
                      <td>
                        {shownImage ? (
                          <button
                            type="button"
                            className="asset-preview-trigger"
                            aria-label={`预览${a.name}图片`}
                            onClick={() =>
                              !a.image && candidate ? setPreview(candidate) : setImagePreview({
                                media: shownImage,
                                name: a.name,
                              })
                            }
                            title={a.image ? '查看当前图片' : '查看生成结果'}
                          >
                            <Image
                              unoptimized
                              src={shownImage.url}
                              alt={a.name + (a.image ? '' : '生成结果')}
                              width={160}
                              height={110}
                            />
                          </button>
                        ) : (
                          <div className="project-asset-placeholder">
                            {generating.has(a.id)
                              ? '生成中，图片返回后显示在这里…'
                              : '暂无图片'}
                          </div>
                        )}
                        {candidate?.media && (
                          <div className="asset-returned-image">
                            <span>生成完成 · 待应用</span>
                            {a.image && (
                              <button
                                type="button"
                                className="asset-preview-trigger"
                                aria-label={`预览${a.name}新生成图片`}
                                onClick={() => setPreview(candidate)}
                              >
                                <Image
                                  unoptimized
                                  src={candidate.media.url}
                                  alt={a.name + '新生成图片'}
                                  width={160}
                                  height={110}
                                />
                              </button>
                            )}
                            <div className="actions">
                              <Button variant="outline" onClick={() => setPreview(candidate)}>预览</Button>
                              <Button onClick={() => applyImage(candidate)}>{a.image ? '替换' : '应用'}</Button>
                            </div>
                          </div>
                        )}
                        {latest?.error && (
                          <small
                            className="asset-generation-error"
                            role="alert"
                          >
                            {latest.error}
                            <button type="button" onClick={onTasks}>
                              查看任务详情
                            </button>
                          </small>
                        )}
                        <div className="actions">
                          <Button
                            variant="outline"
                            onClick={() => onUpload('asset', a.id)}
                          >
                            上传
                          </Button>
                          <Button
                            variant="outline"
                            disabled={!shownImage}
                            onClick={() => edit(a, { image: undefined, dismissedImageId: completed?.media?.id || a.image?.id })}
                          >
                            清除
                          </Button>
                          <ImageFileButton
                            onSelect={(media) => { edit(a, {image:media, dismissedImageId:completed?.media?.id || a.dismissedImageId}); setMessage('已应用所选图片，保存项目后永久保留。'); }}
                            media={shownImage}
                            projectId={project.id}
                            name={a.name}
                          />
                        </div>
                        {kind === '人物' && (
                          <label>
                            <Checkbox
                              checked={wantsThreeViews(a)}
                              onCheckedChange={(v) =>
                                edit(a, {
                                  ...(!v && selectedAssetImageSkill(project, a) === threeViewSkill ? { imageSkillId: 'none' } : {}),
                                  attributes: {
                                    ...a.attributes,
                                    三视图: v ? '是' : '否',
                                  },
                                })
                              }
                            />{' '}
                            三视图
                          </label>
                        )}
                        <div className="asset-row-skill">
                          <span>生图 Skill</span>
                          <BusinessSelect
                            label={`${a.name}的生图 Skill`}
                            value={a.imageSkillId || 'inherit'}
                            favorites={project.favoriteSkillIds}
                            options={[
                              {
                                value: 'inherit',
                                label: `跟随默认 · ${skillOptions.find((o) => o.value === defaultSkill)?.label || '技能不可用'}`,
                              },
                              ...optionsFor(a.imageSkillId || 'inherit'),
                            ]}
                            onChange={(value) =>
                              edit(a, {
                                imageSkillId:
                                  value === 'inherit' ? undefined : value,
                              })
                            }
                          />
                        </div>
                      </td>
                      <td>
                        <div className="project-asset-actions">
                          <Button
                            variant="outline"
                            onClick={() => setLibrary(!library)}
                          >
                            资产库
                          </Button>
                          <Button
                            variant="outline"
                            disabled={a.inLibrary === true}
                            onClick={() => {
                              edit(a, { inLibrary: true });
                              setMessage('已添加到资产中心，请保存项目。');
                            }}
                          >
                            {a.inLibrary ? '已在资产中心' : '添加到资产中心'}
                          </Button>
                          <Button
                            className="asset-generate-button"
                            disabled={!a.name.trim() || generating.has(a.id)}
                            aria-busy={generating.has(a.id)}
                            onClick={() => {
                              try {
                                onGenerate({
                                  id: a.id,
                                  kind: 'asset',
                                  prompt: prompt(a),
                                  skillName: assetImageSkill(project, a)?.name,
                                });
                              } catch (e) {
                                setMessage((e as Error).message);
                              }
                            }}
                          >
                            {latest?.status === 'queued'
                              ? '排队中…'
                              : generating.has(a.id)
                                ? '生成中…'
                                : '生成图片'}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={project.shots.some((s) =>
                              s.references.includes(a.id),
                            )}
                            title="已被分镜引用时请先解除引用"
                            onClick={() => {
                              if (
                                window.confirm(
                                  '删除当前项目中的' + a.name + '？',
                                )
                              )
                                onChange({
                                  assets: project.assets.filter(
                                    (x) => x.id !== a.id,
                                  ),
                                });
                            }}
                          >
                            删除
                          </Button>
                        </div>
                        <small aria-live="polite">
                          {latest?.status === 'queued'
                            ? '已加入后台队列'
                            : generating.has(a.id)
                              ? '后台生成中，可关闭此窗口'
                              : ''}
                        </small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!assets.length && (
              <p className="asset-empty">
                暂无{label}，点击“新增{label}”开始。
              </p>
            )}
          </div>
        </fieldset>
        {preparing && <output>正在保存项目并提交后台任务…</output>}
        {imagePreview && (
          <AssetImagePreview
            key={imagePreview.media.id}
            {...imagePreview}
            projectId={project.id}
            onClose={() => setImagePreview(null)}
          />
        )}
        <Dialog
          open={!!preview}
          onOpenChange={(open) => !open && setPreview(null)}
        >
          <DialogContent className="asset-result-dialog">
            <DialogHeader>
              <DialogTitle>应用生成图片</DialogTitle>
              <DialogDescription>
                {project.assets.find((a) => a.id === preview?.targetId)?.name} ·
                确认后关联到该资产，请保存项目。
              </DialogDescription>
            </DialogHeader>
            {preview?.media && (
              <Image
                unoptimized
                src={preview.media.url}
                alt="生成图片预览"
                width={1024}
                height={768}
                className="asset-result-preview"
              />
            )}
            <Button
              onClick={() => preview && applyImage(preview)}
            >
              确认应用图片
            </Button>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
