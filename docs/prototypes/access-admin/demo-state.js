/* Isolated, memory-only prototype state. NEVER use this as production authentication. */
(() => {
  const initialNow = Date.parse('2026-09-15T15:30:00+08:00');
  const start = Date.now();
  const now = () => initialNow + Date.now() - start;
  const date = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
  const local = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(0, 16);
  const normalize = (value) => value.trim().toLowerCase();
  const parse = (value) => Date.parse(value + ':00+08:00');
  const users = [
    {
      id: 'A001',
      account: 'admin',
      name: '南哥',
      role: 'super_admin',
      until: null,
      banned: false,
      joined: '2026-08-01',
    },
    {
      id: 'U1001',
      account: 'lin.director',
      name: '林导演',
      until: '2026-12-31T23:59',
      joined: '2026-08-01',
      daily: [12, 24, 8, 63, 3],
    },
    {
      id: 'U1002',
      account: 'chen.studio',
      name: '陈工作室',
      until: '2026-10-15T23:59',
      joined: '2026-08-12',
      daily: [8, 18, 6, 42, 2],
    },
    {
      id: 'U1003',
      account: 'zhou.film',
      name: '周同学',
      until: '2026-09-20T23:59',
      joined: '2026-09-01',
      daily: [5, 9, 4, 28, 1],
    },
    {
      id: 'U1004',
      account: 'wang.creator',
      name: '王创作者',
      until: '2026-09-10T23:59',
      joined: '2026-07-22',
      daily: [0, 0, 0, 0, 0],
    },
    {
      id: 'U1005',
      account: 'xu.studio',
      name: '许工作室',
      until: '2026-11-30T23:59',
      banned: true,
      joined: '2026-08-15',
      daily: [2, 3, 1, 9, 1],
    },
  ].map((u) => ({ role: 'member', banned: false, ...u }));
  const keys = new Map(users.map((u) => [u.id, 'demo-key-2026']));
  const aliases = {
    member: 'lin.director',
    expired: 'wang.creator',
    banned: 'xu.studio',
  };
  const metrics = ['创意数', '故事数', '剧本数', '素材数', '导出视频数'];
  const eventNames = [
    '保存项目创意',
    '生成故事方案',
    '生成剧本',
    '素材入库',
    '导出视频文件',
  ];
  const events = [];
  for (const u of users) {
    for (let days = 29; days >= 0; days--) {
      const day = date(initialNow - days * 86400000);
      if (day < u.joined || (u.id === 'U1004' && day > '2026-09-10')) continue;
      const counts = u.daily || [3, 6, 2, 12, 1];
      for (let metric = 0; metric < 5; metric++) {
        const quantity =
          days === 0
            ? counts[metric]
            : Math.max(
                1,
                Math.floor(
                  (counts[metric] || [4, 9, 3, 20, 1][metric]) *
                    (0.35 + (days % 5) * 0.12),
                ),
              );
        for (let n = 0; n < quantity; n++)
          events.push({
            id: `E-${u.id}-${day}-${metric}-${n}`,
            userId: u.id,
            role: u.role,
            metric,
            quantity: 1,
            at: `${day}T${days === 0 && u.id === 'U1005' ? '09' : '14'}:${String((metric * 11 + n) % 60).padStart(2, '0')}:00`,
            outcome: '成功',
            name: eventNames[metric],
            source: metric === 4 ? '桌面 · 分镜视频' : '桌面',
            received: true,
          });
      }
    }
  }
  let session = null,
    nextLog = 1;
  const logs = [];
  function status(u) {
    return u.banned
      ? 'banned'
      : u.role === 'member' && now() >= parse(u.until)
        ? 'expired'
        : 'active';
  }
  function audit(
    action,
    target,
    change,
    reason = '查看后台信息',
    outcome = '成功',
    actor = session,
  ) {
    if (actor?.role !== 'super_admin') return;
    logs.unshift(
      Object.freeze({
        id: `AUD-${String(nextLog++).padStart(5, '0')}`,
        at: new Date(now() + 8 * 3600000)
          .toISOString()
          .slice(0, 19)
          .replace('T', ' '),
        actor: actor.account,
        actorId: actor.id,
        action,
        target,
        change,
        reason,
        outcome,
      }),
    );
  }
  function assertAdmin() {
    if (
      !session ||
      session.role !== 'super_admin' ||
      status(session) !== 'active'
    )
      throw Error('仅超级管理员可执行此操作');
  }
  function login(account, key) {
    const a = normalize(account);
    const u = users.find((u) => u.account === (aliases[a] || a));
    if (!u || keys.get(u.id) !== key) {
      audit('登录失败', a, '凭据验证失败', '账号或密钥错误', '失败', u);
      throw Error('账号或密钥不正确，请重新输入。');
    }
    const s = status(u);
    if (s !== 'active')
      throw Error(
        s === 'banned'
          ? '账号权限已被封禁，请联系管理员。'
          : '授权已到期，请联系管理员延长使用时间。',
      );
    session = u;
    audit('登录系统', u.account, '登录成功', '账号与密钥验证通过');
    return u;
  }
  function logout() {
    audit('退出系统', session?.account || '', '会话已退出');
    session = null;
  }
  function create(input) {
    assertAdmin();
    const account = normalize(input.account),
      reason = input.reason.trim();
    let error = !/^[a-z0-9._-]{3,64}$/.test(account)
      ? '账号需为 3–64 位字母、数字、点、横线或下划线。'
      : users.some((u) => u.account === account) ||
          Object.hasOwn(aliases, account)
        ? '账号已存在或为演示保留账号。'
        : input.key.length < 12 || input.key.length > 128
          ? '密钥须为 12–128 位。'
          : !Number.isFinite(parse(input.until)) || parse(input.until) <= now()
            ? '授权到期时间必须晚于演示当前时间。'
            : !reason
              ? '请填写操作原因。'
              : '';
    if (error) {
      audit('新增用户', account, '未创建', reason || '表单校验', '失败');
      throw Error(error);
    }
    const u = {
      id: `U${1000 + users.length}`,
      account,
      name: input.name.trim() || account,
      role: 'member',
      until: input.until,
      banned: false,
      joined: date(now()),
    };
    users.push(u);
    keys.set(u.id, input.key);
    audit(
      '新增用户',
      account,
      `无账号 → 普通会员；有效至 ${u.until.replace('T', ' ')}；已设置密钥`,
      reason,
    );
    return u;
  }
  function change(u, { until, banned, reason }) {
    assertAdmin();
    if (u.role !== 'member') throw Error('本页面仅管理普通会员');
    const action =
      until !== undefined ? '调整期限' : banned ? '封禁用户' : '恢复权限';
    if (
      !reason.trim() ||
      (until !== undefined && !Number.isFinite(parse(until)))
    ) {
      audit(action, u.account, '未修改', '输入校验失败', '失败');
      throw Error('请填写有效时间和操作原因。');
    }
    const statusLabel = {
      active: '授权有效',
      expired: '已到期',
      banned: '已封禁',
    };
    const before =
      until !== undefined ? u.until.replace('T', ' ') : statusLabel[status(u)];
    if (until !== undefined) u.until = until;
    else u.banned = banned;
    audit(
      action,
      u.account,
      `${before} → ${until !== undefined ? u.until.replace('T', ' ') : statusLabel[status(u)]}`,
      reason,
    );
    return u;
  }
  function rangeEvents(userId, from, to) {
    return events.filter(
      (e) =>
        e.role === 'member' &&
        (!userId || e.userId === userId) &&
        e.at.slice(0, 10) >= from &&
        e.at.slice(0, 10) <= to,
    );
  }
  function counts(userId, from, to) {
    return rangeEvents(userId, from, to).reduce(
      (a, e) => ((a[e.metric] += e.quantity), a),
      [0, 0, 0, 0, 0],
    );
  }
  window.demoState = {
    users,
    logs,
    metrics,
    eventNames,
    now,
    date,
    local,
    status,
    login,
    logout,
    create,
    change,
    audit,
    counts,
    rangeEvents,
    get session() {
      return session;
    },
    get members() {
      return users.filter((u) => u.role === 'member');
    },
    latest(u) {
      return (
        events
          .filter((e) => e.userId === u.id)
          .map((e) => e.at)
          .sort()
          .at(-1) || null
      );
    },
  };
})();
