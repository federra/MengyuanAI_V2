'use client';
import { useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Search,
  Plus,
  LayoutGrid,
  List,
  Users,
  MapPin,
  Package,
  Shirt,
  Layers,
  Clock,
  Star,
  Sparkles,
  Bot,
  Music,
  ImageIcon,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type Project, type Asset, id } from '@/lib/studio';
import {
  sharedLibraryEntries,
  libraryKinds,
  kindLabels,
  duplicateGroups,
  copyToProject,
  applyLibraryAsset,
  type LibraryEntry,
} from '@/lib/asset-library';
import { matchShotAssets } from '@/lib/assets';
import { modelApi } from './model-settings';
import type { GenerationTarget } from './generation-tools';
const label = (k: string) => kindLabels[k] || k;
const date = (s?: string) =>
  s ? new Date(s).toLocaleDateString('zh-CN') : '未记录';
const state = (a: Asset) =>
  a.status ||
  (a.suggestedDescription
    ? '待复核'
    : a.description && (a.image || a.audio || a.kind === '风格')
      ? '已完成'
      : '待完善');
const fields: Record<string, string[]> = {
  人物: ['物种', '性别', '年龄', '身份', '性格'],
  场景: ['场景类型', '时间', '地点'],
  道具: ['道具类型', '功能'],
  服饰: ['服饰分类', '所属角色'],
  站位图: ['对应场次', '机位说明'],
  风格: ['风格类型', '适用场景'],
  声音: ['声音类型', '音色风格', '所属角色'],
};
function Choice({
  name,
  value,
  items,
  onChange,
}: {
  name: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label={name}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((x) => (
          <SelectItem key={x.value} value={x.value}>
            {x.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function AssetCenter({
  project,
  projects,
  disabled,
  onChange,
  onUpload,
  onGenerate,
  onExport,
  initialKind = '全部',
  onBack,
}: {
  initialKind?: string;
  onBack?: () => void;
  project: Project;
  projects: Project[];
  disabled: boolean;
  onChange: (patch: Partial<Project>) => void;
  onUpload: (kind: 'asset' | 'assetAudio' | 'assetVideo', id: string) => void;
  onGenerate: (target: GenerationTarget) => void;
  onExport: () => void;
}) {
  const allProjects = useMemo(
    () => [project, ...projects.filter((p) => p.id !== project.id)],
    [project, projects],
  );
  const entries = useMemo(
    () => sharedLibraryEntries(allProjects),
    [allProjects],
  );
  const [kind, setKind] = useState(initialKind);
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState(onBack ? project.id : '全部');
  const [tag, setTag] = useState('全部');
  const [status, setStatus] = useState('全部');
  const [view, setView] = useState('grid');
  const [favorites, setFavorites] = useState(false);
  const [special, setSpecial] = useState('');
  const [activeEntry, setActiveEntry] = useState<LibraryEntry | null>(null);
  const [now] = useState(() => Date.now());
  const [detail, setDetail] = useState<LibraryEntry | null>(null);
  const [draft, setDraft] = useState<Asset | null>(null);
  const [useEntry, setUseEntry] = useState<LibraryEntry | null>(null);
  const [destination, setDestination] = useState('当前项目');
  const [shotId, setShotId] = useState(project.shots[0]?.id || '');
  const [message, setMessage] = useState('');
  const [instruction, setInstruction] = useState('');
  const [aiKind, setAiKind] = useState(
    initialKind === '全部' ? '人物' : initialKind,
  );
  const [aiBusy, setAiBusy] = useState(false);
  const [skill, setSkill] = useState('设定补齐');
  const contextEntry = detail || activeEntry;
  const selected = contextEntry
    ? entries.find(
        (e) =>
          e.projectId === contextEntry.projectId &&
          e.asset.id === contextEntry.asset.id,
      ) || contextEntry
    : null;
  const grouped = duplicateGroups(entries);
  const duplicateKeys = new Set(
    grouped.flat().map((e) => e.projectId + e.asset.id),
  );
  const recommended = new Set(
    project.shots.flatMap(
      (s) =>
        matchShotAssets({ ...s, references: [] }, project.assets).references,
    ),
  );
  const scoped = entries.filter(
    (e) => owner === '全部' || e.projectId === owner,
  );
  const tags = [...new Set(scoped.flatMap((e) => e.asset.tags || []))];
  const shown = scoped.filter(
    (e) =>
      (kind === '全部' || e.asset.kind === kind) &&
      (tag === '全部' || e.asset.tags?.includes(tag)) &&
      (status === '全部' || state(e.asset) === status) &&
      (!favorites || e.asset.favorite) &&
      (!query ||
        [e.asset.name, e.asset.description, ...(e.asset.tags || [])]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (special !== 'duplicates' ||
        duplicateKeys.has(e.projectId + e.asset.id)) &&
      (special !== 'recommended' ||
        (e.projectId === project.id && recommended.has(e.asset.id))),
  );
  function notify(action: () => void) {
    try {
      action();
      setMessage('已更新，请保存项目。');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function local(e: LibraryEntry) {
    const c = copyToProject(project, e);
    if (c.project !== project) onChange({ assets: c.project.assets });
    return c.asset;
  }
  function startEdit(e: LibraryEntry) {
    const a = local(e);
    setDraft(structuredClone(a));
    setDetail(null);
  }
  function saveDraft(generate = false) {
    if (!draft) return;
    notify(() => {
      if (!draft.name.trim()) throw Error('请填写资产名称');
      if (
        !project.assets.some((a) => a.id === draft.id) &&
        project.assets.length >= 200
      )
        throw Error('当前项目资产已达200项');
      const cleaned = {
        ...draft,
        inLibrary: true,
        tags: [
          ...new Set((draft.tags || []).map((t) => t.trim()).filter(Boolean)),
        ],
      };
      onChange({
        assets: project.assets.some((a) => a.id === draft.id)
          ? project.assets.map((a) => (a.id === draft.id ? cleaned : a))
          : [...project.assets, cleaned],
      });
      setDraft(null);
      if (generate)
        onGenerate({
          id: cleaned.id,
          kind: 'asset',
          prompt: `${project.style}。${cleaned.name}：${cleaned.description}`,
        });
    });
  }
  function create(k = kind === '全部' ? '人物' : kind) {
    setDraft({
      id: id(),
      kind: k,
      name: '',
      description: '',
      tags: [],
      status: '待完善',
    });
  }
  function generateImage(extra = '', entry = selected) {
    if (!entry) {
      setMessage('请先点击资产的“查看”，选择要生成的资产。');
      return;
    }
    notify(() => {
      const a = local(entry);
      setDetail(null);
      onGenerate({
        id: a.id,
        kind: 'asset',
        prompt: `${project.style}。${a.name}：${a.description}\n${extra}`,
      });
    });
  }
  async function aiDraft() {
    if (!instruction.trim()) {
      setMessage('请先填写资产需求');
      return;
    }
    setAiBusy(true);
    try {
      const r = await modelApi<{ text: string }>('/api/ai', {
        task: 'assetDesign',
        content: JSON.stringify({
          需求: instruction,
          分类: aiKind,
          技能: skill,
          参考资产: selected
            ? {
                name: selected.asset.name,
                description: selected.asset.description,
              }
            : null,
          视觉风格: project.style,
        }),
      });
      setDraft({
        id: id(),
        kind: aiKind,
        name: selected
          ? selected.asset.name + ' · 变体'
          : '新的' + label(aiKind) + '资产',
        description: r.text,
        tags: [],
        status: '待完善',
      });
      setMessage('AI 设定已生成，请检查名称和内容后保存。');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }
  const today = new Date(now).toLocaleDateString('zh-CN');
  const recent = scoped.filter(
    (e) =>
      e.asset.updatedAt && now - Date.parse(e.asset.updatedAt) < 7 * 86400000,
  ).length;
  const stats = [
    ['人物', Users],
    ['场景', MapPin],
    ['道具', Package],
    ['服饰', Shirt],
    ['站位图', Layers],
    ['最近新增', Clock],
  ] as const;
  return (
    <div className="asset-hub">
      {onBack && (
        <div className="asset-management-return">
          <Button variant="outline" onClick={onBack}>
            ← 返回分镜
          </Button>
          <span>
            编辑资产设定后点击“生成图片”，在生成任务中预览并应用结果。
          </span>
        </div>
      )}
      <header className="asset-hub-heading">
        <div>
          <div className="asset-breadcrumb">
            资产中心 / 统一管理角色、场景、道具与风格
          </div>
          <h1>
            {onBack
              ? `${label(kind === '全部' ? initialKind : kind)}管理`
              : '资产中心'}
          </h1>
          <p>让角色、场景与每一份创作设定，可复用、可检索、可调用。</p>
        </div>
        <Button onClick={() => create()} disabled={disabled}>
          <Plus />
          新建资产
        </Button>
      </header>
      <div className="asset-stats">
        {stats.map(([k, Icon]) => (
          <button
            key={k}
            onClick={() => {
              setKind(k === '最近新增' ? '全部' : k);
              if (k === '最近新增')
                setMessage(
                  '近7天更新数量按已记录的更新时间统计；旧资产无日期时不计入。',
                );
            }}
          >
            <span className={'stat-icon stat-' + k}>
              <Icon size={21} />
            </span>
            <div>
              <span>{k === '最近新增' ? '最近更新' : label(k) + '资产'}</span>
              <strong>
                {k === '最近新增'
                  ? recent
                  : scoped.filter((e) => e.asset.kind === k).length}
              </strong>
              <small>
                {k === '最近新增'
                  ? '近7天更新资产数'
                  : '今日新增 +' +
                    scoped.filter(
                      (e) =>
                        e.asset.kind === k &&
                        e.asset.createdAt &&
                        new Date(e.asset.createdAt).toLocaleDateString(
                          'zh-CN',
                        ) === today,
                    ).length}
              </small>
            </div>
          </button>
        ))}
      </div>
      <div className="asset-hub-layout">
        <section className="asset-library-panel">
          <Tabs value={kind} onValueChange={(v) => setKind(String(v))}>
            <TabsList variant="line" className="asset-tabs">
              {['全部', ...libraryKinds].map((k) => (
                <TabsTrigger key={k} value={k}>
                  {k === '全部' ? '全部资产' : label(k)}{' '}
                  <small>
                    {
                      scoped.filter((e) => k === '全部' || e.asset.kind === k)
                        .length
                    }
                  </small>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="asset-tools">
            <label className="asset-search">
              <Search size={17} />
              <input
                aria-label="搜索资产名称、标签或描述"
                placeholder="搜索资产名称、标签或描述"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <Choice
              name="项目归属"
              value={owner}
              onChange={setOwner}
              items={[
                { value: '全部', label: '全部项目' },
                ...allProjects.map((p) => ({ value: p.id, label: p.title })),
              ]}
            />
            <Choice
              name="标签筛选"
              value={tag}
              onChange={setTag}
              items={[
                { value: '全部', label: '全部标签' },
                ...tags.map((t) => ({ value: t, label: t })),
              ]}
            />
            <Choice
              name="状态筛选"
              value={status}
              onChange={setStatus}
              items={['全部', '待完善', '已完成', '待复核'].map((v) => ({
                value: v,
                label: v === '全部' ? '全部状态' : v,
              }))}
            />
            <Button
              variant={favorites ? 'default' : 'outline'}
              onClick={() => setFavorites(!favorites)}
              aria-label="只看常用资产"
            >
              <Star size={16} />
            </Button>
            <Button
              variant="outline"
              onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
              aria-label={view === 'grid' ? '切换列表视图' : '切换卡片视图'}
            >
              {view === 'grid' ? <List /> : <LayoutGrid />}
            </Button>
          </div>
          <div className="asset-result-line">
            <span>
              {shown.length} 项资产{' '}
              {special === 'duplicates'
                ? '· 同项目同分类同名的疑似重复项'
                : special === 'recommended'
                  ? '· 根据当前分镜文字匹配的候选资产'
                  : ''}
            </span>
            {(special || query || favorites) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSpecial('');
                  setQuery('');
                  setFavorites(false);
                }}
              >
                清除快捷筛选
              </Button>
            )}
            <span>当前项目：{project.title}</span>
          </div>
          <output className="asset-feedback" aria-live="polite">
            {message}
          </output>
          {view === 'grid' ? (
            <div className="asset-card-grid">
              {shown.map((e) => (
                <article
                  key={e.projectId + e.asset.id}
                  className="library-card"
                >
                  <button
                    className="library-cover"
                    onClick={() => {
                      setActiveEntry(e);
                      setDetail(e);
                    }}
                    aria-label={'查看' + e.asset.name}
                  >
                    {e.asset.image ? (
                      <Image
                        unoptimized
                        src={e.asset.image.url}
                        width={480}
                        height={300}
                        alt={e.asset.name}
                      />
                    ) : (
                      <div className="library-cover-empty">
                        {e.asset.kind === '声音' ? <Music /> : <ImageIcon />}
                        <span>
                          {e.asset.kind === '声音' ? '声音资产' : '待添加预览'}
                        </span>
                      </div>
                    )}
                    <span className="library-kind">{label(e.asset.kind)}</span>
                    {e.asset.favorite && (
                      <Star className="library-star" size={17} />
                    )}
                  </button>
                  <div className="library-card-body">
                    <div className="library-card-title">
                      <h3>{e.asset.name}</h3>
                      <span className={'asset-state state-' + state(e.asset)}>
                        {state(e.asset)}
                      </span>
                    </div>
                    <div className="library-tags">
                      {(e.asset.tags || []).slice(0, 3).map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                    <p className="library-description">
                      {e.asset.description ||
                        '暂无描述，补充设定便于后续创作。'}
                    </p>
                    <small>{e.projectTitle}</small>
                    <div className="library-meta">
                      <span>{date(e.asset.updatedAt)} 更新</span>
                      <span>
                        {e.references.length} 镜头 ·{' '}
                        {e.asset.usageCount ?? e.asset.usage?.length ?? 0}{' '}
                        次调用
                      </span>
                    </div>
                    <div className="library-card-actions">
                      {e.asset.kind !== '声音' && (
                        <Button
                          disabled={disabled}
                          onClick={() => generateImage('', e)}
                        >
                          <Sparkles size={14} />
                          生成图片
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setActiveEntry(e);
                          setDetail(e);
                        }}
                      >
                        查看
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => startEdit(e)}
                      >
                        {e.projectId !== project.id ? '复制编辑' : '编辑'}
                      </Button>
                      <Button variant="outline" onClick={() => setUseEntry(e)}>
                        调用
                        <ArrowUpRight size={14} />
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    '资产名称',
                    '分类',
                    '所属项目',
                    '状态',
                    '更新时间',
                    '镜头引用',
                    '操作',
                  ].map((v) => (
                    <TableHead key={v}>{v}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((e) => (
                  <TableRow key={e.projectId + e.asset.id}>
                    <TableCell>{e.asset.name}</TableCell>
                    <TableCell>{label(e.asset.kind)}</TableCell>
                    <TableCell>{e.projectTitle}</TableCell>
                    <TableCell>{state(e.asset)}</TableCell>
                    <TableCell>{date(e.asset.updatedAt)}</TableCell>
                    <TableCell>{e.references.length}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setActiveEntry(e);
                          setDetail(e);
                        }}
                      >
                        查看
                      </Button>
                      <Button variant="ghost" onClick={() => setUseEntry(e)}>
                        调用
                      </Button>
                      {e.asset.kind !== '声音' && (
                        <Button
                          disabled={disabled}
                          onClick={() => generateImage('', e)}
                        >
                          生成图片
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!shown.length && (
            <div className="asset-empty">
              <Layers />
              <h3>这里还没有匹配的资产</h3>
              <p>调整筛选，或创建一份新资产开始积累。</p>
              <Button variant="outline" onClick={() => create()}>
                新建资产
              </Button>
            </div>
          )}
        </section>
        <aside className="asset-ai-panel">
          <div className="asset-ai-title">
            <Bot />
            <div>
              <h2>AI 资产助手</h2>
              <small>从创作设定到可用素材</small>
            </div>
          </div>
          <p>选择资产查看详情，或描述新资产需求。AI 结果会先交给你确认。</p>
          <div className="asset-ai-shortcuts">
            <Button
              variant="outline"
              onClick={() => {
                setAiKind('人物');
                setInstruction(
                  '设计一个符合当前项目风格的角色，写清外观、身份和性格，保持设定可复用。',
                );
              }}
            >
              智能生成角色资产
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setAiKind('场景');
                setInstruction(
                  '在所选场景基础上设计一个新变体，保留空间结构，调整时间、天气或灯光。',
                );
              }}
            >
              扩展场景变体
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                generateImage(
                  '生成道具细节图，清晰展示材质、结构、功能与比例。',
                )
              }
            >
              生成道具细节图
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                generateImage(
                  '生成同一角色正面、侧面、背面三视图，统一比例、服饰和光照。',
                )
              }
            >
              补齐角色三视图
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSpecial('recommended');
                setKind('全部');
                setOwner(project.id);
              }}
            >
              根据分镜推荐资产
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSpecial('duplicates');
                setKind('全部');
                setMessage(
                  '按同项目、同分类、同名称查找疑似重复。请查看内容后决定是否删除，已引用资产不会被自动清理。',
                );
              }}
            >
              检查重复资产（{grouped.length}组）
            </Button>
          </div>
          <div className="field">
            <span>资产优化 Skill</span>
            <Choice
              name="资产优化技能"
              value={skill}
              onChange={setSkill}
              items={['设定补齐', '连续性优化', '视觉提示词优化'].map((v) => ({
                value: v,
                label: v,
              }))}
            />
          </div>
          <div className="field">
            <span>生成分类</span>
            <Choice
              name="生成资产分类"
              value={aiKind}
              onChange={setAiKind}
              items={libraryKinds.map((v) => ({ value: v, label: label(v) }))}
            />
          </div>
          <label className="field">
            <span>描述你的需求</span>
            <textarea
              rows={5}
              maxLength={4000}
              placeholder="例如：帮我设计一个未来感实验室场景资产……"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </label>
          <Button disabled={aiBusy || disabled} onClick={aiDraft}>
            <Sparkles />
            {aiBusy ? '正在生成设定…' : 'AI 生成设定'}
          </Button>
          <small>
            图片生成在资产详情中发起。声音可上传试听，自动语音合成尚未接入。
          </small>
        </aside>
      </div>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="asset-detail-dialog">
          <DialogHeader>
            <DialogTitle>{selected?.asset.name}</DialogTitle>
            <DialogDescription>
              {selected?.projectTitle} /{' '}
              {selected && label(selected.asset.kind)}
              {selected?.shotId ? ' · 来自分镜站位图，编辑将先独立入库' : ''}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <div className="asset-detail-preview">
                {selected.asset.image && (
                  <Image
                    unoptimized
                    src={selected.asset.image.url}
                    width={900}
                    height={600}
                    alt={selected.asset.name}
                  />
                )}{' '}
                {selected.asset.video && (
                  <video
                    controls
                    src={selected.asset.video.url}
                    style={{ width: '100%' }}
                  >
                    <track
                      kind="captions"
                      label="资产视频"
                      src="data:text/vtt,WEBVTT"
                    />
                  </video>
                )}
                {selected.asset.audio && (
                  <audio controls src={selected.asset.audio.url}>
                    <track
                      kind="captions"
                      label="资产试听"
                      src="data:text/vtt,WEBVTT"
                    />
                  </audio>
                )}
              </div>
              <p style={{ whiteSpace: 'pre-wrap' }}>
                {selected.asset.description || '暂无描述'}
              </p>
              <div className="library-tags">
                {selected.asset.tags?.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              {Object.entries(selected.asset.attributes || {}).map(([k, v]) => (
                <p key={k}>
                  <b>{k}：</b>
                  {v}
                </p>
              ))}
              {selected.asset.evidence && (
                <details>
                  <summary>剧本依据</summary>
                  {selected.asset.evidence}
                </details>
              )}
              {selected.asset.suggestedDescription && (
                <div className="info-box">
                  <p>
                    剧本新设定（待复核）：{selected.asset.suggestedDescription}
                  </p>
                  <Button
                    onClick={() => {
                      const a = local(selected);
                      setDraft({
                        ...a,
                        description: a.suggestedDescription!,
                        suggestedDescription: undefined,
                      });
                      setDetail(null);
                    }}
                  >
                    审阅并采用
                  </Button>
                </div>
              )}
              <div className="actions">
                <Button onClick={() => startEdit(selected)}>编辑资产</Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setUseEntry(selected);
                    setDetail(null);
                  }}
                >
                  调用资产
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    notify(() => {
                      const a = local(selected);
                      onUpload(
                        a.kind === '声音' ? 'assetAudio' : 'asset',
                        a.id,
                      );
                    })
                  }
                >
                  {selected.asset.kind === '声音'
                    ? '上传音频'
                    : '上传 / 替换图片'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    notify(() => {
                      const a = local(selected);
                      onUpload('assetVideo', a.id);
                    })
                  }
                >
                  上传 / 替换视频
                </Button>
                {selected.asset.kind !== '声音' && (
                  <Button variant="outline" onClick={() => generateImage()}>
                    AI 生成图片
                  </Button>
                )}
              </div>
              <details>
                <summary>使用记录 · {selected.references.length}个镜头</summary>
                {selected.references.map((t, i) => (
                  <p key={i}>{t}</p>
                ))}
                {selected.asset.usage?.map((u, i) => (
                  <p key={i}>
                    {date(u.at)} · {u.target} · {u.detail}
                  </p>
                ))}
                {!selected.references.length &&
                  !selected.asset.usage?.length && <p>暂无使用记录</p>}
              </details>
              <details>
                <summary>
                  版本记录 · {selected.asset.versions?.length || 0}
                </summary>
                {selected.asset.versions?.map((v, i) => (
                  <div className="asset-version" key={i}>
                    <b>
                      {date(v.at)} · {v.name}
                    </b>
                    <p>{v.description}</p>
                    {v.image && (
                      <a href={v.image.url} target="_blank" rel="noreferrer">
                        查看历史图片
                      </a>
                    )}
                  </div>
                ))}
                {!selected.asset.versions?.length && (
                  <p>开始编辑后记录版本；旧版本无法追溯。</p>
                )}
              </details>
              {selected.projectId === project.id && !selected.shotId && (
                <Button
                  variant="outline"
                  disabled={disabled || selected.references.length > 0}
                  onClick={() => {
                    setMessage('删除操作请在编辑面板确认。');
                    startEdit(selected);
                  }}
                >
                  管理 / 删除资产
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="asset-detail-dialog">
          <DialogHeader>
            <DialogTitle>
              {draft && project.assets.some((a) => a.id === draft.id)
                ? '编辑资产'
                : '新建资产'}
            </DialogTitle>
            <DialogDescription>
              保存在当前项目“{project.title}”；其他项目资产通过复制复用。
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <>
              <label className="field">
                <span>名称</span>
                <input
                  maxLength={150}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <Choice
                name="资产分类"
                value={draft.kind}
                onChange={(v) =>
                  setDraft({ ...draft, kind: v, attributes: {} })
                }
                items={libraryKinds.map((v) => ({ value: v, label: label(v) }))}
              />
              <label className="field">
                <span>标签（用逗号分隔）</span>
                <input
                  value={(draft.tags || []).join('，')}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      tags: e.target.value.split(/[,，]/).slice(0, 20),
                    })
                  }
                />
              </label>
              <label className="field">
                <span>描述 / 固定设定</span>
                <textarea
                  rows={6}
                  maxLength={10000}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </label>
              {(fields[draft.kind] || []).map((k) => (
                <label className="field" key={k}>
                  <span>{k}</span>
                  <input
                    maxLength={500}
                    value={draft.attributes?.[k] || ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        attributes: {
                          ...draft.attributes,
                          [k]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
              <Choice
                name="资产状态"
                value={draft.status || '待完善'}
                onChange={(v) =>
                  setDraft({ ...draft, status: v as Asset['status'] })
                }
                items={['待完善', '已完成', '待复核'].map((v) => ({
                  value: v,
                  label: v,
                }))}
              />
              <Button disabled={disabled} onClick={() => saveDraft()}>
                保存资产修改
              </Button>
              {draft.kind !== '声音' && (
                <Button disabled={disabled} onClick={() => saveDraft(true)}>
                  <Sparkles />
                  保存并生成图片
                </Button>
              )}
              {project.assets.some((a) => a.id === draft.id) && (
                <details>
                  <summary>删除资产</summary>
                  <p>
                    只移除当前项目的资产条目；已被镜头引用的资产需先解除引用。素材文件保留。
                  </p>
                  <Button
                    variant="outline"
                    disabled={
                      disabled ||
                      project.shots.some(
                        (s) =>
                          s.references.includes(draft.id) ||
                          (draft.kind === '站位图' &&
                            !!draft.image &&
                            s.blockingImage?.id === draft.image.id),
                      )
                    }
                    onClick={() => {
                      onChange({
                        assets: project.assets.filter((a) => a.id !== draft.id),
                      });
                      setDraft(null);
                      setMessage('资产条目已删除，请保存项目。');
                    }}
                  >
                    确认删除此资产
                  </Button>
                </details>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!useEntry} onOpenChange={(o) => !o && setUseEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>调用：{useEntry?.asset.name}</DialogTitle>
            <DialogDescription>
              其他项目的资产会先复制到当前项目；不会修改来源项目。
            </DialogDescription>
          </DialogHeader>
          <Choice
            name="调用位置"
            value={destination}
            onChange={setDestination}
            items={[
              '当前项目',
              '故事',
              '剧本',
              '分镜',
              '导出素材',
              '常用',
              ...(useEntry?.asset.kind === '声音' ? ['背景音乐'] : []),
              ...(useEntry?.asset.kind === '风格' ? ['设为项目风格'] : []),
            ].map((v) => ({ value: v, label: v }))}
          />
          {destination === '分镜' && (
            <Choice
              name="目标镜头"
              value={shotId}
              onChange={setShotId}
              items={project.shots.map((s, i) => ({
                value: s.id,
                label: `${i + 1}. ${s.title}`,
              }))}
            />
          )}
          <p className="helper">
            调用到故事或剧本会追加资产设定；调用站位图到分镜会替换该镜头的站位参考。
          </p>
          <Button
            disabled={disabled}
            onClick={() =>
              notify(() => {
                if (useEntry) {
                  const next = applyLibraryAsset(
                    project,
                    useEntry,
                    destination,
                    shotId,
                  );
                  onChange(next);
                  setUseEntry(null);
                  if (destination === '导出素材') onExport();
                }
              })
            }
          >
            确认调用
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
