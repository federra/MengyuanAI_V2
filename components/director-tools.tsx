'use client';
import { readApiResponse, progressType } from '@/lib/api-response';
import { useEffect, useRef, useState } from 'react';
import { Sparkles, Upload, BookOpen, Download, RotateCcw } from 'lucide-react';
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
import { type Project, type Stage, validateProject, id } from '@/lib/studio';
import {
  builtinSkills,
  type Skill,
  parseStoryboardImport,
  applyStoryboardImport,
  shotTemplate,
  applyChanges,
  undoLast,
} from '@/lib/director';
import { download } from '@/lib/export';
import { storyboardRules } from '@/lib/storyboard-contract';
const textKeys: Record<string, 'brief' | 'story' | 'script' | 'scenes'> = {
  创意: 'brief',
  故事: 'story',
  剧本: 'script',
  分场: 'scenes',
};
const fieldNames: Record<string, string> = {
  brief: '创意',
  story: '故事',
  script: '剧本',
  scenes: '分场',
  title: '标题',
  style: '风格',
  description: '画面 / 设定',
  scene: '场景',
  character: '人物',
  dialogue: '对白',
  duration: '时长',
  size: '景别',
  camera: '机位',
  prompt: '提示词',
  name: '名称',
};
function Choice({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (s: string) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="picker" aria-label={label}>
        <SelectValue>
          {options.find((o) => o.value === value)?.label || value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function DirectorTools({
  project,
  stage,
  disabled,
  onApply,
  launch,
  hideToolbar = false,
  onCloseLaunch,
  onAssistant,
}: {
  project: Project;
  stage: Stage;
  shotId?: string;
  disabled: boolean;
  onApply: (p: Project, message: string, importedStage?: Stage) => void;
  hideToolbar?: boolean;
  onCloseLaunch?: () => void;
  onAssistant?: () => void;
  launch?: {
    panel?: string;
    nonce: number;
    skillId: string;
    importKind?: 'story' | 'script' | 'shots';
    importMode?: 'append' | 'replace';
    instruction?: string;
    scope?: string;
  };
}) {
  const [dialog, setDialog] = useState(
    launch?.panel || '',
  );
  useEffect(() => {
    if (!dialog && launch?.panel) onCloseLaunch?.();
  }, [dialog, launch, onCloseLaunch]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [skillId, setSkillId] = useState(launch?.skillId || '');
  const [draft, setDraft] = useState<Skill>({ ...builtinSkills[0] });
  const [source, setSource] = useState('');
  const [importChecking, setImportChecking] = useState(false);
  const [converting, setConverting] = useState(false);
  const importLock = useRef(false);
  const importProject = useRef(project.id);
  useEffect(() => { importProject.current = project.id; }, [project.id]);
  const [importMode, setImportMode] = useState<string>(launch?.importMode || 'append');
  const [importKind, setImportKind] = useState<string>(
    launch?.panel === 'import' ? launch.importKind || textKeys[stage] || 'shots' : 'shots',
  );
  const [importReady, setImportReady] = useState(false);
  const [storyboardPreview, setStoryboardPreview] = useState<ReturnType<
    typeof parseStoryboardImport
  > | null>(null);
  const importFile = useRef<HTMLInputElement>(null);
  const skillFile = useRef<HTMLInputElement>(null);
  const skills = [...builtinSkills, ...(project.skills || [])];
  const chosen =
    skills.find((s) => s.id === skillId) ||
    builtinSkills.find((s) => s.stage === stage) ||
    builtinSkills[4];
  function open(kind: string) {
    setDialog(kind);
    setError('');
    if (kind === 'import') {
      setImportKind(textKeys[stage] || 'shots');
      setSource('');
      setImportReady(false);
      setImportMode('append');
    }
    if (kind === 'skills') setDraft({ ...chosen });
  }
  async function previewImport() {
    if (importLock.current) return;
    importLock.current = true;
    const projectId = project.id;
    setImportChecking(true); setBusy(true); setImportReady(false); setError('');
    try {
      if (!source.trim()) throw Error('请先粘贴或选择文件');
      if (importKind === 'shots') {
        const response = await fetch('/api/storyboards/normalize', {
          method: 'POST', headers: {'Content-Type': 'application/json', Accept: progressType},
          body: JSON.stringify({source}),
        });
        const result = await readApiResponse<{text: string; phase?: string}>(response, undefined,
          progress => { if (progress.phase === 'storyboard-converting') setConverting(true); });
        if (importProject.current !== projectId) throw Error('项目已切换，请在目标项目重新检查导入。');
        const parsed = parseStoryboardImport(result.text);
        if (importMode === 'append' && project.shots.length + parsed.shots.length > 200)
          throw Error('追加后超过200镜，请分项目导入');
        applyStoryboardImport(project, result.text, importMode === 'append' ? 'append' : 'replace');
        setSource(result.text);
        setStoryboardPreview(parsed);
      } else if (source.length > 100000) throw Error('文本最多100000字');
      setImportReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入格式不正确');
    } finally {
      importLock.current = false;
      setImportChecking(false); setConverting(false); setBusy(false);
    }
  }
  function applyImport() {
    try {
      let next: Project;
      if (importKind === 'shots') {
        next = applyStoryboardImport(
          project,
          source,
          importMode === 'append' ? 'append' : 'replace',
        );
      } else {
        const key = importKind as 'brief' | 'story' | 'script' | 'scenes';
        const before = project[key];
        const after =
          importMode === 'append' && before ? before + '\n\n' + source : source;
        next = applyChanges(
          project,
          [
            {
              target: 'project',
              id: project.id,
              field: key,
              before,
              after,
              reason: '用户导入文本',
            },
          ],
          `导入${fieldNames[key]}`,
        );
      }
      const importedStage: Record<string, Stage> = {
        brief: '创意', story: '故事', script: '剧本', scenes: '分场', shots: '分镜',
      };
      onApply(next, '导入已应用，可撤销；请保存项目', importedStage[importKind]);
      setDialog('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败');
    }
  }
  async function readFile(file: File | undefined, skill = false) {
    if (!file) return;
    try {
      if (file.size > 1000000) throw Error('文件不能超过1MB');
      const text = (await file.text()).replace(/^\uFEFF/, '');
      if (skill) {
        if (text.length > 20000) throw Error('技能正文最多20000字');
        setDraft({
          id: id(),
          name: file.name.replace(/\.(md|txt)$/i, ''),
          version: '1.0',
          stage,
          content: text,
        });
        setDialog('skills');
      } else {
        setSource(text);
        setImportReady(false);
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '文件读取失败');
    }
  }
  function saveSkill() {
    try {
      if (!draft.name.trim() || !draft.content.trim())
        throw Error('请填写技能名称与指令');
      const custom = {
        ...draft,
        id: builtinSkills.some((s) => s.id === draft.id) ? id() : draft.id,
      };
      const next = {
        ...project,
        skills: [
          ...(project.skills || []).filter((s) => s.id !== custom.id),
          custom,
        ],
      };
      validateProject(next);
      onApply(next, '技能已加入当前项目，请保存项目');
      setSkillId(custom.id);
      setDialog('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存技能失败');
    }
  }
  const last = project.changeLog?.at(-1);
  return (
    <>
      {!hideToolbar && <div className="director-toolbar">
        <div>
          <span className="tag">{stage}</span>
          <span>自主编辑 · Skill 辅助 · 关联修改</span>
        </div>
        <div className="actions">
          <Button
            disabled={disabled}
            variant="outline"
            onClick={() => open('import')}
          >
            <Upload />
            {textKeys[stage] ? '导入文本' : '导入分镜 JSON'}
          </Button>
          <Button
            disabled={disabled}
            variant="outline"
            onClick={() => open('skills')}
          >
            <BookOpen />
            技能管理
          </Button>
          <Button disabled={disabled} onClick={onAssistant}>
            <Sparkles />
            让导演助手修改
          </Button>
          <Button
            disabled={disabled || !last}
            variant="ghost"
            onClick={() => open('history')}
          >
            修改记录
          </Button>
        </div>
      </div>}
      <Dialog
        open={!!dialog}
        onOpenChange={(v) => {
          if (!v && !busy) setDialog('');
        }}
      >
        <DialogContent className="studio-dialog director-dialog">
          <DialogHeader>
            <DialogTitle>
              {
                {
                  import: '导入创作内容',
                  skills: 'Skill 技能管理',
                  history: '关联修改记录',
                }[dialog]
              }
            </DialogTitle>
            <DialogDescription>
              先审阅再应用，修改进入当前项目；保存后持久保留。
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {dialog === 'import' && (
            <fieldset disabled={importChecking} style={{border:0,padding:0,minWidth:0}}>
              {importChecking && <output>{converting ? '剧本格式转换中' : '正在校验分镜格式…'}</output>}
              <div className="field-grid">
                <Choice
                  label="导入内容类型"
                  value={importKind}
                  options={[
                    { value: 'brief', label: '创意' },
                    { value: 'story', label: '故事' },
                    { value: 'script', label: '剧本' },
                    { value: 'scenes', label: '分场' },
                    { value: 'shots', label: '分镜脚本' },
                  ]}
                  onChange={(v) => {
                    setImportKind(v);
                    setSource('');
                    setImportReady(false);
                  }}
                />
                <Choice
                  label="导入方式"
                  value={importMode}
                  options={[
                    { value: 'append', label: '追加到现有内容' },
                    { value: 'replace', label: '替换当前内容（可撤销）' },
                  ]}
                  onChange={(v) => {
                    setImportMode(v);
                    setImportReady(false);
                  }}
                />
              </div>
              <div className="actions">
                <Button
                  variant="outline"
                  onClick={() => importFile.current?.click()}
                >
                  <Upload />
                  选择 {importKind === 'shots' ? '.txt / .md / .json' : '.txt / .md'} 文件
                </Button>
                {importKind === 'shots' && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      download(
                        'storyboard-template.json',
                        JSON.stringify(shotTemplate, null, 2),
                      )
                    }
                  >
                    <Download />
                    下载 JSON 模板
                  </Button>
                )}
              </div>
              <input
                hidden
                ref={importFile}
                type="file"
                accept={importKind === 'shots' ? '.txt,.md,.json' : '.txt,.md'}
                onChange={(e) => {
                  void readFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <label className="field">
                导入内容
                <textarea
                  rows={12}
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    setImportReady(false);
                  }}
                  placeholder={
                    importKind === 'shots'
                      ? '在这里粘贴分镜脚本或 JSON，或选择本地文件。'
                      : '在这里粘贴文本，或选择本地文件。'
                  }
                />
              </label>
              <p className="helper">
                {importKind === 'shots'
                  ? '支持镜头数组、{"shots":[...]} 和 {"episodes":[...]}。每个视频段对应一个分镜，段内子镜头保留完整时间轴、运镜、画面与声音。'
                  : '支持 UTF-8 文本文件，暂不支持 Word / PDF 自动解析。'}
              </p>
              <Button variant="outline" onClick={previewImport}>
                检查并预览导入
              </Button>
              {importKind === 'shots' && (
                <details className="import-preview">
                  <summary>分镜结构与导入规则</summary>
                  <p>
                    一行分镜 =
                    一个完整视频段。段内子镜头不另计分镜数量，也不重复累计时长。26段×10秒
                    = 26个分镜、4分20秒。
                  </p>
                  <p>
                    每段的子镜头时间从0开始，连续到该段结束。导入前校验时间与内容，导入后先预览再应用。
                  </p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      download(
                        '分镜JSON规则.txt',
                        storyboardRules,
                        'text/plain;charset=utf-8',
                      )
                    }
                  >
                    下载完整规则（可提供给创作Skill）
                  </Button>
                </details>
              )}
              {importReady && (
                <div className="import-preview">
                  <b>
                    {importKind === 'shots'
                      ? `${storyboardPreview?.shots.length} 个分镜通过校验 · 总时长 ${Number(storyboardPreview?.shots.reduce((sum, s) => sum + s.duration, 0).toFixed(3))} 秒`
                      : `${source.length} 字文本`}
                  </b>
                  {importKind === 'shots' && storyboardPreview?.isEpisodes && (
                    <p>
                      已按视频段导入：
                      {storyboardPreview.subshotCount}
                      个内部子镜头保留在各段提示词中，不单独增加分镜。 随附
                      {storyboardPreview.assets.length}
                      项资产仅保存到当前项目，同名资产保留已有素材。
                    </p>
                  )}
                  <p>
                    {importMode === 'replace'
                      ? '应用后将替换当前内容，请先确认；顶部可撤销。'
                      : '将追加到现有内容之后。'}
                  </p>
                  {importKind === 'shots' ? (
                    <ol>
                      {storyboardPreview?.shots.map((s, i) => (
                        <li key={i}>
                          {i + 1}. {s.title} · {s.duration}s · {s.size}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <pre>{source.slice(0, 2000)}</pre>
                  )}
                  <Button onClick={applyImport}>确认应用导入</Button>
                </div>
              )}
            </fieldset>
          )}
          {dialog === 'skills' && (
            <>
              <Choice
                label="查看现有技能"
                value={draft.id}
                options={skills.map((s) => ({
                  value: s.id,
                  label: s.name + ' · ' + s.version,
                }))}
                onChange={(v) =>
                  setDraft({ ...skills.find((s) => s.id === v)! })
                }
              />
              <div className="field-grid">
                <label className="field">
                  技能名称
                  <input
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  版本
                  <input
                    value={draft.version}
                    onChange={(e) =>
                      setDraft({ ...draft, version: e.target.value })
                    }
                  />
                </label>
              </div>
              <Choice
                label="技能适用阶段"
                value={draft.stage}
                options={['创意', '故事', '剧本', '分场', '分镜', '全项目'].map(
                  (s) => ({ value: s, label: s }),
                )}
                onChange={(stage) => setDraft({ ...draft, stage })}
              />
              <label className="field">
                技能指令
                <textarea
                  rows={10}
                  value={draft.content}
                  onChange={(e) =>
                    setDraft({ ...draft, content: e.target.value })
                  }
                />
              </label>
              <div className="actions">
                <Button
                  variant="outline"
                  onClick={() => skillFile.current?.click()}
                >
                  <Upload />
                  导入 SKILL.md
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    download(
                      'SKILL.md',
                      draft.content,
                      'text/markdown;charset=utf-8',
                    )
                  }
                >
                  <Download />
                  导出技能正文
                </Button>
                <Button onClick={saveSkill}>保存为项目技能</Button>
              </div>
              <input
                ref={skillFile}
                hidden
                type="file"
                accept=".md,.txt"
                onChange={(e) => {
                  void readFile(e.target.files?.[0], true);
                  e.target.value = '';
                }}
              />
              <p className="helper">
                修改内置技能会保存为项目副本。技能随项目保存；每次关联修改记录所用技能版本和指令快照。
              </p>
            </>
          )}
          {dialog === 'history' && (
            <>
              <Button
                variant="outline"
                disabled={!last || last.undo}
                onClick={() => {
                  try {
                    onApply(undoLast(project), '已撤销上一次关联修改，请保存');
                    setDialog('');
                  } catch (e) {
                    setError(e instanceof Error ? e.message : '无法撤销');
                  }
                }}
              >
                <RotateCcw />
                撤销最近一次关联修改
              </Button>
              <p className="helper">
                如果相关字段又被手动修改，将拒绝撤销，避免覆盖新内容。保留最近20次关联修改。
              </p>
              {[...(project.changeLog || [])].reverse().map((record) => (
                <article className="change-card" key={record.id}>
                  <h3>{record.name}</h3>
                  <p>
                    {new Date(record.time).toLocaleString('zh-CN')} ·{' '}
                    {record.changes.length} 项
                  </p>
                  {record.skill && (
                    <p>
                      {record.skill.name} v{record.skill.version}
                    </p>
                  )}
                  {record.changes.map((c, i) => (
                    <p key={i}>
                      {fieldNames[c.field]}：{String(c.before).slice(0, 80)} →{' '}
                      {String(c.after).slice(0, 80)}
                    </p>
                  ))}
                </article>
              ))}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
