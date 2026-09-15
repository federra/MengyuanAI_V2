'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  Users,
  History,
  Plus,
  Search,
  X,
  Lightbulb,
  BookOpen,
  FileText,
  Image,
  Video,
  ChevronRight,
} from 'lucide-react';
import '../app/admin.css';

type Member = {
  id: string;
  account: string;
  note: string;
  expires_at: number;
  banned_at: number | null;
  ban_reason: string;
  revision: number;
  last_activity_at?: number | null;
};
type Totals = Record<string, number>;
type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  snapshot?: number;
};
type SyncInfo = {
  last_received_at: number | null;
  anomalous_event_count: number;
};
type Overview = SyncInfo & {
  today: Totals;
  lifetime: Totals;
  members: { total: number; active: number; expired: number; banned: number };
  activeToday: number;
  trend: { date: string; count: number }[];
  server_time: number;
  preview: { user: Member; today: Totals; lifetime: Totals }[];
};
type Usage = Page<{
  event_id: string;
  metric: string;
  video_kind: string;
  quantity: number;
  occurred_at: number;
  source: string;
  clock_status: 'normal' | 'anomalous';
  received_at: number;
}> &
  SyncInfo & { user: Member; today: Totals; totals: Totals };
type Log = {
  id: string;
  request_id: string;
  actor_account: string;
  target_account: string;
  action: string;
  reason: string;
  result: string;
  before_json: string;
  after_json: string;
  created_at: number;
};
const metrics = [
  ['idea', '创意数', Lightbulb, '首次保存的项目创意'],
  ['story', '故事数', BookOpen, '完整故事候选'],
  ['script', '剧本数', FileText, '完整剧本输出'],
  ['asset', '素材数', Image, '入库图片 / 视频 / 音频'],
  ['video_export', '导出视频数', Video, '分镜视频文件；成片另标'],
] as const;
const actions: Record<string, string> = {
  'business.idea.completed': '保存创意',
  'business.story.completed': '生成故事',
  'business.script.completed': '生成剧本',
  'business.asset.completed': '素材入库',
  'business.video_export.completed': '导出视频',
  'user.create': '增加用户',
  'user.expiry': '调整授权',
  'user.ban': '封禁用户',
  'user.restore': '恢复用户',
  'user.authorization': '授权操作',
  'admin.users.list': '查询用户',
  'admin.overview': '查看数据概览',
  'admin.usage.list': '查看使用情况',
  'admin.audit.list': '查询操作日志',
  'auth.login': '登录',
  'auth.logout': '退出登录',
  'admin.bootstrap': '初始化管理员',
};
const sources: Record<string, string> = {
  project: '项目保存',
  ai: '文本生成',
  generation: '图片/视频生成',
  upload: '上传',
  doubao: '豆包回传',
  speech: '配音生成',
  video_export: '视频导出',
};
const errors: Record<string, string> = {
  ACCOUNT_EXISTS: '账号已存在，请更换账号。',
  CONFLICT: '用户权限已被更新，请关闭窗口并刷新后重试。',
  INVALID_INPUT: '请检查账号、密钥、日期和操作原因。',
  FORBIDDEN: '仅超级管理员可以执行此操作。',
  UNAUTHENTICATED: '登录已失效，请重新登录。',
  CONNECTION_FAILED:
    '连接服务器失败。提交操作后请先刷新核对结果，避免重复操作。',
  SERVICE_UNAVAILABLE: '服务暂不可用，请稍后刷新。',
  BUSY: '服务忙，请稍后重试。',
};
async function request<T>(
  action: string,
  input: Record<string, unknown> = {},
): Promise<T> {
  if (!window.directorDesktop?.admin)
    throw Error('请在最新版桌面软件中打开管理员后台。');
  const response = await window.directorDesktop.admin(action, input);
  if (response.error)
    throw Error(errors[response.error] ?? '操作未完成，请刷新后重试。');
  return response.data as T;
}
const fmt = (value: number | null | undefined) =>
  value == null
    ? '—'
    : new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(value);
const dateValue = (value: number) =>
  new Date(value + 8 * 3600000).toISOString().slice(0, 16);
