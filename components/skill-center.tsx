'use client';
import { readApiResponse, progressType } from '@/lib/api-response';
import { useEffect, useRef, useState } from 'react';
import {
  Blocks,
  Plus,
  Upload,
  Download,
  Sparkles,
  Search,
  Copy,
  Pencil,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { builtinSkills, type Skill } from '@/lib/director';
import { id, validateProject, type Project } from '@/lib/studio';
import { download } from '@/lib/export';
import {
  exportSkillFile,
  readSkillFile,
  type SkillFileFormat,
} from '@/lib/skill-files';
import { inspectSkill, skillStages as scopes } from '@/lib/skill-quality';
type ImportReport = {
  adapted: boolean;
  issues: string[];
  changes: string[];
  note: string;
};
export function BusinessSelect({
  value,
  options,
  onChange,
  label,
  id,
  favorites,
  onOpenCenter,
}: {
  favorites?: string[];
  onOpenCenter?: () => void;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  label: string;
  id?: string;
}) {
  return (
    <div className="skill-select-control">
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue>
            {options.find((o) => o.value === value)?.label || label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {[...options]
            .sort(
              (a, b) =>
                Number(favorites?.includes(b.value) || false) -
                Number(favorites?.includes(a.value) || false),
            )
            .map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {favorites?.includes(o.value) ? '★ ' : ''}
                {o.label}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {onOpenCenter && (
        <Button type="button" variant="outline" onClick={onOpenCenter}>
          skill中心
        </Button>
      )}
    </div>
  );
}
export function SkillCenter({
  project,
  projects,
  disabled,
  onChange,
  onUse,
  selectionStage,
  onBack,
}: {
  selectionStage?: string;
  onBack?: () => void;
  project: Project;
  projects: Project[];
  disabled: boolean;
  onChange: (p: Project) => void;
  onUse: (s: Skill) => void;
}) {
  const [exporting, setExporting] = useState<Skill | null>(null);
  const [exportFormat, setExportFormat] = useState<SkillFileFormat>('json');
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState(selectionStage || '全部阶段');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const favorites = project.favoriteSkillIds || [];
  const [source, setSource] = useState('当前项目');
  const [draft, setDraft] = useState<Skill | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<{
    source: string;
    filename: string;
  } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const importSequence = useRef({ value: 0 });
  useEffect(() => {
    const sequence = importSequence.current;
    return () => {
      sequence.value++;
    };
  }, []);
  const file = useRef<HTMLInputElement>(null);
  const skills = [
    ...builtinSkills.map((skill) => ({ skill, source: '内置', own: false })),
    ...(project.skills || []).map((skill) => ({
      skill,
      source: project.title,
      own: true,
    })),
  ];
  if (source === '所有项目')
    for (const p of projects)
      if (p.id !== project.id)
        for (const skill of p.skills || [])
          skills.push({ skill, source: p.title, own: false });
  const rows = skills
    .filter(
      ({ skill, source: name }) =>
        (stage === '全部阶段' ||
          skill.stage === stage ||
          (selectionStage && skill.stage === '全项目')) &&
        (!onlyFavorites || favorites.includes(skill.id)) &&
        `${skill.name} ${skill.content} ${name}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(favorites.includes(b.skill.id)) -
        Number(favorites.includes(a.skill.id)),
    );
  function favorite(skill: Skill, own: boolean) {
    try {
      const local = own || builtinSkills.some((s) => s.id === skill.id);
      const selected = local ? skill : { ...skill, id: id() };
      const exists = favorites.includes(selected.id);
      const next = {
        ...project,
        skills: local ? project.skills : [...(project.skills || []), selected],
        favoriteSkillIds: exists
          ? favorites.filter((s) => s !== selected.id)
          : [...favorites, selected.id],
      };
      validateProject(next);
      onChange(next);
      setNotice(
        exists
          ? '已取消收藏，请保存项目。'
          : local
            ? '已收藏，工作流选择列表会优先显示；请保存项目。'
            : '已复制并收藏到当前项目，请保存项目。',
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function save() {
    if (!draft) return;
    try {
      if (!draft.name.trim() || !draft.content.trim() || !draft.version.trim())
        throw Error('请填写技能名称、版本和指令');
      if (report) {
        const check = inspectSkill(draft);
        if (!check.skill)
          throw Error('保存前复检未通过：' + check.issues.join(' '));
      }
      const next = {
        ...project,
        skills: [
          ...(project.skills || []).filter((s) => s.id !== draft.id),
          draft,
        ],
      };
      validateProject(next);
      onChange(next);
      setDraft(null);
      setImportFile(null);
      setReport(null);
      setError('');
      setNotice('技能已更新，请点击页面顶部“保存”保存当前项目。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    }
  }
  async function read(file: File | undefined) {
    if (!file || importing) return;
    try {
      await checkImport(await readSkillFile(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败');
    }
  }
  async function checkImport(input: { source: string; filename: string }) {
    if (importing) return;
    const sequence = ++importSequence.current.value;
    setImporting(true);
    setImportFile(input);
    setReport(null);
    setDraft(null);
    setError('');
    setNotice(
      '正在检查格式、适用阶段和外部依赖；不兼容时将自动调用文本模型适配。',
    );
    try {
      const response = await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: progressType },
        body: JSON.stringify(input),
      });
      const data = (await readApiResponse(
        response,
      )) as Partial<ImportReport> & {
        error?: string;
        skill?: unknown;
      };
      if (sequence !== importSequence.current.value) return;
      if (!response.ok) throw Error(data.error || '导入质检失败');
      const checked = inspectSkill(data.skill);
      if (!checked.skill)
        throw Error('导入结果未通过检查：' + checked.issues.join(' '));
      setDraft({ ...checked.skill, id: id() });
      setReport({
        adapted: data.adapted === true,
        issues: data.issues || [],
        changes: data.changes || [],
        note: data.note || '',
      });
      setNotice('质检完成，请审阅后保存技能。');
    } catch (e) {
      if (sequence !== importSequence.current.value) return;
      setError(e instanceof Error ? e.message : '导入质检失败');
      setNotice(
        '尚未导入技能，原文件保持不变。可以重新上传，或点击“重新质检并适配”。',
      );
    } finally {
      if (sequence === importSequence.current.value) setImporting(false);
    }
  }
  const history = (project.changeLog || [])
    .filter((r) => r.skill)
    .slice()
    .reverse()
    .slice(0, 8);
  return (
    <section className="business-hub skill-hub">
      <header className="biz-heading">
        <div className="biz-heading-icon">
          <Blocks />
        </div>
        <div>
          <h1>skill中心</h1>
          <p>把创作经验变成可复用技能，随时交给导演助手执行。</p>
        </div>
        <div className="actions">
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              返回创作
            </Button>
          )}
          <Button
            variant="outline"
            disabled={disabled || importing}
            onClick={() => file.current?.click()}
          >
            <Upload />
            {importing ? '正在质检与适配…' : '导入技能'}
          </Button>
          <Button
            disabled={disabled || importing}
            onClick={() => {
              setError('');
              setReport(null);
              setImportFile(null);
              setDraft({
                id: id(),
                name: '',
                version: '1.0',
                stage: '全项目',
                content: '',
              });
            }}
          >
            <Plus />
            新建 Skill
          </Button>
        </div>
      </header>
      <input
        ref={file}
        hidden
        type="file"
        accept=".md,.txt,.json,.zip"
        onChange={(e) => {
          void read(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error && (
        <p role="alert" className="biz-error">
          {error}
        </p>
      )}
      {notice && <output className="biz-notice">{notice}</output>}
      <p className="biz-muted">
        支持 MD / TXT / JSON（100KB以内）及 ZIP
        技能包（5MB以内，展开的文本合计100KB以内）。兼容格式直接导入；不兼容时自动使用已配置的文本模型转换，可能产生模型调用费用。转换后可查看问题、修改说明并编辑，再保存到当前项目。
      </p>
      {importFile && error && !importing && !draft && (
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => void checkImport(importFile)}
        >
          重新质检并适配
        </Button>
      )}
      <div className="biz-stats">
        <div>
          <span>可用内置技能</span>
          <strong>{builtinSkills.length}</strong>
          <small>覆盖创意到连续性审校</small>
        </div>
        <div>
          <span>当前项目技能</span>
          <strong>
            {project.skills?.length || 0}
            <em>/ 30</em>
          </strong>
          <small>{project.title}</small>
        </div>
        <div>
          <span>已应用技能修改</span>
          <strong>
            {(project.changeLog || []).filter((r) => r.skill && !r.undo).length}
          </strong>
          <small>按项目修改记录统计</small>
        </div>
      </div>
      <div className="biz-columns">
        <div className="biz-card">
          <div className="biz-toolbar">
            <Button
              variant={onlyFavorites ? 'default' : 'outline'}
              onClick={() => setOnlyFavorites(!onlyFavorites)}
            >
              <Star />
              {onlyFavorites ? '查看全部' : '只看收藏'}
            </Button>
            <label className="biz-search">
              <Search size={16} />
              <input
                aria-label="搜索技能"
                placeholder="搜索技能名称或指令…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <BusinessSelect
              value={stage}
              options={['全部阶段', ...scopes].map((s) => ({
                value: s,
                label: s,
              }))}
              onChange={setStage}
              label="创作阶段"
            />
            <BusinessSelect
              value={source}
              options={['当前项目', '所有项目'].map((s) => ({
                value: s,
                label: s,
              }))}
              onChange={setSource}
              label="技能来源"
            />
          </div>
          <div className="skill-grid">
            {rows.map(({ skill, source: name, own }, index) => (
              <article
                className="skill-card"
                key={`${name}-${skill.id}-${index}`}
              >
                <div className="skill-card-top">
                  <Button
                    variant="ghost"
                    disabled={disabled || importing}
                    aria-label={
                      (favorites.includes(skill.id) ? '取消收藏' : '收藏') +
                      skill.name
                    }
                    aria-pressed={favorites.includes(skill.id)}
                    onClick={() => favorite(skill, own)}
                  >
                    <Star
                      fill={
                        favorites.includes(skill.id) ? 'currentColor' : 'none'
                      }
                    />
                    {favorites.includes(skill.id) ? '已收藏' : '收藏'}
                  </Button>
                  <span className="biz-icon">
                    <Sparkles size={20} />
                  </span>
                  <span className="tag">{skill.stage}</span>
                </div>
                <h3>{skill.name}</h3>
                <small>
                  {name} · v{skill.version}
                </small>
                <p>{skill.content}</p>
                <div className="actions">
                  <Button
                    disabled={
                      disabled ||
                      importing ||
                      (!!selectionStage &&
                        ![selectionStage, '全项目'].includes(skill.stage))
                    }
                    onClick={() => {
                      setReport(null);
                      setImportFile(null);
                      if (own || builtinSkills.some((s) => s.id === skill.id))
                        onUse(skill);
                      else {
                        setDraft({ ...skill, id: id() });
                        setNotice('先将此技能保存到当前项目，再调用。');
                      }
                    }}
                  >
                    <Sparkles />
                    {own || name === '内置'
                      ? selectionStage
                        ? '选择并返回'
                        : '调用技能'
                      : '复制到项目'}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={disabled || importing}
                    aria-label={own ? '编辑技能' : '复制编辑'}
                    onClick={() => {
                      setError('');
                      setReport(null);
                      setImportFile(null);
                      setDraft({ ...skill, id: own ? skill.id : id() });
                    }}
                  >
                    {own ? <Pencil /> : <Copy />}
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`下载技能：${skill.name}`}
                    onClick={() => setExporting(skill)}
                  >
                    <Download />
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {!rows.length && (
            <p className="biz-empty">
              没有找到符合条件的技能。可以清除筛选或新建技能。
            </p>
          )}
        </div>
        <aside className="biz-card">
          <h2>导演助手 · 技能工作流</h2>
          <ol className="skill-steps">
            <li>选择技能和修改范围</li>
            <li>描述这次需要修改的内容</li>
            <li>查看故事、剧本与镜头关联建议</li>
            <li>勾选修改项，确认后应用</li>
          </ol>
          <p className="biz-muted">
            Skill
            是发给文本模型的创作指令。调用后先预览修改，可在修改记录中撤销。
          </p>
          <h3>最近调用</h3>
          {history.length ? (
            history.map((r) => (
              <div className="biz-log" key={r.id}>
                <b>{r.skill?.name}</b>
                <p>{r.name}</p>
                <small>{new Date(r.time).toLocaleString('zh-CN')}</small>
              </div>
            ))
          ) : (
            <p className="biz-muted">当前项目尚无技能应用记录。</p>
          )}
        </aside>
      </div>
      <Dialog
        open={!!exporting}
        onOpenChange={(open) => !open && setExporting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>下载 Skill</DialogTitle>
            <DialogDescription>
              {exporting?.name} · 选择文件格式后下载
            </DialogDescription>
          </DialogHeader>
          <label className="biz-field">
            下载格式
            <select
              aria-label="Skill 下载格式"
              value={exportFormat}
              onChange={(event) =>
                setExportFormat(event.target.value as SkillFileFormat)
              }
            >
              <option value="json">JSON</option>
              <option value="txt">TXT</option>
              <option value="md">Markdown（MD）</option>
              <option value="zip">ZIP 技能包</option>
            </select>
          </label>
          <Button
            onClick={() => {
              if (!exporting) return;
              const file = exportSkillFile(exporting, exportFormat);
              download(file.name, file.data, file.type);
              setExporting(null);
            }}
          >
            <Download />
            下载
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent className="biz-dialog">
          <DialogHeader>
            <DialogTitle>
              {report ? '导入质检 · 审阅 Skill' : '编辑 Skill'}
            </DialogTitle>
            <DialogDescription>
              保存到当前项目；内置技能会复制为自定义技能。
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="biz-form">
              {report && (
                <div className="skill-quality-report">
                  <strong>
                    {report.adapted
                      ? 'AI 已完成适配 · 等待审阅'
                      : '格式兼容 · 未调用 AI'}
                  </strong>
                  <p>{report.note}</p>
                  {!!report.issues.length && (
                    <details open>
                      <summary>发现的问题（{report.issues.length}）</summary>
                      <ul>
                        {report.issues.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {!!report.changes.length && (
                    <details open>
                      <summary>AI 修改说明与能力限制</summary>
                      <ul>
                        {report.changes.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {importFile && (
                    <details>
                      <summary>查看原文件：{importFile.filename}</summary>
                      <pre>{importFile.source}</pre>
                    </details>
                  )}
                </div>
              )}
              <label>
                名称
                <input
                  maxLength={150}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <div className="biz-form-pair">
                <label htmlFor="skill-stage">
                  适用阶段
                  <BusinessSelect
                    id="skill-stage"
                    value={draft.stage}
                    options={scopes.map((s) => ({ value: s, label: s }))}
                    onChange={(stage) => setDraft({ ...draft, stage })}
                    label="适用阶段"
                  />
                </label>
                <label>
                  版本
                  <input
                    maxLength={50}
                    value={draft.version}
                    onChange={(e) =>
                      setDraft({ ...draft, version: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                技能指令
                <textarea
                  rows={10}
                  maxLength={20000}
                  value={draft.content}
                  onChange={(e) =>
                    setDraft({ ...draft, content: e.target.value })
                  }
                  placeholder="描述角色、目标、约束和输出要求…"
                />
              </label>
              {error && (
                <p role="alert" className="biz-error">
                  {error}
                </p>
              )}
              <div className="actions">
                <Button disabled={disabled} onClick={save}>
                  保存技能
                </Button>
                <Button variant="outline" onClick={() => setDraft(null)}>
                  取消
                </Button>
              </div>
              {(project.skills || []).some((s) => s.id === draft.id) && (
                <details>
                  <summary>删除技能</summary>
                  <p>仅从当前项目移除，历史修改记录会保留技能快照。</p>
                  <Button
                    variant="destructive"
                    disabled={disabled}
                    onClick={() => {
                      onChange({
                        ...project,
                        skills: (project.skills || []).filter(
                          (s) => s.id !== draft.id,
                        ),
                      });
                      setDraft(null);
                      setNotice('技能已移除，请保存项目。');
                    }}
                  >
                    确认删除
                  </Button>
                </details>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
