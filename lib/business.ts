export const incomeKinds = [
  '作品收益',
  '渠道收益',
  '邀请收益',
  '其他收益',
] as const;
export function businessDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(
    new Date(value),
  );
}
export type Agent = {
  id: string;
  name: string;
  code: string;
  parentId: string;
  active: boolean;
  createdAt: string;
  note: string;
};
export type Commission = {
  agentId: string;
  level: 1 | 2;
  cents: number;
  rate: number;
};
export type Income = {
  id: string;
  reference: string;
  kind: string;
  cents: number;
  date: string;
  project: string;
  note: string;
  agentId: string;
  commissions: Commission[];
  voided: boolean;
  createdAt: string;
};
export type Settlement = {
  id: string;
  agentId: string;
  incomeIds: string[];
  cents: number;
  status: '待付款' | '已登记付款' | '已取消';
  reference: string;
  createdAt: string;
  paidAt?: string;
};
export type Business = {
  revision: number;
  agents: Agent[];
  income: Income[];
  settlements: Settlement[];
  rules: { enabled: boolean; first: number; second: number };
  audit: { at: string; message: string }[];
};
export const emptyBusiness = (): Business => ({
  revision: 0,
  agents: [],
  income: [],
  settlements: [],
  rules: { enabled: false, first: 0, second: 0 },
  audit: [],
});
export function money(cents: number) {
  return (cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
export function parseMoney(value: unknown): number {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(value.trim())
  )
    throw Error('金额须为正数，最多两位小数、八位整数');
  const [whole, decimal = ''] = value.trim().split('.');
  const n = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (n <= 0) throw Error('金额必须大于0');
  return n;
}
function text(value: unknown, label: string, max = 200, optional = false) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!optional && !value.trim())
  )
    throw Error(`${label}不能为空，最多${max}字`);
  return value.trim();
}
function rate(value: unknown) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 10000
  )
    throw Error('佣金比例须为0至100%，最多两位小数');
  return value;
}
export function openCommission(state: Business, agentId: string) {
  const reserved = new Set(
    state.settlements
      .filter((s) => s.agentId === agentId && s.status !== '已取消')
      .flatMap((s) => s.incomeIds),
  );
  return state.income
    .filter((i) => !i.voided && !reserved.has(i.id))
    .flatMap((i) =>
      i.commissions
        .filter((c) => c.agentId === agentId && c.cents > 0)
        .map((c) => ({ incomeId: i.id, cents: c.cents })),
    );
}
// All mutations are applied server-side and committed with a D1 revision compare-and-swap.
// Amounts use integer cents; rates use basis points. Historical allocations are immutable.
export function applyBusiness(
  state: Business,
  action: Record<string, unknown>,
  now: string,
  newId: string,
): Business {
  const next = structuredClone(state);
  let message = '';
  const findAgent = (value: unknown) => {
    const a = next.agents.find((a) => a.id === value);
    if (!a) throw Error('代理不存在');
    return a;
  };
  switch (action.type) {
    case 'agent': {
      if (next.agents.length >= 500) throw Error('当前最多管理500名代理');
      const name = text(action.name, '代理名称', 80);
      const code = text(action.code, '邀请码', 24).toUpperCase();
      if (
        !/^[A-Z0-9_-]{4,24}$/.test(code) ||
        next.agents.some((a) => a.code === code)
      )
        throw Error('邀请码需为4至24位英文、数字、横线，且不能重复');
      const parentId = text(action.parentId ?? '', '上级代理', 100, true);
      if (parentId) {
        const parent = findAgent(parentId);
        if (parent.parentId)
          throw Error('最多支持两级代理，二级代理不能再建立下级');
        if (!parent.active) throw Error('上级代理已停用');
      }
      next.agents.push({
        id: newId,
        name,
        code,
        parentId,
        active: true,
        note: text(action.note ?? '', '备注', 500, true),
        createdAt: now,
      });
      message = `新增${parentId ? '二' : '一'}级代理：${name}（${code}）`;
      break;
    }
    case 'agentStatus': {
      const a = findAgent(action.id);
      if (typeof action.active !== 'boolean') throw Error('代理状态错误');
      a.active = action.active;
      message = `${a.active ? '启用' : '停用'}代理：${a.name}`;
      break;
    }
    case 'rules': {
      const first = rate(action.first),
        second = rate(action.second);
      if (first + second > 10000) throw Error('两级佣金合计不能超过100%');
      if (typeof action.enabled !== 'boolean') throw Error('计佣状态错误');
      if (action.enabled && first + second === 0)
        throw Error('启用计佣前请填写比例');
      next.rules = { enabled: action.enabled, first, second };
      message = `佣金规则：${action.enabled ? '启用' : '停用'}，直接推荐${first / 100}%，上级推荐${second / 100}%（仅影响新登记收入）`;
      break;
    }
    case 'income': {
      if (next.income.length >= 3000)
        throw Error('当前账本已达3000条，请联系管理员扩容');
      const reference = text(action.reference, '外部订单/凭证编号', 100);
      if (
        next.income.some(
          (i) => i.reference.toLowerCase() === reference.toLowerCase(),
        )
      )
        throw Error('此凭证编号已经登记，不能重复入账；作废记录也保留原编号');
      const cents = parseMoney(action.amount);
      const kind = text(action.kind, '收益分类', 20);
      if (!(incomeKinds as readonly string[]).includes(kind))
        throw Error('收益分类错误');
      const date = text(action.date, '收入日期', 10);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date ||
        date > businessDate(now)
      )
        throw Error('请输入有效日期，不能晚于今天');
      const agentId = text(action.agentId ?? '', '关联代理', 100, true);
      const commissions: Commission[] = [];
      if (agentId) {
        const agent = findAgent(agentId);
        if (
          !agent.active ||
          (agent.parentId && !findAgent(agent.parentId).active)
        )
          throw Error('代理或上级已停用，不能登记新佣金');
        if (next.rules.enabled) {
          // Floor avoids over-allocation on very small transactions.
          commissions.push({
            agentId,
            level: 1,
            rate: next.rules.first,
            cents: Math.floor((cents * next.rules.first) / 10000),
          });
          if (agent.parentId)
            commissions.push({
              agentId: agent.parentId,
              level: 2,
              rate: next.rules.second,
              cents: Math.floor((cents * next.rules.second) / 10000),
            });
        }
      }
      next.income.push({
        id: newId,
        reference,
        kind,
        cents,
        date,
        agentId,
        commissions,
        project: text(action.project ?? '', '关联作品', 150, true),
        note: text(action.note ?? '', '来源说明', 500, true),
        voided: false,
        createdAt: now,
      });
      message = `人工登记收入：${reference}，¥${money(cents)}，分配佣金¥${money(commissions.reduce((sum, c) => sum + c.cents, 0))}`;
      break;
    }
    case 'voidIncome': {
      const i = next.income.find((i) => i.id === action.id);
      if (!i || i.voided) throw Error('记录不存在或已作废');
      if (
        next.settlements.some(
          (s) => s.status !== '已取消' && s.incomeIds.includes(i.id),
        )
      )
        throw Error(
          '此收入已有结算记录，请先取消待付款结算；已付款的收入需在线下处理退款，不能直接作废',
        );
      const reason = text(action.reason, '作废原因', 300);
      i.voided = true;
      message = `作废收入：${i.reference}，原因：${reason}`;
      break;
    }
    case 'settle': {
      if (next.settlements.length >= 3000) throw Error('结算记录已达上限');
      const agent = findAgent(action.agentId);
      const rows = openCommission(next, agent.id);
      const cents = rows.reduce((sum, i) => sum + i.cents, 0);
      if (!cents) throw Error('此代理没有可结算佣金');
      next.settlements.push({
        id: newId,
        agentId: agent.id,
        incomeIds: rows.map((i) => i.incomeId),
        cents,
        status: '待付款',
        reference: '',
        createdAt: now,
      });
      message = `为${agent.name}创建结算记录：¥${money(cents)}，尚未付款`;
      break;
    }
    case 'settlementStatus': {
      const s = next.settlements.find((s) => s.id === action.id);
      if (!s || s.status !== '待付款') throw Error('只能操作待付款结算');
      if (action.status === '已取消') {
        s.status = '已取消';
        message = `取消结算：${s.id}`;
      } else if (action.status === '已登记付款') {
        const reference = text(action.reference, '线下付款凭证', 150);
        if (
          next.settlements.some(
            (s) =>
              s.status === '已登记付款' &&
              s.reference.toLowerCase() === reference.toLowerCase(),
          )
        )
          throw Error('该付款凭证已经登记');
        s.status = '已登记付款';
        s.reference = reference;
        s.paidAt = now;
        message = `人工登记线下付款：¥${money(s.cents)}，凭证${reference}`;
      } else throw Error('结算状态错误');
      break;
    }
    default:
      throw Error('不支持的业务操作');
  }
  next.audit = [{ at: now, message }, ...next.audit].slice(0, 300);
  next.revision++;
  return next;
}