function Status({ user, now }: { user: Member; now: number }) {
  const status =
    user.banned_at !== null
      ? 'banned'
      : user.expires_at <= now
        ? 'expired'
        : 'active';
  return (
    <span className={'badge ' + status}>
      {status === 'banned'
        ? '已封禁'
        : status === 'expired'
          ? '已到期'
          : '授权有效'}
    </span>
  );
}
function Stats({
  values,
  prefix = '当日',
}: {
  values?: Totals;
  prefix?: string;
}) {
  return (
    <div className="stats">
      {metrics.map(([key, label, Icon, foot]) => (
        <div className="stat" key={key}>
          <div>
            {prefix}
            {label}
            <Icon size={16} />
          </div>
          <strong>{values?.[key]?.toLocaleString() ?? '—'}</strong>
          <small>{foot}</small>
        </div>
      ))}
    </div>
  );
}
function Paging({
  data,
  onChange,
}: {
  data: Page<unknown>;
  onChange: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        共 {data.total} 条 · 第 {data.page} /{' '}
        {Math.max(1, Math.ceil(data.total / data.pageSize))} 页
      </span>
      <div>
        <button
          disabled={data.page <= 1}
          onClick={() => onChange(data.page - 1)}
        >
          上一页
        </button>
        <button
          disabled={data.page * data.pageSize >= data.total}
          onClick={() => onChange(data.page + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
function Modal({
  title,
  wide,
  children,
  onClose,
}: {
  title: string;
  wide?: boolean;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={'admin-dialog ' + (wide ? 'wide' : '')}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button aria-label="关闭" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function ChangeForm({
  kind,
  user,
  now,
  onClose,
  onSaved,
}: {
  kind: string;
  user?: Member;
  now: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [account, setAccount] = useState(''),
    [key, setKey] = useState(''),
    [note, setNote] = useState(''),
    [expiry, setExpiry] = useState(
      dateValue(user?.expires_at ?? now + 30 * 86400000),
    ),
    [reason, setReason] = useState(''),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const title =
    kind === 'create'
      ? '增加用户'
      : kind === 'expiry'
        ? '调整授权'
        : kind === 'ban'
          ? '封禁用户'
          : '恢复用户';
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal title={title} onClose={close}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await request(kind, {
              id: user?.id,
              revision: user?.revision,
              account,
              key,
              note,
              expires_at: Date.parse(expiry + ':00+08:00'),
              reason,
            });
            setKey('');
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="dialog-body">
          {kind === 'create' ? (
            <>
              <label>
                用户账号
                <input
                  required
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  pattern="[a-zA-Z0-9._\-]{3,64}"
                  minLength={3}
                  maxLength={64}
                  autoComplete="off"
                  placeholder="3～64 位字母、数字、点、下划线或短横线"
                />
              </label>
              <label>
                备注名
                <input
                  value={note}
                  maxLength={200}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <label>
                登录密钥
                <div className="key-row">
                  <input
                    required
                    type={show ? 'text' : 'password'}
                    value={key}
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    onChange={(e) => setKey(e.target.value)}
                  />
                  <button type="button" onClick={() => setShow(!show)}>
                    {show ? '隐藏' : '显示'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setKey(
                        Array.from(
                          crypto.getRandomValues(new Uint8Array(18)),
                          (n) => n.toString(16).padStart(2, '0'),
                        ).join(''),
                      )
                    }
                  >
                    生成
                  </button>
                </div>
                <small>
                  请在提交前保存密钥并交给会员，创建后无法再次查看。
                </small>
              </label>
            </>
          ) : (
            <div className="notice">
              <strong>{user?.account}</strong> · {user?.note || '无备注'}
              <br />
              当前到期时间：{fmt(user?.expires_at)}（北京时间）
            </div>
          )}
          {(kind === 'create' || kind === 'expiry') && (
            <label>
              授权到期时间（北京时间）
              <input
                required
                type="datetime-local"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
              <div className="shortcuts">
                {[7, 30, 90, 365].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setExpiry(dateValue(now + days * 86400000))}
                  >
                    从今日起 {days} 天
                  </button>
                ))}
              </div>
            </label>
          )}
          {kind === 'ban' && (
            <p className="notice">
              封禁后立即撤销会话，用户无法继续使用。用户记录和使用历史保留。
            </p>
          )}
          {kind === 'restore' && (
            <p className="notice">
              恢复只解除封禁，不延长授权时间。
              {user && user.expires_at <= now
                ? '该用户已到期，还需调整授权后才能使用。'
                : '未到期的用户可以重新登录。'}
            </p>
          )}
          {kind === 'expiry' && user?.banned_at !== null && (
            <p className="notice">调整到期时间不会解除封禁。</p>
          )}
          <label>
            操作原因
            <textarea
              required
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="请填写原因，将记录在操作日志中"
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </fieldset>
        <div className="dialog-footer">
          <button type="button" disabled={busy} onClick={close}>
            取消
          </button>
          <button
            className={kind === 'ban' ? 'danger-primary' : 'primary'}
            disabled={busy || !reason.trim()}
          >
            {busy ? '提交中…' : '确认' + title}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function UsageDetail({ user, onClose }: { user: Member; onClose: () => void }) {
  const [data, setData] = useState<Usage>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [query, setQuery] = useState({ from: '', to: '', page: 1 });
  // Loading state belongs to this external request lifecycle.
  useEffect(() => {
    let live = true;
    // Fetch lifecycle starts when its query changes.
    // oxlint-disable-next-line react/react-compiler
    setBusy(true);
    // oxlint-disable-next-line react/react-compiler
    setError('');
    request<Usage>('usage', { id: user.id, ...query })
      .then((r) => {
        if (live) setData(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [user.id, query]);
  return (
    <Modal title={'使用详情 · ' + user.account} wide onClose={onClose}>
      <div className="dialog-body">
        <p className="subtitle">
          {user.note || '无备注'} · 授权到期：
          {fmt(data?.user.expires_at ?? user.expires_at)} · 北京时间
        </p>
        <div className="notice">
          最近接收：{fmt(data?.last_received_at)}
          。桌面上报可能延迟，断网期间的已完成记录将在重新获授权登录后补传。异常时间记录：
          {data?.anomalous_event_count ?? 0}{' '}
          条，保留明细但不计入汇总；最终成片尚未接入。
        </div>
        <h3>今日使用</h3>
        <Stats values={data?.today} />
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery({ from, to, page: 1 });
          }}
        >
          <label>
            开始日期
            <input
              aria-label="使用开始日期"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            结束日期
            <input
              aria-label="使用结束日期"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button disabled={busy}>查询历史</button>
          <button
            type="button"
            onClick={() => {
              setFrom('');
              setTo('');
              setQuery({ from: '', to: '', page: 1 });
            }}
          >
            历史累计
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {busy ? (
          <output>读取中…</output>
        ) : (
          data && (
            <>
              <Stats values={data.totals} prefix="所选" />
              <p className="subtitle">
                分镜视频：{data.totals.shot} · 最终成片：尚未接入
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>时间（北京时间）</th>
                      <th>类型</th>
                      <th>数量</th>
                      <th>来源</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.event_id}>
                        <td>
                          {fmt(item.occurred_at)}
                          {item.clock_status === 'anomalous' && (
                            <small className="error">
                              设备时间异常 · 未计入汇总
                            </small>
                          )}
                          <small>接收：{fmt(item.received_at)}</small>
                        </td>
                        <td>
                          {metrics.find((m) => m[0] === item.metric)?.[1] ??
                            item.metric}
                          {item.video_kind === 'shot'
                            ? ' · 分镜视频'
                            : item.video_kind === 'final'
                              ? ' · 最终成片'
                              : ''}
                        </td>
                        <td>{item.quantity}</td>
                        <td>{sources[item.source] ?? item.source}</td>
                      </tr>
                    ))}
                    {!data.items.length && (
                      <tr>
                        <td colSpan={4} className="empty">
                          该时段暂无已记录的使用数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Paging
                data={data}
                onChange={(page) => setQuery({ ...query, page })}
              />
            </>
          )
        )}
      </div>
    </Modal>
  );
}
function logReason(raw: string) {
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && 'page' in value)
      return `第 ${value.page} 页，每页 ${value.pageSize} 条；关键词：${value.q || '全部'}；日期：${value.from || '不限'} 至 ${value.to || '不限'}${value.status ? '；状态：' + ({ active: '授权有效', expired: '已到期', banned: '已封禁' } as Record<string, string>)[value.status] : ''}${value.action ? '；操作：' + (actions[value.action] || value.action) : ''}`;
  } catch {
    /* Human-entered reasons are plain text. */
  }
  return raw || '—';
}
function logChange(raw: string) {
  try {
    const v = JSON.parse(raw);
    if (!v) return '—';
    if (typeof v === 'object' && 'metric' in v)
      return `${metrics.find((m) => m[0] === v.metric)?.[1] ?? v.metric}：${v.quantity}；${sources[v.source] ?? v.source}；完成于 ${fmt(v.occurred_at)}${v.video_kind === 'shot' ? '；分镜视频' : v.video_kind === 'final' ? '；最终成片' : ''}${v.clock_status === 'anomalous' ? '；设备时间异常' : ''}`;
    return typeof v === 'object'
      ? ['account', 'expires_at', 'banned_at', 'revision']
          .filter((k) => k in v)
          .map(
            (k) =>
              ({
                account: '账号',
                expires_at: '到期',
                banned_at: '封禁',
                revision: '版本',
              })[k] +
              ': ' +
              (k.endsWith('_at') ? fmt(v[k]) : String(v[k])),
          )
          .join('；')
      : String(v);
  } catch {
    return '—';
  }
}
export function AdminConsole() {
  const [tab, setTab] = useState('overview'),
    [period, setPeriod] = useState('today'),
    [overview, setOverview] = useState<Overview>(),
    [users, setUsers] = useState<Page<Member>>(),
    [logs, setLogs] = useState<Page<Log>>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0),
    [query, setQuery] = useState<Record<string, unknown>>({ page: 1 }),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [action, setAction] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [modal, setModal] = useState<{ kind: string; user?: Member }>();
  const [notice, setNotice] = useState('');
  // Loading state belongs to this external request lifecycle.
  useEffect(() => {
    let live = true;
    // Fetch lifecycle starts when its query changes.
    // oxlint-disable-next-line react/react-compiler
    setBusy(true);
    // oxlint-disable-next-line react/react-compiler
    setError('');
    const run =
      tab === 'overview'
        ? request<Overview>('overview').then((r) => {
            if (live) setOverview(r);
          })
        : tab === 'users'
          ? request<Page<Member>>('users', query).then((r) => {
              if (live) setUsers(r);
            })
          : request<Page<Log>>('logs', query).then((r) => {
              if (live) setLogs(r);
            });
    run
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [tab, query, refresh]);
  const [openedAt] = useState(() => Date.now());
  const now =
    (tab === 'users'
      ? (users as (Page<Member> & { server_time?: number }) | undefined)
          ?.server_time
      : overview?.server_time) ?? openedAt;
  const changeTab = (next: string) => {
    setTab(next);
    setSearch('');
    setStatus('');
    setAction('');
    setFrom('');
    setTo('');
    setQuery({ page: 1 });
    setNotice('');
  };
  return (
    <section className="admin-console">
      <div className="heading">
        <div>
          <div className="eyebrow">ADMINISTRATION</div>
          <h1>管理员后台</h1>
          <p className="subtitle">
            管理用户授权，了解创作使用情况，每次操作都有记录。
          </p>
        </div>
        <button
          className="primary"
          onClick={() => setModal({ kind: 'create' })}
        >
          <Plus size={16} />
          增加用户
        </button>
      </div>
      <div className="tabs" role="tablist" aria-label="后台导航">
        {[
          ['overview', '数据概览', Activity],
          ['users', '用户管理', Users],
          ['logs', '操作日志', History],
        ].map(([id, label, Icon]) => (
          <button
            key={id as string}
            id={'admin-tab-' + id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls="admin-panel"
            tabIndex={tab === id ? 0 : -1}
            className={tab === id ? 'active' : ''}
            onClick={() => changeTab(id as string)}
            onKeyDown={(e) => {
              const tabs = ['overview', 'users', 'logs'];
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? 2
                      : (tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : 2)) %
                        3;
                changeTab(tabs[next]);
                document.getElementById('admin-tab-' + tabs[next])?.focus();
              }
            }}
          >
            <Icon size={16} />
            {label as string}
          </button>
        ))}
      </div>
      {notice && <output className="notice">{notice}</output>}
      {error && (
        <div role="alert" className="error">
          {error}{' '}
          <button onClick={() => setRefresh((n) => n + 1)}>重新加载</button>
        </div>
      )}
      <div
        id="admin-panel"
        role="tabpanel"
        aria-labelledby={'admin-tab-' + tab}
        aria-busy={busy}
      >
        {tab === 'overview' && (
          <>
            <div className="toolbar">
              <h2>
                普通会员创作概览 <span className="badge">不含管理员</span>
              </h2>
              <div className="segmented">
                {[
                  ['today', '今日'],
                  ['lifetime', '历史累计'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={period === key ? 'selected' : ''}
                    onClick={() => setPeriod(key)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  disabled={busy}
                  onClick={() => setRefresh((n) => n + 1)}
                >
                  刷新
                </button>
              </div>
            </div>
            <Stats
              values={overview?.[period as 'today' | 'lifetime']}
              prefix={period === 'today' ? '当日' : '累计'}
            />
            <div className="split">
              <div className="panel">
                <div className="panel-head">
                  <h3>近 7 日创意趋势</h3>
                  <small>北京时间</small>
                </div>
                <div className="chart">
                  {overview?.trend.map((item) => (
                    <div key={item.date}>
                      <span>{item.count}</span>
                      <i
                        style={{
                          height:
                            Math.max(
                              2,
                              (item.count /
                                Math.max(
                                  1,
                                  ...overview.trend.map((t) => t.count),
                                )) *
                                100,
                            ) + 'px',
                        }}
                      />
                      <small>{item.date.slice(5)}</small>
                    </div>
                  ))}
                </div>
              </div>
              <div className="panel">
                <div className="panel-head">
                  <h3>会员授权情况</h3>
                </div>
                <div className="summary">
                  {[
                    ['普通会员记录', overview?.members.total],
                    ['授权有效', overview?.members.active],
                    [
                      '已到期 / 已封禁',
                      overview
                        ? `${overview.members.expired} / ${overview.members.banned}`
                        : '—',
                    ],
                    ['今日活跃会员', overview?.activeToday],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value ?? '—'}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="notice">
              最近接收：{fmt(overview?.last_received_at)}
              。桌面上报可能延迟；异常时间记录{' '}
              {overview?.anomalous_event_count ?? 0} 条不计入汇总。分镜视频：
              {overview?.[period as 'today' | 'lifetime'].shot ?? '—'}
              ；最终成片：尚未接入。仅统计系统成功导出的视频文件，剪映草稿 /
              剪辑包不计入；到期、封禁后历史仍保留。
            </div>
            <div className="panel">
              <div className="panel-head">
                <h3>会员使用明细</h3>
                <button className="link" onClick={() => changeTab('users')}>
                  查看全部用户 <ChevronRight size={15} />
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>用户</th>
                      <th>授权状态</th>
                      {metrics.map(([key, label]) => (
                        <th key={key}>{label}</th>
                      ))}
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview?.preview.map((row) => (
                      <tr key={row.user.id}>
                        <td>
                          <strong>{row.user.account}</strong>
                          <small>{row.user.note || '无备注'}</small>
                        </td>
                        <td>
                          <Status user={row.user} now={now} />
                        </td>
                        {metrics.map(([key]) => (
                          <td key={key}>
                            {row[period as 'today' | 'lifetime'][key]}
                          </td>
                        ))}
                        <td>
                          <button
                            className="link"
                            onClick={() =>
                              setModal({ kind: 'usage', user: row.user })
                            }
                          >
                            使用详情
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!overview?.preview.length && (
                      <tr>
                        <td className="empty" colSpan={8}>
                          暂无会员记录，可通过增加用户开通授权。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        {tab !== 'overview' && (
          <form
            className="toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery({ q: search, status, action, from, to, page: 1 });
            }}
          >
            <div className="filters">
              <label className="search-label">
                <span className="sr-only">
                  {tab === 'users' ? '搜索账号或备注名' : '操作对象或操作者'}
                </span>
                <input
                  placeholder={
                    tab === 'users' ? '搜索账号 / 备注名' : '操作对象 / 操作者'
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  maxLength={200}
                />
              </label>
              {tab === 'users' ? (
                <select
                  aria-label="授权状态"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">全部状态</option>
                  <option value="active">授权有效</option>
                  <option value="expired">已到期</option>
                  <option value="banned">已封禁</option>
                </select>
              ) : (
                <>
                  <select
                    aria-label="操作类型"
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                  >
                    <option value="">全部操作</option>
                    {Object.entries(actions).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="日志开始日期"
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                  <input
                    aria-label="日志结束日期"
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </>
              )}
              <button disabled={busy}>
                <Search size={14} />
                查询
              </button>
            </div>
            <small>
              {tab === 'users' ? '不删除用户记录' : '仅可查看 · 北京时间'}
            </small>
          </form>
        )}
        {busy && <output className="loading">读取中…</output>}
        {tab === 'users' && !busy && !error && users && (
          <div className="panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>用户</th>
                    <th>授权状态</th>
                    <th>授权到期时间</th>
                    <th>最近创作活动</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.items.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.account}</strong>
                        <small>
                          {user.note || '无备注'} · {user.id}
                        </small>
                      </td>
                      <td>
                        <Status user={user} now={now} />
                      </td>
                      <td>
                        {fmt(user.expires_at)}
                        <small>北京时间</small>
                      </td>
                      <td>
                        {fmt(user.last_activity_at)}
                        <small>已接收的创作记录</small>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            onClick={() => setModal({ kind: 'usage', user })}
                          >
                            使用详情
                          </button>
                          <button
                            onClick={() => setModal({ kind: 'expiry', user })}
                          >
                            调整授权
                          </button>
                          <button
                            aria-label={
                              (user.banned_at === null ? '封禁' : '恢复') +
                              user.account
                            }
                            className={user.banned_at === null ? 'danger' : ''}
                            onClick={() =>
                              setModal({
                                kind:
                                  user.banned_at === null ? 'ban' : 'restore',
                                user,
                              })
                            }
                          >
                            {user.banned_at === null ? '封禁' : '恢复'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!users.items.length && (
                    <tr>
                      <td colSpan={5} className="empty">
                        没有匹配的用户，可调整筛选条件或增加用户。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Paging
              data={users}
              onChange={(page) => setQuery({ ...query, page })}
            />
          </div>
        )}
        {tab === 'logs' && (
          <>
            <div className="notice">
              记录操作者、操作对象、变更前后、原因及结果。密钥不入日志；记录不可修改或删除。翻页保持本次查询快照，点击查询可获取最新记录。
            </div>
            {!busy && !error && logs && (
              <div className="panel">
                <div className="panel-head">
                  <h3>管理员操作记录</h3>
                  <span className="badge">仅可查看</span>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>时间 / 记录 ID</th>
                        <th>操作者 / 动作</th>
                        <th>对象</th>
                        <th>内容 / 原因</th>
                        <th>结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.items.map((log) => (
                        <tr key={log.id}>
                          <td>
                            {fmt(log.created_at)}
                            <small>{log.id}</small>
                            <small>请求：{log.request_id}</small>
                          </td>
                          <td>
                            <strong>{log.actor_account || '系统'}</strong>
                            <small>{actions[log.action] ?? log.action}</small>
                          </td>
                          <td>{log.target_account || '—'}</td>
                          <td className="log-content">
                            <div>变更前：{logChange(log.before_json)}</div>
                            <div>变更后：{logChange(log.after_json)}</div>
                            <small>{logReason(log.reason)}</small>
                          </td>
                          <td>
                            <span
                              className={
                                'badge ' +
                                (log.result === 'success' ? 'active' : 'banned')
                              }
                            >
                              {log.result === 'success' ? '成功' : '失败'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {!logs.items.length && (
                        <tr>
                          <td colSpan={5} className="empty">
                            没有匹配的操作记录
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Paging
                  data={logs}
                  onChange={(page) =>
                    setQuery({ ...query, page, snapshot: logs.snapshot })
                  }
                />
              </div>
            )}
          </>
        )}
      </div>
      {modal?.kind === 'usage' && modal.user ? (
        <UsageDetail user={modal.user} onClose={() => setModal(undefined)} />
      ) : (
        modal && (
          <ChangeForm
            kind={modal.kind}
            user={modal.user}
            now={now}
            onClose={() => setModal(undefined)}
            onSaved={() => {
              setModal(undefined);
              setNotice('操作成功，已记录到操作日志。');
              setRefresh((n) => n + 1);
            }}
          />
        )
      )}
    </section>
  );
}
