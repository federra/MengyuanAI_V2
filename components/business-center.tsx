'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Users,
  Wallet,
  Plus,
  Download,
  RefreshCw,
  Search,
  Copy,
  Settings2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
} from 'recharts';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { BusinessSelect } from '@/components/skill-center';
import {
  incomeKinds,
  businessDate,
  money,
  openCommission,
  type Business,
  type Agent,
  type Income,
  type Settlement,
} from '@/lib/business';
import { download } from '@/lib/export';
const colors = ['#2677ff', '#29bdd2', '#9776f5', '#ffae4d'];
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
    new Date(),
  );
const labelDate = (s: string) => new Date(s).toLocaleString('zh-CN');
function csvCell(v: string | number | boolean | null | undefined) {
  const s = String(v ?? '');
  return (
    '"' + (/^[=+\-@\t\r\n]/.test(s) ? "'" : '') + s.replaceAll('"', '""') + '"'
  );
}
function exportCsv(
  name: string,
  rows: (string | number | boolean | null | undefined)[][],
) {
  download(
    name + '.csv',
    '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'),
    'text/csv;charset=utf-8',
  );
}
export function BusinessCenter({
  mode,
  onNavigate,
}: {
  mode: '收益中心' | '渠道代理';
  onNavigate: (name: string) => void;
}) {
  const [state, setState] = useState<Business | null>(null);
  const [busy, setBusy] = useState(true);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('概览');
  const [range, setRange] = useState('30');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState(today());
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('全部类型');
  const [status, setStatus] = useState('全部状态');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<Agent | Income | Settlement | null>(
    null,
  );
  const [enabled, setEnabled] = useState(false);
  async function load() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/business');
      const d = (await r.json()) as Business & { error?: string };
      if (!r.ok) throw Error(d.error || '加载失败');
      setState(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/business');
        const d = (await r.json()) as Business & { error?: string };
        if (!r.ok) throw Error(d.error || '加载失败');
        if (!cancelled) setState(d);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  async function mutate(action: Record<string, unknown>) {
    if (lock.current || !state) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: state.revision, action }),
      });
      const d = (await r.json()) as Business & { error?: string };
      if (!r.ok) throw Error(d.error || '保存失败');
      setState(d);
      setDialog('');
      setNotice('已保存到业务账本。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  function open(type: string, row: Agent | Income | Settlement | null = null) {
    setDialog(type);
    setTarget(row);
    setError('');
    setForm(
      type === 'income'
        ? {
            date: today(),
            kind: incomeKinds[0],
            agentId: 'none',
            amount: '',
            reference: '',
            note: '',
            project: '',
          }
        : type === 'agent'
          ? { name: '', code: '', parentId: 'none', note: '' }
          : type === 'rules'
            ? {
                first: String((state?.rules.first || 0) / 100),
                second: String((state?.rules.second || 0) / 100),
              }
            : { reference: '', reason: '' },
    );
    setEnabled(state?.rules.enabled || false);
  }
  function field(key: string, label: string, type = 'text', required = true) {
    return (
      <label>
        {label}
        <input
          type={type}
          required={required}
          maxLength={key === 'note' ? 500 : 150}
          value={form[key] || ''}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          step={type === 'number' ? '0.01' : undefined}
          min={type === 'number' ? '0' : undefined}
        />
      </label>
    );
  }
  if (!state)
    return (
      <section className="business-hub">
        <h1>{mode}</h1>
        <p>{busy ? '正在读取业务账本…' : '账本尚未加载。'}</p>
        {error && (
          <p role="alert" className="biz-error">
            {error}
          </p>
        )}
        <Button variant="outline" disabled={busy} onClick={load}>
          重新加载
        </Button>
      </section>
    );
  const isChannel = mode === '渠道代理';
  const agentName = (id: string) =>
    state.agents.find((a) => a.id === id)?.name || '—';
  let from = start;
  if (range !== 'custom' && range !== 'all') {
    const day = new Date(today() + 'T00:00:00Z');
    day.setUTCDate(day.getUTCDate() - Number(range) + 1);
    from = day.toISOString().slice(0, 10);
  }
  const to = range === 'custom' ? end : today();
  const dateError = range === 'custom' && (!from || !to || from > to);
  const inPeriod = (date: string) =>
    !dateError &&
    (range === 'all' ||
      ((!from || date.slice(0, 10) >= from) &&
        (!to || date.slice(0, 10) <= to)));
  const incomes = state.income.filter((i) => inPeriod(i.date));
  const valid = incomes.filter((i) => !i.voided);
  const total = valid.reduce((n, i) => n + i.cents, 0);
  const commission = state.income
    .filter((i) => !i.voided)
    .flatMap((i) => i.commissions)
    .reduce((n, c) => n + c.cents, 0);
  const paid = state.settlements
    .filter((s) => s.status === '已登记付款')
    .reduce((n, s) => n + s.cents, 0);
  const reserved = state.settlements
    .filter((s) => s.status === '待付款')
    .reduce((n, s) => n + s.cents, 0);
  const typeData = incomeKinds
    .map((name, index) => ({
      name,
      value:
        valid.filter((i) => i.kind === name).reduce((n, i) => n + i.cents, 0) /
        100,
      color: colors[index],
    }))
    .filter((d) => d.value > 0);
  const trend = new Map<string, number>();
  for (const i of valid)
    trend.set(i.date, (trend.get(i.date) || 0) + i.cents / 100);
  const chartData = [...trend]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, income]) => ({ date, income }));
  const matchedIncome = incomes
    .filter(
      (i) =>
        (kind === '全部类型' || i.kind === kind) &&
        (status === '全部状态' ||
          (i.voided ? '已作废' : '已登记') === status) &&
        `${i.reference} ${i.project} ${i.note} ${agentName(i.agentId)}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .slice()
    .reverse();
  const matchedAgents = state.agents.filter(
    (a) =>
      `${a.name} ${a.code} ${a.note} ${agentName(a.parentId)}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === '全部状态' || (a.active ? '已启用' : '已停用') === status),
  );
  const matchedSettlements = state.settlements
    .filter(
      (s) =>
        inPeriod(businessDate(s.createdAt)) &&
        (status === '全部状态' || status === s.status) &&
        `${agentName(s.agentId)} ${s.reference}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .slice()
    .reverse();
  const currentRows =
    tab === '团队'
      ? matchedAgents
      : tab === '结算记录'
        ? matchedSettlements
        : matchedIncome;
  const pageCount = Math.max(1, Math.ceil(currentRows.length / 10));
  const currentPage = Math.min(page, pageCount);
  const slice = <T,>(rows: T[]) =>
    rows.slice((currentPage - 1) * 10, currentPage * 10);
  function filtersReset(nextTab: string) {
    setTab(nextTab);
    setQuery('');
    setKind('全部类型');
    setStatus('全部状态');
    setPage(1);
  }
  const tabs = isChannel
    ? [
        { value: '概览', label: '代理概览' },
        { value: '团队', label: '代理团队' },
        { value: '规则', label: '佣金规则' },
        { value: '结算记录', label: '结算记录' },
        { value: '日志', label: '操作记录' },
      ]
    : [
        { value: '概览', label: '收益总览' },
        { value: '明细', label: '收益明细' },
        { value: '结算记录', label: '渠道结算' },
        { value: '日志', label: '操作记录' },
      ];
  const exportIncome = () =>
    exportCsv('收益明细', [
      [
        '日期',
        '分类',
        '金额（元）',
        '凭证编号',
        '作品',
        '关联代理',
        '佣金（元）',
        '状态',
        '来源说明',
      ],
      ...matchedIncome.map((i) => [
        i.date,
        i.kind,
        (i.cents / 100).toFixed(2),
        i.reference,
        i.project,
        agentName(i.agentId),
        (i.commissions.reduce((n, c) => n + c.cents, 0) / 100).toFixed(2),
        i.voided ? '已作废' : '已登记',
        i.note,
      ]),
    ]);
  const incomeTable = (rows: Income[]) => (
    <div className="biz-table">
      <Table>
        <TableHeader>
          <TableRow>
            {[
              '日期 / 凭证',
              '类型 / 作品',
              '收入金额',
              '关联代理',
              '分配佣金',
              '状态',
              '操作',
            ].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((i) => (
            <TableRow key={i.id}>
              <TableCell>
                {i.date}
                <small>{i.reference}</small>
              </TableCell>
              <TableCell>
                {i.kind}
                <small>{i.project || '未关联作品'}</small>
              </TableCell>
              <TableCell className="biz-money">¥{money(i.cents)}</TableCell>
              <TableCell>{agentName(i.agentId)}</TableCell>
              <TableCell>
                ¥{money(i.commissions.reduce((n, c) => n + c.cents, 0))}
              </TableCell>
              <TableCell>
                <span className={`biz-badge ${i.voided ? 'muted' : ''}`}>
                  {i.voided ? '已作废' : '已登记'}
                </span>
              </TableCell>
              <TableCell>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => open('detail', i)}
                >
                  详情
                </Button>
                {!i.voided && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => open('void', i)}
                  >
                    作废
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!rows.length && (
        <p className="biz-empty">
          暂无收入记录。登记实际收入后，统计和图表会自动更新。
        </p>
      )}
    </div>
  );
  return (
    <section className="business-hub">
      <header className="biz-heading">
        <div className="biz-heading-icon">
          {isChannel ? <Users /> : <Wallet />}
        </div>
        <div>
          <h1>{mode}</h1>
          <p>
            {isChannel
              ? '管理两级合作关系，按订单追踪佣金与结算。'
              : '统一记录作品与渠道收入，清楚掌握每一笔收益。'}
          </p>
        </div>
        <div className="actions">
          <Button
            variant="outline"
            disabled={busy}
            onClick={load}
            aria-label="重新加载账本"
          >
            <RefreshCw />
          </Button>
          <Button
            disabled={busy}
            onClick={() => open(isChannel ? 'agent' : 'income')}
          >
            <Plus />
            {isChannel ? '新增代理' : '登记收入'}
          </Button>
        </div>
      </header>
      <p className="biz-scope-note">
        当前为站点所有者的经营账本，记录自动保存。收入由人工登记；付款记录不会触发真实转账。外部代理注册及自动订单同步尚未接入。
      </p>
      {error && (
        <p role="alert" className="biz-error">
          {error}
          <Button size="sm" variant="ghost" disabled={busy} onClick={load}>
            重新加载账本
          </Button>
        </p>
      )}
      {notice && <output className="biz-notice">{notice}</output>}
      <div className="biz-nav">
        <Tabs value={tab} onValueChange={(v) => v && filtersReset(String(v))}>
          <TabsList variant="line">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="biz-period">
          <BusinessSelect
            label="统计周期"
            value={range}
            options={[
              { value: '7', label: '近7天' },
              { value: '30', label: '近30天' },
              { value: '90', label: '近90天' },
              { value: 'all', label: '全部时间' },
              { value: 'custom', label: '自定义' },
            ]}
            onChange={(v) => {
              setRange(v);
              setPage(1);
            }}
          />
        </div>
      </div>
      {range === 'custom' && (
        <div className="biz-toolbar">
          <label>
            开始日期
            <input
              aria-label="开始日期"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            结束日期
            <input
              aria-label="结束日期"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          {dateError && <p role="alert">请选择有效起止日期。</p>}
        </div>
      )}
      <div className="biz-stats">
        {isChannel ? (
          <>
            <div>
              <span>一级代理 · 全部</span>
              <strong>{state.agents.filter((a) => !a.parentId).length}</strong>
              <small>直属合作伙伴</small>
            </div>
            <div>
              <span>二级代理 · 全部</span>
              <strong>{state.agents.filter((a) => a.parentId).length}</strong>
              <small>一级代理的下级</small>
            </div>
            <div>
              <span>待付佣金 · 全部</span>
              <strong>¥{money(commission - paid)}</strong>
              <small>其中已建结算 ¥{money(reserved)}</small>
            </div>
            <div>
              <span>已登记付款 · 全部</span>
              <strong>¥{money(paid)}</strong>
              <small>人工登记的线下付款</small>
            </div>
          </>
        ) : (
          <>
            <div>
              <span>已登记收入 · 所选期间</span>
              <strong>¥{money(total)}</strong>
              <small>{valid.length} 笔有效收入</small>
            </div>
            <div>
              <span>作品收益 · 所选期间</span>
              <strong>
                ¥
                {money(
                  valid
                    .filter((i) => i.kind === '作品收益')
                    .reduce((n, i) => n + i.cents, 0),
                )}
              </strong>
              <small>按收入日期统计</small>
            </div>
            <div>
              <span>渠道收益 · 所选期间</span>
              <strong>
                ¥
                {money(
                  valid
                    .filter((i) => i.kind === '渠道收益')
                    .reduce((n, i) => n + i.cents, 0),
                )}
              </strong>
              <small>佣金支出单独管理</small>
            </div>
            <div>
              <span>待付代理佣金 · 全部</span>
              <strong>¥{money(commission - paid)}</strong>
              <small>不是可提现余额</small>
            </div>
          </>
        )}
      </div>
      {tab === '概览' && (
        <>
          {isChannel ? (
            <div className="biz-columns">
              <div className="biz-card">
                <div className="biz-section-head">
                  <h2>合作团队</h2>
                  <Button variant="ghost" onClick={() => filtersReset('团队')}>
                    查看全部
                  </Button>
                </div>
                {state.agents
                  .filter((a) => !a.parentId)
                  .slice(0, 5)
                  .map((a) => (
                    <div className="biz-team" key={a.id}>
                      <div>
                        <span className="biz-icon">
                          <Users size={18} />
                        </span>
                        <b>{a.name}</b>
                        <small>
                          邀请码 {a.code} · {a.active ? '已启用' : '已停用'}
                        </small>
                      </div>
                      <p>
                        {state.agents
                          .filter((b) => b.parentId === a.id)
                          .map((b) => b.name)
                          .join('、') || '尚无二级代理'}
                      </p>
                    </div>
                  ))}
                {!state.agents.length && (
                  <p className="biz-empty">
                    还没有代理，点击“新增代理”建立第一个合作关系。
                  </p>
                )}
              </div>
              <aside className="biz-card">
                <h2>佣金规则</h2>
                <span
                  className={`biz-badge ${state.rules.enabled ? '' : 'muted'}`}
                >
                  {state.rules.enabled ? '已启用新收入计佣' : '计佣未启用'}
                </span>
                <div className="biz-rule-number">
                  <span>
                    直接推荐佣金<b>{state.rules.first / 100}%</b>
                  </span>
                  <span>
                    上级推荐佣金<b>{state.rules.second / 100}%</b>
                  </span>
                </div>
                <p className="biz-muted">
                  按新登记收入金额计提。二级代理直接推荐获得直接佣金，其一级上级获得上级佣金。比例变更不追溯旧记录。
                </p>
                <Button variant="outline" onClick={() => filtersReset('规则')}>
                  <Settings2 />
                  管理规则
                </Button>
              </aside>
            </div>
          ) : (
            <div className="biz-charts">
              <div className="biz-card">
                <h2>
                  收入趋势 <small>单位：元 · 按实际收入日期</small>
                </h2>
                {chartData.length ? (
                  <div className="biz-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData}
                        margin={{ left: 10, right: 16, top: 15, bottom: 10 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#eaf0f9"
                        />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(v) => String(v).slice(5)}
                        />
                        <YAxis width={68} />
                        <Tooltip
                          formatter={(v) => [
                            '¥' + Number(v).toFixed(2),
                            '登记收入',
                          ]}
                        />
                        <Area
                          dataKey="income"
                          stroke="#2677ff"
                          fill="#e5f0ff"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="biz-empty chart-empty">
                    所选期间暂无收入，登记后显示趋势。
                  </p>
                )}
              </div>
              <div className="biz-card">
                <h2>收入来源占比</h2>
                {typeData.length ? (
                  <>
                    <div className="biz-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={typeData.map((d) => ({
                              ...d,
                              fill: d.color,
                            }))}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="55%"
                            outerRadius="78%"
                            paddingAngle={3}
                          />
                          <Tooltip
                            formatter={(v) => '¥' + Number(v).toFixed(2)}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="biz-legend">
                      {typeData.map((d) => (
                        <span key={d.name}>
                          <i style={{ background: d.color }} />
                          {d.name}{' '}
                          <b>{((d.value * 10000) / total).toFixed(1)}%</b>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="biz-empty chart-empty">有收入后显示占比。</p>
                )}
              </div>
            </div>
          )}
          <div className="biz-card">
            <div className="biz-section-head">
              <h2>最近收入记录</h2>
              <Button
                variant="ghost"
                onClick={() =>
                  isChannel ? onNavigate('收益中心') : filtersReset('明细')
                }
              >
                查看收益明细
              </Button>
            </div>
            {incomeTable(valid.slice().reverse().slice(0, 5))}
          </div>
        </>
      )}
      {(tab === '团队' || tab === '明细' || tab === '结算记录') && (
        <div className="biz-card">
          <div className="biz-toolbar">
            <label className="biz-search">
              <Search size={16} />
              <input
                aria-label="搜索业务记录"
                placeholder={
                  tab === '团队'
                    ? '搜索名称、邀请码或上级…'
                    : '搜索凭证、代理或作品…'
                }
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            {tab === '明细' && (
              <BusinessSelect
                value={kind}
                label="收益类型"
                options={['全部类型', ...incomeKinds].map((s) => ({
                  value: s,
                  label: s,
                }))}
                onChange={(v) => {
                  setKind(v);
                  setPage(1);
                }}
              />
            )}
            <BusinessSelect
              value={status}
              label="记录状态"
              options={[
                '全部状态',
                ...(tab === '团队'
                  ? ['已启用', '已停用']
                  : tab === '明细'
                    ? ['已登记', '已作废']
                    : ['待付款', '已登记付款', '已取消']),
              ].map((s) => ({ value: s, label: s }))}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            />
            <Button
              variant="outline"
              onClick={() =>
                tab === '明细'
                  ? exportIncome()
                  : tab === '团队'
                    ? exportCsv('代理团队', [
                        ['名称', '邀请码', '级别', '上级', '状态'],
                        ...matchedAgents.map((a) => [
                          a.name,
                          a.code,
                          a.parentId ? '二级' : '一级',
                          agentName(a.parentId),
                          a.active ? '启用' : '停用',
                        ]),
                      ])
                    : exportCsv('佣金结算', [
                        ['代理', '金额（元）', '状态', '创建时间', '付款凭证'],
                        ...matchedSettlements.map((s) => [
                          agentName(s.agentId),
                          (s.cents / 100).toFixed(2),
                          s.status,
                          s.createdAt,
                          s.reference,
                        ]),
                      ])
              }
            >
              <Download />
              导出筛选结果
            </Button>
          </div>
          {tab === '明细' ? (
            incomeTable(slice(matchedIncome))
          ) : tab === '团队' ? (
            <div className="biz-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      '代理 / 邀请码',
                      '层级 / 上级',
                      '下级人数',
                      '可建结算佣金',
                      '状态',
                      '操作',
                    ].map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slice(matchedAgents).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        {a.name}
                        <small>{a.code}</small>
                      </TableCell>
                      <TableCell>
                        {a.parentId ? '二级代理' : '一级代理'}
                        <small>{agentName(a.parentId)}</small>
                      </TableCell>
                      <TableCell>
                        {state.agents.filter((b) => b.parentId === a.id).length}
                      </TableCell>
                      <TableCell className="biz-money">
                        ¥
                        {money(
                          openCommission(state, a.id).reduce(
                            (n, r) => n + r.cents,
                            0,
                          ),
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`biz-badge ${a.active ? '' : 'muted'}`}
                        >
                          {a.active ? '已启用' : '已停用'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="actions">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(a.code);
                                setNotice(
                                  '邀请码已复制。外部注册尚未开放，可在人工登记时使用。',
                                );
                              } catch {
                                setError('无法访问剪贴板，请手动复制邀请码');
                              }
                            }}
                          >
                            <Copy />
                            邀请码
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => open('settle', a)}
                          >
                            结算
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              mutate({
                                type: 'agentStatus',
                                id: a.id,
                                active: !a.active,
                              })
                            }
                          >
                            {a.active ? '停用' : '启用'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!matchedAgents.length && (
                <p className="biz-empty">没有符合条件的代理。</p>
              )}
            </div>
          ) : (
            <div className="biz-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      '代理',
                      '结算金额',
                      '关联收入',
                      '状态',
                      '创建时间 / 凭证',
                      '操作',
                    ].map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slice(matchedSettlements).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{agentName(s.agentId)}</TableCell>
                      <TableCell className="biz-money">
                        ¥{money(s.cents)}
                      </TableCell>
                      <TableCell>{s.incomeIds.length} 笔</TableCell>
                      <TableCell>
                        <span
                          className={`biz-badge ${s.status === '已取消' ? 'muted' : ''}`}
                        >
                          {s.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {labelDate(s.createdAt)}
                        <small>{s.reference || '尚无付款凭证'}</small>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => open('settlementDetail', s)}
                        >
                          明细
                        </Button>
                        {s.status === '待付款' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => open('pay', s)}
                            >
                              登记线下付款
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => open('cancel', s)}
                            >
                              取消
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!matchedSettlements.length && (
                <p className="biz-empty">
                  暂无结算记录。在代理团队中为已有佣金创建结算。
                </p>
              )}
            </div>
          )}
          <div className="biz-pagination">
            <span>共 {currentRows.length} 条 · 每页10条</span>
            <Button
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              上一页
            </Button>
            <span>
              {currentPage} / {pageCount}
            </span>
            <Button
              variant="outline"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
      {tab === '规则' && (
        <div className="biz-card">
          <div className="biz-section-head">
            <h2>两级佣金规则</h2>
            <Button onClick={() => open('rules')} disabled={busy}>
              编辑规则
            </Button>
          </div>
          <div className="biz-rule-number">
            <span>
              直接推荐<b>{state.rules.first / 100}%</b>
            </span>
            <span>
              上级推荐<b>{state.rules.second / 100}%</b>
            </span>
            <span>
              新收入计佣<b>{state.rules.enabled ? '已启用' : '未启用'}</b>
            </span>
          </div>
          <ul className="biz-rule-list">
            <li>仅对新登记且关联有效代理的实际收入计算佣金，按分向下取整。</li>
            <li>
              代理层级固定为一级及二级。直接推荐人获得直接佣金，有上级时，上级获得上级佣金。
            </li>
            <li>收入、佣金、待付款结算分别记录，佣金不会重复计入收入。</li>
            <li>
              修改规则只影响后续记录；作废收入会撤销未结算佣金。已付款收入需线下处理退款。
            </li>
            <li>
              目前以人工凭证为依据，未对接支付平台核验、自动分账或代理自助提现。
            </li>
          </ul>
        </div>
      )}
      {tab === '日志' && (
        <div className="biz-card">
          <h2>
            最近操作记录 <small>最多保留300条 · 站点所有者</small>
          </h2>
          {state.audit.length ? (
            state.audit
              .filter((a) => inPeriod(businessDate(a.at)))
              .map((a, i) => (
                <div className="biz-log" key={`${a.at}-${i}`}>
                  <small>{labelDate(a.at)}</small>
                  <p>{a.message}</p>
                </div>
              ))
          ) : (
            <p className="biz-empty">尚无业务操作。</p>
          )}
        </div>
      )}
      <Dialog
        open={!!dialog}
        onOpenChange={(v) => !busy && !v && setDialog('')}
      >
        <DialogContent className="biz-dialog">
          <DialogHeader>
            <DialogTitle>
              {
                (
                  {
                    income: '登记实际收入',
                    agent: '新增渠道代理',
                    rules: '配置佣金规则',
                    settle: '创建佣金结算',
                    pay: '登记线下付款',
                    cancel: '取消结算',
                    void: '作废收入',
                    detail: '收入详情',
                    settlementDetail: '结算详情',
                  } as Record<string, string>
                )[dialog]
              }
            </DialogTitle>
            <DialogDescription>
              {dialog === 'agent'
                ? '上级关系保存后固定，避免历史佣金归属被改变。'
                : dialog === 'rules'
                  ? '只影响保存后新登记的收入，不重算历史佣金。'
                  : '此处管理经营记录，不会发起收款或转账。'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="biz-form"
            onSubmit={(e) => {
              e.preventDefault();
              let action: Record<string, unknown> = {};
              if (dialog === 'income')
                action = {
                  type: 'income',
                  ...form,
                  agentId: form.agentId === 'none' ? '' : form.agentId,
                };
              else if (dialog === 'agent')
                action = {
                  type: 'agent',
                  ...form,
                  parentId: form.parentId === 'none' ? '' : form.parentId,
                };
              else if (dialog === 'rules')
                action = {
                  type: 'rules',
                  first: Math.round(Number(form.first) * 100),
                  second: Math.round(Number(form.second) * 100),
                  enabled,
                };
              else if (dialog === 'settle')
                action = { type: 'settle', agentId: target?.id };
              else if (dialog === 'pay' || dialog === 'cancel')
                action = {
                  type: 'settlementStatus',
                  id: target?.id,
                  status: dialog === 'pay' ? '已登记付款' : '已取消',
                  reference: form.reference,
                };
              else if (dialog === 'void')
                action = {
                  type: 'voidIncome',
                  id: target?.id,
                  reason: form.reason,
                };
              void mutate(action);
            }}
          >
            {dialog === 'income' && (
              <>
                {field('reference', '外部订单 / 凭证编号')}
                <div className="biz-form-pair">
                  {field('amount', '实收金额（元）', 'number')}
                  {field('date', '收入日期', 'date')}
                </div>
                <label htmlFor="income-kind">
                  收益分类
                  <BusinessSelect
                    id="income-kind"
                    value={form.kind}
                    label="收益分类"
                    options={incomeKinds.map((s) => ({ value: s, label: s }))}
                    onChange={(v) => setForm({ ...form, kind: v })}
                  />
                </label>
                {field('project', '关联作品名称（可选）', 'text', false)}
                <label htmlFor="income-agent">
                  关联代理（可选）
                  <BusinessSelect
                    id="income-agent"
                    value={form.agentId}
                    label="关联代理"
                    options={[
                      { value: 'none', label: '不关联代理' },
                      ...state.agents
                        .filter((a) => a.active)
                        .map((a) => ({
                          value: a.id,
                          label: `${a.name} · ${a.code}`,
                        })),
                    ]}
                    onChange={(v) => setForm({ ...form, agentId: v })}
                  />
                </label>
                {field('note', '收入来源说明（可选）', 'text', false)}
                <p className="biz-muted">
                  {state.rules.enabled
                    ? `本笔如关联代理，将按直接${state.rules.first / 100}%、上级${state.rules.second / 100}%计佣。`
                    : '计佣尚未启用，本笔不会生成代理佣金。'}
                </p>
              </>
            )}
            {dialog === 'agent' && (
              <>
                {field('name', '代理名称')}
                {field('code', '邀请码（4–24位英文、数字或横线）')}
                <label htmlFor="agent-parent">
                  所属上级
                  <BusinessSelect
                    id="agent-parent"
                    value={form.parentId}
                    label="所属上级"
                    options={[
                      { value: 'none', label: '无上级 · 建立一级代理' },
                      ...state.agents
                        .filter((a) => !a.parentId && a.active)
                        .map((a) => ({
                          value: a.id,
                          label: a.name + ' · 建立二级代理',
                        })),
                    ]}
                    onChange={(v) => setForm({ ...form, parentId: v })}
                  />
                </label>
                {field('note', '备注（可选）', 'text', false)}
              </>
            )}
            {dialog === 'rules' && (
              <>
                <div className="biz-form-pair">
                  {field('first', '直接推荐比例（%）', 'number')}
                  {field('second', '上级推荐比例（%）', 'number')}
                </div>
                <label className="biz-check" htmlFor="rules-enabled">
                  <Checkbox
                    id="rules-enabled"
                    checked={enabled}
                    onCheckedChange={(v) => setEnabled(v === true)}
                  />
                  启用新登记收入计佣
                </label>
              </>
            )}
            {dialog === 'settle' && target && (
              <>
                <p>
                  为 <b>{agentName(target.id)}</b>{' '}
                  创建全部未结算佣金的待付款记录。
                </p>
                <strong className="biz-big-money">
                  ¥
                  {money(
                    openCommission(state, target.id).reduce(
                      (n, r) => n + r.cents,
                      0,
                    ),
                  )}
                </strong>
                <p>保存后这些收入会被此结算占用，不能重复创建结算。</p>
              </>
            )}
            {dialog === 'pay' && target && (
              <>
                <p>
                  请先完成线下付款，再登记凭证。金额：
                  <b>¥{money((target as Settlement).cents)}</b>
                </p>
                {field('reference', '线下付款凭证编号')}
              </>
            )}
            {dialog === 'cancel' && (
              <p>
                取消待付款结算后，对应佣金会恢复为可结算。不会影响收入记录。
              </p>
            )}
            {dialog === 'void' && (
              <>
                {field('reason', '作废原因')}
                <p>
                  记录会保留备查，金额从收益统计中移除。已进入有效结算的收入不能直接作废。
                </p>
              </>
            )}
            {dialog === 'detail' &&
              target &&
              (() => {
                const i = target as Income;
                return (
                  <>
                    <p>
                      <b>{i.reference}</b> · {i.kind} · {i.date}
                    </p>
                    <strong className="biz-big-money">¥{money(i.cents)}</strong>
                    <p>
                      作品：{i.project || '未关联'}
                      <br />
                      来源：{i.note || '未填写'}
                      <br />
                      状态：{i.voided ? '已作废' : '已登记'}
                    </p>
                    <h3>佣金快照</h3>
                    {i.commissions.length ? (
                      i.commissions.map((c) => (
                        <p key={c.agentId}>
                          {agentName(c.agentId)} ·{' '}
                          {c.level === 1 ? '直接' : '上级'}推荐 · {c.rate / 100}
                          % · ¥{money(c.cents)}
                        </p>
                      ))
                    ) : (
                      <p>登记时未分配佣金。</p>
                    )}
                  </>
                );
              })()}
            {dialog === 'settlementDetail' &&
              target &&
              (() => {
                const s = target as Settlement;
                return (
                  <>
                    <p>
                      {agentName(s.agentId)} · {s.status} · ¥{money(s.cents)}
                    </p>
                    <p>
                      付款凭证：{s.reference || '未登记'}
                      {s.paidAt && (
                        <>
                          <br />
                          登记时间：{labelDate(s.paidAt)}
                        </>
                      )}
                    </p>
                    <h3>关联收入</h3>
                    {s.incomeIds.map((id) => {
                      const i = state.income.find((i) => i.id === id);
                      return (
                        <p key={id}>
                          {i?.reference} · 佣金 ¥
                          {money(
                            i?.commissions.find((c) => c.agentId === s.agentId)
                              ?.cents || 0,
                          )}
                        </p>
                      );
                    })}
                  </>
                );
              })()}
            {error && (
              <p role="alert" className="biz-error">
                {error}
              </p>
            )}
            <div className="actions">
              {!['detail', 'settlementDetail'].includes(dialog) && (
                <Button type="submit" disabled={busy}>
                  {busy
                    ? '正在保存…'
                    : dialog === 'pay'
                      ? '确认已在线下付款'
                      : '确认保存'}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDialog('')}
              >
                关闭
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
