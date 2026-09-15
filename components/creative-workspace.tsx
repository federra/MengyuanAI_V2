'use client';
import { useId, useRef, useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  Upload,
  BookOpen,
  Bot,
  Lightbulb,
  FileText,
  Plus,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { BusinessSelect } from '@/components/skill-center';
import { builtinSkills } from '@/lib/director';
import { chooseStory, customStylePatch, storyLengths } from '@/lib/creative';
import { id, type Project, type Stage } from '@/lib/studio';
const keys = {
  创意: 'brief',
  故事: 'story',
  剧本: 'script',
  分场: 'scenes',
} as const;
type TextStage = keyof typeof keys;
export function CreativeWorkspace({
  project,
  stage,
  disabled,
  onEdit,
  onGenerate,
  onStage,
  onOpenSkills,
}: {
  onOpenSkills: (
    field: 'creativeSkillId' | 'storySkillId' | 'scriptSkillId' | 'shotSkillId',
  ) => void;
  project: Project;
  stage: TextStage;
  disabled: boolean;
  onEdit: (p: Partial<Project>) => void;
  onGenerate: (task: string, context?: string, source?: Project) => void;
  onStage: (s: Stage) => void;
}) {
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState('');
  const [planId, setPlanId] = useState('');
  const [imported, setImported] = useState('');
  const [previewId, setPreviewId] = useState('');
  const [customField, setCustomField] = useState<'videoType' | 'style' | ''>(
    '',
  );
  const [customValue, setCustomValue] = useState('');
  const versionCount = project.storyVersionCount || 3;
  const file = useRef<HTMLInputElement>(null);
  const briefInput = useRef<HTMLTextAreaElement>(null);
  const skills = [...builtinSkills, ...(project.skills || [])];
  const plans = project.storyPlans || [];
  const key = keys[stage];
  const preview =
    stage === '故事'
      ? plans.find(
          (p) => p.id === previewId && p.id !== project.selectedStoryId,
        )
      : undefined;
  const text = preview?.content ?? project[key];
  const selected = plans.find((p) => p.id === project.selectedStoryId);
  const inspected = plans.find((p) => p.id === planId);
  function generatePlans() {
    setError('');
    if (!project.brief.trim()) {
      setError('请先填写一句话创意，再生成故事方案。也可以点击“试试示例”。');
      briefInput.current?.focus();
      return;
    }
    if (plans.length + versionCount > 12) {
      setError('最多保留12个方案，请先删除不再使用的候选方案。');
      return;
    }
    onGenerate(
      'storyOptions',
      JSON.stringify({
        brief: project.brief,
        videoType: project.videoType || '剧情短片',
        style: project.style,
        ratio: project.ratio,
        storyLength: project.storyLength || '500～1000字',
        creativeSkill:
          skills.find((s) => s.id === (project.creativeSkillId || 'idea')) ||
          builtinSkills[0],
        versionCount,
      }),
    );
  }
  function openCustom(field: 'videoType' | 'style') {
    setError('');
    setCustomField(field);
    setCustomValue('');
    setDialog('custom');
  }
  function saveCustom() {
    try {
      const value = customValue.trim();
      if (!value) throw Error('请填写自定义内容');
      if (customField === 'style') onEdit(customStylePatch(project, value));
      else if (customField === 'videoType') onEdit({ videoType: value });
      setError('');
      setDialog('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    }
  }
  async function importFile(f?: File) {
    if (!f) return;
    try {
      if (f.size > 400000) throw Error('文件不能超过400KB');
      const value = (await f.text()).replace(/^\uFEFF/, '');
      if (!value.trim() || value.length > 100000)
        throw Error('文件需包含正文，且最多10万字');
      setImported(value);
      setError('');
      setDialog('import');
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取失败');
    }
  }
  function planCard(
    p: NonNullable<Project['storyPlans']>[number],
    index: number,
  ) {
    return (
      <article
        key={p.id}
        className={`creative-plan ${project.selectedStoryId === p.id ? 'selected' : ''} ${previewId === p.id ? 'previewing' : ''}`}
      >
        {stage === '故事' && (
          <button
            type="button"
            className="plan-preview-hit"
            aria-label={`预览故事：${p.title}`}
            onClick={() => setPreviewId(p.id)}
          />
        )}
        <div className={`plan-art tone-${index % 4}`}>
          <BookOpen size={28} />
          <span>方案 {String(index + 1).padStart(2, '0')}</span>
          {project.selectedStoryId === p.id && <b>当前方案</b>}
        </div>
        <div className="plan-body">
          <h3>{p.title}</h3>
          <p>{p.summary}</p>
          <div className="plan-tags">
            {p.tags.map((t, i) => (
              <span className="tag" key={i}>
                {t}
              </span>
            ))}
          </div>
          <div className="actions">
            <Button
              variant="outline"
              onClick={() => {
                setPlanId(p.id);
                setDialog('plan');
              }}
            >
              查看详情
            </Button>
            <Button
              disabled={disabled}
              onClick={() => {
                setPlanId(p.id);
                setDialog('choose');
              }}
            >
              设为当前
            </Button>
          </div>
        </div>
      </article>
    );
  }
  return (
    <section className="creative-text-workspace">
      <header className="creative-title">
        <span className="creative-icon">
          {stage === '创意' ? <Lightbulb /> : <FileText />}
        </span>
        <div>
          <h1>{stage}工作区</h1>
          <p>
            {stage === '创意'
              ? '从一句话开始，找到值得拍成短片的故事。'
              : stage === '故事'
                ? '比较故事方案，或直接编写你的故事。'
                : '编辑、导入、优化正文，再进入下一步制作。'}
          </p>
        </div>
        {stage !== '创意' && (
          <div className="actions">
            <Button variant="outline" onClick={() => file.current?.click()}>
              <Upload />
              导入正文
            </Button>
            <Button variant="outline" onClick={() => setDialog('reading')}>
              <BookOpen />
              阅读预览
            </Button>
          </div>
        )}
      </header>
      {error && (
        <p role="alert" className="biz-error">
          {error}
        </p>
      )}
      <input
        type="file"
        ref={file}
        hidden
        accept=".txt,.md"
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {stage === '创意' ? (
        <>
          <div className="creative-settings">
            <label>
              项目名称
              <input
                value={project.title}
                maxLength={150}
                onChange={(e) => onEdit({ title: e.target.value })}
              />
            </label>
            <label htmlFor="creative-type">
              视频类型
              <BusinessSelect
                id="creative-type"
                label="视频类型"
                value={project.videoType || '剧情短片'}
                options={[
                  { value: '__custom__', label: '自定义+' },
                  ...[
                    ...new Set([
                      project.videoType || '剧情短片',
                      '剧情短片',
                      '产品广告',
                      '知识科普',
                      '音乐短片',
                      '生活记录',
                    ]),
                  ].map((s) => ({ value: s, label: s })),
                ]}
                onChange={(videoType) =>
                  videoType === '__custom__'
                    ? openCustom('videoType')
                    : onEdit({ videoType })
                }
              />
            </label>
            <label htmlFor="creative-style">
              视频风格
              <BusinessSelect
                id="creative-style"
                label="视频风格"
                value={project.style}
                options={[
                  { value: '__custom__', label: '自定义+' },
                  ...[
                    ...new Set([
                      project.style,
                      ...project.assets
                        .filter((a) => a.kind === '风格')
                        .map((a) => a.name),
                      '电影质感',
                      '3D 动画',
                      '国漫水墨',
                      '日系动画',
                      '写实广告',
                      '定格动画',
                    ]),
                  ].map((s) => ({ value: s, label: s })),
                ]}
                onChange={(style) =>
                  style === '__custom__'
                    ? openCustom('style')
                    : onEdit({ style })
                }
              />
            </label>
            <label htmlFor="creative-ratio">
              视频尺寸
              <BusinessSelect
                id="creative-ratio"
                label="视频尺寸"
                value={project.ratio}
                options={['9:16', '16:9', '1:1', '4:3', '3:4', '21:9'].map(
                  (value) => ({ value, label: value }),
                )}
                onChange={(ratio) => onEdit({ ratio })}
              />
              {!['9:16', '16:9', '1:1', '4:3', '3:4', '21:9'].includes(
                project.ratio,
              ) && (
                <small>原项目比例为 {project.ratio}，可从菜单重新选择。</small>
              )}
            </label>
            <label htmlFor="creative-story-length">
              故事篇幅
              <BusinessSelect
                id="creative-story-length"
                label="故事篇幅"
                value={project.storyLength || '500～1000字'}
                options={storyLengths.map((value) => ({ value, label: value }))}
                onChange={(storyLength) => onEdit({ storyLength })}
              />
            </label>
          </div>
          <div className="creative-card">
            <div className="creative-card-heading">
              <h2>
                <Lightbulb />
                一句话创作
              </h2>
              <Button
                variant="ghost"
                onClick={() => {
                  if (project.brief.trim()) {
                    setImported(
                      '一名修复旧物的年轻人，在一台录音机里听到了来自明天的求救。',
                    );
                    setDialog('import');
                  } else
                    onEdit({
                      brief:
                        '一名修复旧物的年轻人，在一台录音机里听到了来自明天的求救。',
                    });
                }}
              >
                试试示例
              </Button>
            </div>
            <textarea
              data-stage-field="brief"
              ref={briefInput}
              aria-describedby="idea-generation-help"
              aria-label="一句话创意"
              rows={4}
              value={project.brief}
              maxLength={100000}
              placeholder="谁，在什么情境下，遇到了什么冲突，作出了什么选择？"
              onChange={(e) => onEdit({ brief: e.target.value })}
            />
            <div className="creative-editor-footer">
              <small>{project.brief.length} 字</small>
              <div className="actions">
                <label
                  className="script-skill-choice"
                  htmlFor="idea-creation-skill"
                >
                  <span>创作 Skill</span>
                  <BusinessSelect
                    id="idea-creation-skill"
                    favorites={project.favoriteSkillIds}
                    onOpenCenter={() => onOpenSkills('creativeSkillId')}
                    label="创作 Skill"
                    value={project.creativeSkillId || 'idea'}
                    onChange={(creativeSkillId) => onEdit({ creativeSkillId })}
                    options={skills
                      .filter((s) =>
                        ['创意', '故事', '全项目'].includes(s.stage),
                      )
                      .map((s) => ({ value: s.id, label: s.name }))}
                  />
                </label>
                <label
                  className="story-count-choice"
                  htmlFor="story-version-count"
                >
                  <span>版本个数</span>
                  <BusinessSelect
                    id="story-version-count"
                    label="故事版本个数"
                    value={String(versionCount)}
                    onChange={(v) => onEdit({ storyVersionCount: Number(v) })}
                    options={[1, 2, 3, 4].map((n) => ({
                      value: String(n),
                      label: `${n} 个`,
                    }))}
                  />
                </label>
                <Button disabled={disabled} onClick={generatePlans}>
                  <Sparkles />
                  AI 生成 {versionCount} 个故事方案
                </Button>
                <Button variant="outline" onClick={() => onStage('故事')}>
                  已有故事，直接编写 / 导入
                  <ArrowRight />
                </Button>
              </div>
            </div>
            <p
              id="idea-generation-help"
              className="helper"
              role={error ? 'alert' : undefined}
            >
              {error ||
                (!project.brief.trim()
                  ? '先填写一句话创意，或点击“试试示例”，再生成故事方案。'
                  : '')}
            </p>
          </div>
          <div className="creative-card">
            <div className="creative-card-heading">
              <h2>
                <BookOpen />
                故事方案 <small>{plans.length} 个候选</small>
              </h2>
              {plans.length > 0 && (
                <Button
                  variant="outline"
                  disabled={disabled || plans.length + versionCount > 12}
                  onClick={generatePlans}
                >
                  再生成 {versionCount} 个
                </Button>
              )}
            </div>
            {plans.length ? (
              <div className="creative-plans-grid">{plans.map(planCard)}</div>
            ) : (
              <div className="creative-empty">
                <BookOpen />
                <h3>让创意生长出不同的可能</h3>
                <p>
                  生成后在这里比较方案，选定后再进入故事编辑。不会自动覆盖现有故事。
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className={stage === '故事' ? 'creative-story-columns' : ''}>
          {stage === '故事' && (
            <aside className="creative-card creative-plan-list">
              <h2>故事版本</h2>
              <Button variant="outline" onClick={() => onStage('创意')}>
                <Plus />
                回到创意生成方案
              </Button>
              {plans.map(planCard)}
              {!plans.length && (
                <p className="helper">
                  还没有候选方案。你也可以直接在右侧编辑或导入故事。
                </p>
              )}
            </aside>
          )}
          <div className="creative-card creative-editor">
            <div className="creative-card-heading">
              <h2>
                <FileText />
                {stage === '故事'
                  ? preview?.title || selected?.title || '自定义故事'
                  : stage + '正文'}
              </h2>
              <small>{text.length.toLocaleString()} 字</small>
            </div>
            {preview && (
              <p className="creative-hint">
                正在预览候选故事，当前编辑内容仍保留。
                <Button variant="outline" onClick={() => setPreviewId('')}>
                  返回当前正文
                </Button>
                <Button
                  disabled={disabled}
                  onClick={() => {
                    setPlanId(preview.id);
                    setDialog('choose');
                  }}
                >
                  采用并编辑
                </Button>
              </p>
            )}
            {stage === '故事' &&
              !preview &&
              selected &&
              text !== selected.content && (
                <p className="creative-hint">
                  当前正文已在所选方案基础上修改，原方案仍保留。
                </p>
              )}
            <textarea
              data-stage-field={key}
              aria-label={`${stage}正文`}
              rows={20}
              value={text}
              readOnly={!!preview}
              maxLength={100000}
              placeholder={`在这里编写${stage}，或通过上方导入TXT / MD正文。`}
              onChange={(e) => onEdit({ [key]: e.target.value })}
            />
            <div className="creative-editor-footer">
              <div className="actions">
                {stage === '故事' && (
                  <label
                    className="script-skill-choice"
                    htmlFor="script-skill-selector"
                  >
                    <span>剧本 Skill</span>
                    <BusinessSelect
                      label="剧本 Skill"
                      id="script-skill-selector"
                      favorites={project.favoriteSkillIds}
                      onOpenCenter={() => onOpenSkills('scriptSkillId')}
                      value={project.scriptSkillId || 'script'}
                      onChange={(value) => onEdit({ scriptSkillId: value })}
                      options={skills
                        .filter(
                          (s) => s.stage === '剧本' || s.stage === '全项目',
                        )
                        .map((s) => ({ value: s.id, label: s.name }))}
                    />
                  </label>
                )}
                {(stage !== '剧本' || !project.script.trim()) && (
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      onGenerate(
                        stage === '故事'
                          ? 'story'
                          : stage === '剧本'
                            ? 'script'
                            : 'scenes',
                      )
                    }
                  >
                    <Sparkles />
                    AI {stage === '分场' ? '提取分场' : '生成' + stage}
                  </Button>
                )}
                {stage === '故事' && (
                  <Button
                    variant="outline"
                    disabled={!!preview || !text.trim() || plans.length >= 12}
                    onClick={() => {
                      const plan = {
                        id: id(),
                        title: `${project.title.slice(0, 130)} · 版本${plans.length + 1}`,
                        summary: text.slice(0, 120),
                        content: text,
                        tags: ['自定义'],
                      };
                      if (text.length > 30000) {
                        setError(
                          '故事方案最多3万字，请精简后保存；当前正文未修改。',
                        );
                        return;
                      }
                      onEdit({
                        storyPlans: [...plans, plan],
                        selectedStoryId: plan.id,
                      });
                    }}
                  >
                    <Save />
                    另存故事方案
                  </Button>
                )}
                {stage === '剧本' && (
                  <Button variant="outline" onClick={() => onStage('分场')}>
                    分场编辑（可选）
                  </Button>
                )}
              </div>
              <div className="actions">
                {stage === '剧本' && (
                  <label
                    className="script-skill-choice"
                    htmlFor="shot-skill-selector"
                  >
                    <span>分镜 Skill</span>
                    <BusinessSelect
                      id="shot-skill-selector"
                      favorites={project.favoriteSkillIds}
                      onOpenCenter={() => onOpenSkills('shotSkillId')}
                      label="分镜 Skill"
                      value={project.shotSkillId || 'shot'}
                      onChange={(shotSkillId) => onEdit({ shotSkillId })}
                      options={skills
                        .filter(
                          (s) => s.stage === '分镜' || s.stage === '全项目',
                        )
                        .map((s) => ({ value: s.id, label: s.name }))}
                    />
                  </label>
                )}
                <Button
                  disabled={!text.trim() || disabled}
                  onClick={() => {
                    if (stage === '故事') {
                      if (preview) {
                        setPlanId(preview.id);
                        setDialog('confirmScript');
                      } else if (project.script.trim())
                        setDialog('confirmScript');
                      else {
                        onStage('剧本');
                        onGenerate('script', undefined, project);
                      }
                    } else if (stage === '剧本') {
                      onStage('分镜');
                      onGenerate('shots');
                    } else onStage('分镜');
                  }}
                >
                  {stage === '故事'
                    ? '确认故事，进入剧本'
                    : stage === '剧本'
                      ? '生成分镜'
                      : '进入分镜'}
                  <ArrowRight />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog('')}>
        <DialogContent className="creative-reading">
          <DialogHeader>
            <DialogTitle>
              {dialog === 'custom'
                ? `自定义${customField === 'videoType' ? '视频类型' : '视频风格'}`
                : dialog === 'confirmScript'
                  ? '确认故事并生成剧本'
                  : dialog === 'choose'
                    ? '采用这个故事方案？'
                    : dialog === 'import'
                      ? '预览导入内容'
                      : dialog === 'plan'
                        ? inspected?.title || '故事方案'
                        : `${stage}阅读预览`}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'custom'
                ? customField === 'style'
                  ? '保存后同步新增资产库风格模板，可继续补充设定。'
                  : '填写需要的视频类型。'
                : dialog === 'confirmScript'
                  ? '将使用右侧故事生成剧本；已有故事编辑请先另存方案，已有剧本会保留至你确认应用新结果。'
                  : dialog === 'choose'
                    ? '将替换当前故事正文。已有剧本保留，镜头标记为待复核；可通过导演助手提出关联修改。'
                    : '请审阅内容后决定是否应用。'}
            </DialogDescription>
          </DialogHeader>
          {dialog === 'custom' ? (
            <input
              aria-label="自定义内容"
              value={customValue}
              maxLength={customField === 'style' ? 150 : 80}
              onChange={(e) => setCustomValue(e.target.value)}
            />
          ) : (
            <pre>
              {dialog === 'plan' || dialog === 'choose'
                ? inspected?.content
                : dialog === 'import'
                  ? imported
                  : text}
            </pre>
          )}
          {error && (
            <p role="alert" className="biz-error">
              {error}
            </p>
          )}
          <div className="actions">
            {dialog === 'custom' && <Button onClick={saveCustom}>保存</Button>}
            {dialog === 'confirmScript' && (
              <Button
                disabled={disabled}
                onClick={() => {
                  const patch = preview ? chooseStory(project, preview.id) : {};
                  const source = { ...project, ...patch };
                  if (preview) onEdit(patch);
                  setDialog('');
                  onStage('剧本');
                  onGenerate('script', undefined, source);
                }}
              >
                确认生成剧本
              </Button>
            )}
            {dialog === 'choose' && inspected && (
              <Button
                onClick={() => {
                  onEdit(chooseStory(project, inspected.id));
                  setPreviewId('');
                  setDialog('');
                  onStage('故事');
                }}
              >
                确认采用
              </Button>
            )}
            {dialog === 'import' && (
              <Button
                onClick={() => {
                  onEdit({ [key]: imported });
                  setPreviewId('');
                  setDialog('');
                }}
              >
                替换当前正文
              </Button>
            )}
            {dialog === 'plan' && inspected && (
              <>
                <Button onClick={() => setDialog('choose')}>
                  设为当前故事
                </Button>
                <Button
                  variant="outline"
                  disabled={project.selectedStoryId === inspected.id}
                  onClick={() => setDialog('deletePlan')}
                >
                  删除候选
                </Button>
              </>
            )}
            {dialog === 'deletePlan' && inspected && (
              <Button
                variant="destructive"
                onClick={() => {
                  onEdit({
                    storyPlans: plans.filter((p) => p.id !== inspected.id),
                  });
                  setDialog('');
                }}
              >
                确认删除候选
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialog('')}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function DirectorBot() {
  const uid = useId();
  return (
    <svg viewBox="0 0 84 88" aria-hidden="true">
      <defs>
        <linearGradient id={uid + 'shell'} x2=".9" y2="1">
          <stop stopColor="#ffffff" />
          <stop offset=".55" stopColor="#f1f7ff" />
          <stop offset="1" stopColor="#8badd8" />
        </linearGradient>
        <linearGradient id={uid + 'face'} x2="1" y2="1">
          <stop stopColor="#244f81" />
          <stop offset="1" stopColor="#051632" />
        </linearGradient>
        <radialGradient id={uid + 'eye'}>
          <stop stopColor="white" />
          <stop offset=".45" stopColor="#86edff" />
          <stop offset="1" stopColor="#00a7ef" />
        </radialGradient>
      </defs>
      <ellipse cx="45" cy="82" rx="26" ry="4" fill="#c4d9f5" opacity=".65" />
      <path d="M42 17 L42 8" stroke="#72a9e8" strokeWidth="3" />
      <ellipse cx="42" cy="7" rx="3" ry="6" fill="#4298f7" />
      <path
        d="M24 62 Q24 50 43 50 Q62 51 63 65 L58 78 Q42 85 26 76Z"
        fill={`url(#${uid}shell)`}
      />
      <ellipse cx="43" cy="62" rx="8" ry="4" fill="#527fbe" />
      <path
        d="M29 77 L27 84 M57 77 L61 83"
        stroke="#648fc5"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M22 58 Q15 66 11 56 M64 58 Q73 58 73 49"
        fill="none"
        stroke={`url(#${uid}shell)`}
        strokeWidth="11"
        strokeLinecap="round"
      />
      <ellipse cx="42" cy="38" rx="31" ry="26" fill={`url(#${uid}shell)`} />
      <rect
        x="17"
        y="23"
        width="51"
        height="34"
        rx="17"
        fill={`url(#${uid}face)`}
      />
      <ellipse cx="32" cy="39" rx="5" ry="9" fill={`url(#${uid}eye)`} />
      <ellipse cx="54" cy="39" rx="5" ry="9" fill={`url(#${uid}eye)`} />
      <path
        d="M39 49 Q43 52 47 49"
        fill="none"
        stroke="#70d4ff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <ellipse cx="12" cy="40" rx="4" ry="9" fill="#8eafd8" />
      <ellipse cx="72" cy="40" rx="4" ry="9" fill="#84a8d9" />
      <path
        d="M26 18 Q39 10 53 19"
        stroke="white"
        strokeWidth="3"
        fill="none"
        opacity=".8"
      />
    </svg>
  );
}
export function WorkflowAssistant({
  project,
  stage,
  onUse,
  onStage,
  onInsert,
}: {
  project: Project;
  stage: Stage;
  onUse: (id: string, instruction: string) => void;
  onInsert?: () => void;
  onStage: (s: Stage) => void;
}) {
  const choices = [...builtinSkills, ...(project.skills || [])];
  const defaultSkill =
    choices.find((s) => s.stage === stage) || builtinSkills[5];
  const [skillId, setSkillId] = useState(defaultSkill.id);
  const [expanded, setExpanded] = useState(false);
  const [instruction, setInstruction] = useState('');
  const suggestions =
    stage === '创意'
      ? ['加强核心冲突与转折', '明确受众和短片主题', '提供一个更容易拍摄的创意']
      : stage === '故事'
        ? [
            '检查人物动机与故事因果',
            '增加有依据的反转情节',
            '压缩为适合短视频的故事',
          ]
        : stage === '剧本' || stage === '分场'
          ? [
              '优化对白，让人物表达更自然',
              '调整剧情节奏与场次衔接',
              '检查人物、场景、服饰和道具的一致性',
            ]
          : [
              '优化当前分镜的提示词',
              '为场景推荐合适的拍摄手法',
              '生成更丰富的镜头角度',
              '推荐合适的音乐与音效设定',
              '检查分镜的连贯性',
              '生成分镜的视觉风格建议',
            ];
  return (
    <div className="director-island">
      <Button
        className="director-island-toggle"
        aria-expanded={expanded}
        aria-controls="director-island-panel"
        onClick={() => setExpanded(!expanded)}
      >
        <Sparkles />
        AI 导演助手 <span>{expanded ? '收起 −' : '展开 +'}</span>
      </Button>
      <aside
        id="director-island-panel"
        hidden={!expanded}
        className="workflow-assistant"
      >
        <div className="workflow-assistant-heading">
          <span>{stage === '分镜' ? <DirectorBot /> : <Bot size={28} />}</span>
          <div>
            <h2>AI 导演助手</h2>
            <p>陪你把故事变成镜头</p>
          </div>
        </div>
        <p className="assistant-welcome">
          在{stage === '剪辑' ? '成品导出' : stage}
          阶段，我可以根据你的要求提出修改，并检查相关内容是否需要同步。
        </p>
        <h3>你可以试试</h3>
        <div className="assistant-suggestions">
          {suggestions.map((s) => (
            <Button variant="outline" key={s} onClick={() => setInstruction(s)}>
              <Sparkles />
              {s}
              <ArrowRight />
            </Button>
          ))}
        </div>
        <textarea
          aria-label="导演助手修改要求"
          rows={5}
          value={instruction}
          maxLength={4000}
          placeholder="例如：优化第2个镜头，并同步受影响的对白…"
          onChange={(e) => setInstruction(e.target.value)}
        />
        <BusinessSelect
          label="选择创作Skill"
          favorites={project.favoriteSkillIds}
          value={skillId}
          options={choices.map((s) => ({ value: s.id, label: s.name }))}
          onChange={setSkillId}
        />
        <Button
          disabled={stage !== '分镜' && !instruction.trim()}
          onClick={() =>
            onUse(
              skillId,
              instruction ||
                '优化当前分镜提示词，并检查与相邻镜头的关联和连续性。',
            )
          }
        >
          <Sparkles />
          {stage === '分镜' ? '分镜优化Skill' : '预览 AI 修改'}
        </Button>
        {stage === '分镜' && onInsert && (
          <Button className="sheet-insert" variant="outline" onClick={onInsert}>
            <Plus />
            插入选中分镜
          </Button>
        )}
        <p className="helper">
          先审阅建议，再决定应用哪些修改。生成需要已配置文本模型。
        </p>
        {['分镜', '视频', '配音', '资产'].includes(stage) && (
          <div className="assistant-stage-links">
            <Button variant="outline" onClick={() => onStage('资产')}>
              管理关联资产
            </Button>
            <Button variant="outline" onClick={() => onStage('剪辑')}>
              进入成品导出
              <ArrowRight />
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
