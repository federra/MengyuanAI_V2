'use client';
import { useRef, useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  Upload,
  BookOpen,
  Lightbulb,
  FileText,
  PenLine,
  ChevronDown,
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { builtinSkills } from '@/lib/director';
import { chooseStory, storyLengths } from '@/lib/creative';
import { type Project, type Stage } from '@/lib/studio';
const keys = {
  创意: 'brief',
  故事: 'story',
  剧本: 'script',
  分场: 'scenes',
} as const;
type TextStage = keyof typeof keys;
function scriptLines(text: string) {
  let offset = 0;
  const result = [];
  for (const line of text.split('\n')) {
    result.push({ line, start: offset });
    offset += line.length + 1;
  }
  return result;
}
export function CreativeWorkspace({
  project,
  stage,
  disabled,
  onEdit,
  onGenerate,
  onStage,
  onOpenSkills,
  onImportText,
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
  onImportText?: (kind?: 'story' | 'script' | 'shots') => void;
}) {
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState('');
  const [planId, setPlanId] = useState('');
  const [imported, setImported] = useState('');
  const [previewId, setPreviewId] = useState('');
  const versionCount = 3;
  const [storyWidth, setStoryWidth] = useState(340);
  const [scriptEditing, setScriptEditing] = useState(false);
  const storyColumns = useRef<HTMLDivElement>(null);
  const scriptInput = useRef<HTMLTextAreaElement>(null);
  function resizeStoryColumn(clientX: number) {
    if (!storyColumns.current) return;
    const rect = storyColumns.current.getBoundingClientRect();
    setStoryWidth(Math.max(260, Math.min(700, Math.min(rect.width * 0.6, clientX - rect.left))));
  }
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
  const formattedLines = scriptLines(text);
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
    if (stage === '创意') onStage('故事');
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
        </div>
      </article>
    );
  }
  return (
    <section className={`creative-text-workspace ${stage === '创意' ? 'idea-stage' : stage === '故事' ? 'story-stage' : stage === '剧本' ? 'script-stage' : ''}`}>
      <header className="creative-title">
        <span className="creative-icon">
          {stage === '创意' ? <Lightbulb /> : stage === '剧本' ? <PenLine /> : <FileText />}
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
        {(stage === '故事' || stage === '剧本') && (
          <Button variant="outline" onClick={() => onImportText?.()} disabled={disabled}>
            <Upload />
            导入文本
          </Button>
        )}
        {stage !== '创意' && stage !== '故事' && stage !== '剧本' && (
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
      {stage === '创意' && <div className="creative-direct-import">
        <span>已有故事/剧本/分镜？</span>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" disabled={disabled} />}>
            <Upload />
            直接编写/导入 <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onImportText?.('story')}>导入故事</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onImportText?.('script')}>导入剧本</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onImportText?.('shots')}>导入分镜脚本</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
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
          <div className="creative-card creative-idea-card">
              <div className="creative-idea-editor">
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
              aria-label="一句话创意"
              rows={4}
              value={project.brief}
              maxLength={100000}
              placeholder="谁，在什么情境下，遇到了什么冲突，作出了什么选择？"
              onChange={(e) => onEdit({ brief: e.target.value })}
                />
                <label className="creative-story-length" htmlFor="creative-story-length">
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
                <Button disabled={disabled} onClick={generatePlans}>
                  <Sparkles />
                  AI 生成 3 个故事方案
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div
          ref={storyColumns}
          className={stage === '故事' ? 'creative-story-columns' : ''}
          style={stage === '故事' ? { '--story-list-width': `${storyWidth}px` } as React.CSSProperties : undefined}
        >
          {stage === '故事' && (
            <aside className="creative-card creative-plan-list">
              <h2>故事版本</h2>
              <div className="story-plan-scroll" aria-label="故事版本列表">
                {plans.map(planCard)}
                {!plans.length && (
                  <p className="helper">
                    还没有候选方案。你也可以直接在右侧编辑或导入故事。
                  </p>
                )}
              </div>
              <Button
                className="story-regenerate-button"
                disabled={disabled || plans.length + versionCount > 12}
                onClick={generatePlans}
              >
                <Sparkles />
                AI 再来 {versionCount} 个
              </Button>
            </aside>
          )}
          {stage === '故事' && (
            <button
              type="button"
              className="story-column-resizer"
              aria-label={`拖动调整故事版本栏宽度，当前 ${storyWidth} 像素；方向键可微调`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                e.currentTarget.classList.add('dragging');
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) resizeStoryColumn(e.clientX);
              }}
              onPointerUp={(e) => {
                resizeStoryColumn(e.clientX);
                e.currentTarget.releasePointerCapture(e.pointerId);
                e.currentTarget.classList.remove('dragging');
              }}
              onLostPointerCapture={(e) => e.currentTarget.classList.remove('dragging')}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  setStoryWidth((width) => Math.max(260, Math.min(700, width + (e.key === 'ArrowRight' ? 20 : -20))));
                }
              }}
            />
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
            {stage === '剧本' && !scriptEditing && (
              <button
                type="button"
                className="formatted-script"
                data-director-target="project"
                data-director-id={project.id}
                data-director-field="script"
                aria-label="选中文字可用AI修改，点击可编辑剧本正文"
                onClick={() => { if (window.getSelection()?.toString().trim()) return; setScriptEditing(true); requestAnimationFrame(() => scriptInput.current?.focus()); }}
              >
                {formattedLines.map(({ line, start }, index) => {
                  const scene = /^\s*(?:第[一二三四五六七八九十百千0-9]+场|场景\s*[0-9一二三四五六七八九十]+)/.test(line);
                  const dialogue = /^(\s*[^：:\s]{1,12}[：:])(.*)$/.exec(line);
                  return <span key={index} data-director-line-start={start} data-director-line-length={line.length} className={scene ? 'script-scene' : dialogue ? 'script-dialogue' : 'script-line'}>
                    {dialogue ? <><strong>{dialogue[1]}</strong>{dialogue[2]}</> : line || '\u00a0'}
                  </span>;
                })}
              </button>
            )}
            <textarea
              ref={scriptInput}
              className={stage === '剧本' && !scriptEditing ? 'script-input-hidden' : undefined}
              data-stage-field={key}
              data-director-readonly={preview ? 'true' : undefined}
              aria-label={`${stage}正文`}
              rows={20}
              value={text}
              readOnly={!!preview}
              maxLength={100000}
              placeholder={`在这里编写${stage}，或通过上方导入TXT / MD正文。`}
              onChange={(e) => onEdit({ [key]: e.target.value })}
              onBlur={() => { if (stage === '剧本') setScriptEditing(false); }}
            />
            <div
              className={`creative-editor-footer${stage === '故事' ? ' creative-story-footer' : stage === '剧本' ? ' creative-script-footer' : ''}`}
            >
              {stage !== '故事' && <div className="actions">
                {(stage !== '剧本' || !project.script.trim()) && (
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      onGenerate(stage === '剧本' ? 'script' : 'scenes')
                    }
                  >
                    <Sparkles />
                    AI {stage === '分场' ? '提取分场' : '生成' + stage}
                  </Button>
                )}
              </div>}
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
              {dialog === 'confirmScript'
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
              {dialog === 'confirmScript'
                  ? '将使用右侧故事生成剧本；已有故事编辑请先另存方案，已有剧本会保留至你确认应用新结果。'
                  : dialog === 'choose'
                    ? '将替换当前故事正文。已有剧本保留，镜头标记为待复核；可通过导演助手提出关联修改。'
                    : '请审阅内容后决定是否应用。'}
            </DialogDescription>
          </DialogHeader>
          {(
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
