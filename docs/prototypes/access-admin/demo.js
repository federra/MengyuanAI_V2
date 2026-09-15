/* UI-only review prototype. Data and public demo credentials live in memory. */
const S = window.demoState,
  $ = (s) => document.querySelector(s),
  icon = (n) => window.demoIcons[n] || '';
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const root = $('#root'),
  modal = $('#modal'),
  params = new URLSearchParams(location.search),
  review = params.get('review') === '1';
const today = () => S.date(S.now()),
  fmt = (s) => (s ? s.replace('T', ' ') : '尚无创作活动');
const labels = { active: '授权有效', expired: '已到期', banned: '已封禁' };
let page = '创作工作台',
  section = 'overview',
  period = 'today',
  search = '',
  filter = 'all',
  userPageNumber = 1,
  detailPage = 1,
  detailPeriod = 'today',
  detailFrom = '',
  detailTo = '',
  notice = '',
  modalTitle = '';
let from = today(),
  to = today();
const pageSize = 8,
  metricIcons = ['Lightbulb', 'FileText', 'FileText', 'Image', 'Download'];
function brand() {
  return '<div class="brand"><img src="favicon.svg" alt=""><div><strong>AI 短片导演</strong><small>DIRECTOR STUDIO</small></div></div>';
}
function badge(u) {
  const state = S.status(u);
  return `<span class="badge ${state === 'active' ? 'good' : state === 'expired' ? 'warn' : 'bad'}">${labels[state]}</span>`;
}
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').style.display = 'block';
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(
    () => ($('#toast').style.display = 'none'),
    3000,
  );
}
function audit(action, target, change, reason, outcome) {
  S.audit(action, target, change, reason, outcome);
}
function close(cancel = false) {
  if (cancel) audit('关闭弹窗', modalTitle, '未提交变更', '用户关闭');
  modal.close();
}
function showModal(title, body, wide = false) {
  modalTitle = title;
  modal.className = wide ? 'wide' : '';
  modal.setAttribute('aria-label', title);
  modal.innerHTML = `<div class="dialog-head"><h2>${title}</h2><button class="ghost" data-close aria-label="关闭弹窗">${icon('X')}</button></div>${body}`;
  modal
    .querySelectorAll('[data-close]')
    .forEach((b) => (b.onclick = () => close(true)));
  if (!modal.open) modal.showModal();
}
modal.addEventListener('cancel', () =>
  audit('关闭弹窗', modalTitle, '未提交变更', '按 Escape 关闭'),
);
function formError(id, message) {
  $(id).className = 'error';
  $(id).textContent = message;
}
function render() {
  window.scrollTo(0, 0);
  syncReviewer();
  if (!S.session) {
    loginPage();
    return;
  }
  if (S.status(S.session) !== 'active') {
    notice =
      S.status(S.session) === 'banned'
        ? '账号权限已被封禁，请联系管理员。'
        : '授权已到期，请联系管理员延长使用时间。';
    close();
    S.logout();
    loginPage();
    syncReviewer();
    return;
  }
  shell();
}
function loginPage() {
  root.innerHTML = `<div class="login">${brand()}<section class="login-card"><h1>登录工作台</h1><p>输入管理员为你开通的账号与密钥。</p><form id="login-form"><label class="field"><span>账号</span><input name="account" autocomplete="off" placeholder="请输入账号" required></label><label class="field"><span>密钥</span><div class="password"><input id="login-key" name="key" type="password" autocomplete="off" placeholder="请输入授权密钥" required><button type="button" id="reveal" aria-label="显示密钥">${icon('Eye')}</button></div></label><div id="login-error" role="alert" ${notice ? 'class="error"' : ''}>${esc(notice)}</div><button class="primary" type="submit">登录并进入工作台 ${icon('ArrowRight')}</button></form><div class="login-support">还没有授权或授权已到期？请联系管理员</div></section><div class="login-foot">让每一个想法成片${review ? '<br>评审账号：admin / member / expired / banned<br>公开演示密钥：demo-key-2026；新增模拟账号也可登录' : ''}</div></div>`;
  $('#reveal').onclick = () => {
    const input = $('#login-key'),
      hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    $('#reveal').innerHTML = icon(hidden ? 'EyeOff' : 'Eye');
    $('#reveal').setAttribute('aria-label', hidden ? '隐藏密钥' : '显示密钥');
  };
  $('#login-form').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      S.login(f.get('account'), f.get('key'));
      notice = '';
      page = '创作工作台';
      render();
    } catch (err) {
      formError('#login-error', err.message);
    }
  };
}
const navs = [
  ['FolderOpen', '项目中心'],
  ['Clapperboard', '创作工作台'],
  ['Layers3', '资产中心'],
  ['Blocks', 'Skill 中心'],
  ['ListVideo', '任务中心'],
  ['Wallet', '收益中心'],
  ['Users', '渠道代理'],
  ['Scissors', '剪辑输出'],
  ['Settings2', '模型设置'],
  ['Settings2', '系统设置'],
];
function shell() {
  const u = S.session,
    isAdmin = u.role === 'super_admin';
  root.innerHTML = `<div class="shell"><aside>${brand()}<div class="nav-caption">工作空间</div><nav>${[...navs, ...(isAdmin ? [['ShieldCheck', '管理员后台']] : [])].map(([i, n]) => `<button title="${n}" data-nav="${n}" class="${page === n ? 'active' : ''}">${icon(i)}<span>${n}</span></button>`).join('')}</nav><div class="aside-bottom"><div class="studio-note"><b>让每一个想法成片</b>创意有起点，创作无边界。</div><div class="profile"><div class="avatar">${esc(u.name.slice(0, 1))}</div><div>${esc(u.name)}<small>${isAdmin ? '超级管理员' : '普通会员 · 全功能授权'}</small></div><button class="ghost" id="logout" aria-label="退出登录">${icon('LogOut')}</button></div></div></aside><main><header class="topbar"><div>工作空间 ${icon('ChevronRight')} <b>${page}</b></div><div><span class="muted">${today()} · 北京时间</span><span class="badge">${isAdmin ? '超级管理员' : '授权有效'}</span></div></header><div class="content" id="content"></div></main></div>`;
  $('#logout').onclick = () => {
    S.logout();
    notice = '';
    render();
  };
  document.querySelectorAll('[data-nav]').forEach(
    (b) =>
      (b.onclick = () => {
        page = b.dataset.nav;
        audit('访问页面', page, '打开页面');
        render();
      }),
  );
  if (page === '管理员后台' && isAdmin) admin();
  else workspace();
}
function workspace() {
  const u = S.session;
  $('#content').innerHTML =
    `<div class="member-welcome"><div class="eyebrow">WORKSPACE ACCESS</div><h1>${page === '创作工作台' ? `欢迎回来，${esc(u.name)}` : page}</h1><p class="subtitle">${u.role === 'super_admin' ? '超级管理员 · 全部业务功能与用户管理权限' : `普通会员 · 全功能授权至 ${fmt(u.until)}`}</p><div class="panel" style="margin-top:26px"><h2>${page}已授权</h2><p>此区域沿用现有系统，原型不重复实现创作页面。普通会员与超级管理员均可使用全部业务功能；只有超级管理员可进入用户管理后台。</p><span class="badge good">${u.role === 'super_admin' ? '超级管理员' : '普通会员'} · 已登录</span></div></div>`;
}
function admin() {
  if (S.session?.role !== 'super_admin') return;
  $('#content').innerHTML =
    `<div class="heading"><div><div class="eyebrow">ADMINISTRATION</div><h1>管理员后台</h1><p class="subtitle">管理用户授权，了解创作使用情况，每次操作都有记录。</p></div><button class="primary" id="new-user">${icon('Plus')} 增加用户</button></div><div class="tabs" role="tablist" aria-label="后台导航">${[
      ['overview', 'Activity', '数据概览'],
      ['users', 'Users', '用户管理'],
      ['logs', 'History', '操作日志'],
    ]
      .map(
        ([v, i, n]) =>
          `<button id="tab-${v}" role="tab" aria-controls="section" aria-selected="${section === v}" tabindex="${section === v ? 0 : -1}" class="${section === v ? 'active' : ''}" data-section="${v}">${icon(i)} ${n}</button>`,
      )
      .join(
        '',
      )}</div><div id="section" role="tabpanel" aria-labelledby="tab-${section}"></div>`;
  $('#new-user').onclick = () => {
    audit('打开新增用户', '会员管理', '打开创建表单');
    editUser();
  };
  document.querySelectorAll('[data-section]').forEach((b) => {
    b.onclick = () => {
      section = b.dataset.section;
      audit(
        '查看后台页面',
        { overview: '数据概览', users: '用户管理', logs: '操作日志' }[section],
        '打开页面',
      );
      admin();
      $(`#tab-${section}`).focus();
    };
    b.onkeydown = (e) => {
      const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      const tabs = [...document.querySelectorAll('[data-section]')],
        i = tabs.indexOf(b),
        next =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? 2
              : (i + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
      tabs[next].click();
    };
  });
  if (section === 'overview') overview();
  else if (section === 'users') usersPage();
  else logsPage();
}
function changeRange(value) {
  period = value;
  from = period === 'today' ? today() : '2026-08-17';
  to = today();
}
function periodSwitch() {
  return `<div class="segmented"><button data-period="today" class="${period === 'today' ? 'active' : ''}">今日</button><button data-period="history" class="${period === 'history' ? 'active' : ''}">历史累计</button></div>`;
}
function statCards(counts) {
  return `<div class="stats">${S.metrics.map((n, i) => `<article class="stat"><header>${period === 'today' ? '当日' : '累计'}${n}${icon(metricIcons[i])}</header><strong>${counts[i].toLocaleString()}</strong><small>${['首次保存的项目创意', '完整故事候选', '完整剧本输出', '入库图片 / 视频 / 音频', '分镜视频文件；成片另标'][i]}</small></article>`).join('')}</div>`;
}
function overview() {
  const members = S.members,
    counts = S.counts(null, from, to),
    values = Array.from({ length: 7 }, (_, i) => {
      let day = S.date(S.now() - (6 - i) * 86400000);
      return { day, value: S.counts(null, day, day)[0] };
    }),
    max = Math.max(1, ...values.map((v) => v.value));
  $('#section').innerHTML =
    `<div class="toolbar"><div><h2>普通会员创作概览</h2><span class="badge">不含管理员</span></div><div><span class="range-caption">${from === to ? from : `${from} 至 ${to}`}</span>${periodSwitch()}</div></div>${statCards(counts)}<div class="split"><section class="panel"><div class="panel-title"><h2>近 7 日创意趋势</h2><small>单位：条 · 与明细同源</small></div><div class="chart" role="img" aria-label="${values.map((v) => `${v.day} ${v.value}条`).join('，')}">${values.map((v) => `<div class="bar-group"><span class="bar-value">${v.value}</span><div class="bar" style="height:${(v.value / max) * 110}px"></div><small>${v.day.slice(5)}</small></div>`).join('')}</div></section><section class="panel"><div class="panel-title"><h2>会员授权情况</h2><small>当前状态</small></div><div class="summary-line"><span>普通会员记录</span><b>${members.length}</b></div><div class="summary-line"><span>授权有效</span><b>${members.filter((u) => S.status(u) === 'active').length}</b></div><div class="summary-line"><span>已到期 / 已封禁</span><b>${members.filter((u) => S.status(u) === 'expired').length} / ${members.filter((u) => S.status(u) === 'banned').length}</b></div><div class="summary-line"><span>今日活跃会员</span><b>${new Set(S.rangeEvents(null, today(), today()).map((e) => e.userId)).size}</b></div></section></div><div class="notice">导出视频：分镜视频 ${counts[4]} 个；最终成片尚未接入。仅计系统成功写出的视频文件，重复打开不计数，剪映草稿/剪辑包不计入。历史保留到期与封禁前的记录。统计从埋点上线起计算，按北京时间归日。</div><section class="panel"><div class="panel-title"><h2>会员使用明细</h2><button class="ghost" id="all-users">查看全部用户 ${icon('ChevronRight')}</button></div><div class="table-wrap"><table><thead><tr><th>用户账号</th><th>状态</th>${S.metrics.map((n) => `<th>${n}</th>`).join('')}<th></th></tr></thead><tbody>${members
      .map(
        (u) =>
          `<tr><td><strong>${esc(u.account)}</strong><small>${esc(u.name)}</small></td><td>${badge(u)}</td>${S.counts(
            u.id,
            from,
            to,
          )
            .map((n) => `<td>${n}</td>`)
            .join(
              '',
            )}<td><button class="ghost" data-detail="${u.id}">使用详情</button></td></tr>`,
      )
      .join('')}</tbody></table></div></section>`;
  document.querySelectorAll('[data-period]').forEach(
    (b) =>
      (b.onclick = () => {
        changeRange(b.dataset.period);
        audit('查询数据概览', '普通会员', `${from} 至 ${to}`);
        overview();
      }),
  );
  $('#all-users').onclick = () => {
    section = 'users';
    audit('查看用户列表', '普通会员', '查看全部');
    admin();
  };
  bindDetails();
}
function pagination(total, current, prefix) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return `<div class="table-footer pagination"><span>共 ${total} 条 · 第 ${current} / ${pages} 页</span><div><button id="${prefix}-prev" ${current <= 1 ? 'disabled' : ''}>上一页</button><button id="${prefix}-next" ${current >= pages ? 'disabled' : ''}>下一页</button></div></div>`;
}
function usersPage() {
  const rows = S.members.filter(
    (u) =>
      (u.account + ' ' + u.name).toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' || S.status(u) === filter),
  );
  userPageNumber = Math.min(
    userPageNumber,
    Math.max(1, Math.ceil(rows.length / pageSize)),
  );
  const visible = rows.slice(
    (userPageNumber - 1) * pageSize,
    userPageNumber * pageSize,
  );
  $('#section').innerHTML =
    `<div class="toolbar"><div><label class="sr-only" for="search">搜索账号或备注名</label><input id="search" placeholder="搜索账号 / 备注名" value="${esc(search)}"><label class="sr-only" for="filter">授权状态</label><select id="filter"><option value="all">全部状态</option><option value="active">授权有效</option><option value="expired">已到期</option><option value="banned">已封禁</option></select><button id="do-search">${icon('Search')} 查询</button></div><small>共 ${S.members.length} 位会员 · 不删除用户记录</small></div><div class="panel"><div class="table-wrap"><table><thead><tr><th>用户</th><th>授权状态</th><th>授权到期时间</th><th>最近创作活动</th><th>操作</th></tr></thead><tbody>${visible.length ? visible.map((u) => `<tr><td><strong>${esc(u.account)}</strong><small>${esc(u.name)} · ${u.id}</small></td><td>${badge(u)}</td><td>${fmt(u.until)}<small>北京时间</small></td><td>${fmt(S.latest(u))}</td><td><div class="table-actions"><button data-detail="${u.id}">使用详情</button><button data-edit="${u.id}">调整授权</button><button class="${u.banned ? '' : 'danger'}" data-ban="${u.id}">${u.banned ? '恢复' : '封禁'}</button></div></td></tr>`).join('') : '<tr><td class="empty" colspan="5">没有匹配的用户，请调整筛选条件。</td></tr>'}</tbody></table></div>${pagination(rows.length, userPageNumber, 'users')}</div>`;
  $('#filter').value = filter;
  $('#do-search').onclick = () => {
    search = $('#search').value;
    filter = $('#filter').value;
    userPageNumber = 1;
    audit(
      '查询用户',
      '普通会员',
      `${search || '全部账号'} / ${{ all: '全部状态', ...labels }[filter]}`,
    );
    usersPage();
  };
  $('#search').onkeydown = (e) => {
    if (e.key === 'Enter') $('#do-search').click();
  };
  $('#filter').onchange = () => $('#do-search').click();
  $('#users-prev').onclick = () => {
    userPageNumber--;
    audit('用户列表翻页', '普通会员', `第${userPageNumber}页`);
    usersPage();
  };
  $('#users-next').onclick = () => {
    userPageNumber++;
    audit('用户列表翻页', '普通会员', `第${userPageNumber}页`);
    usersPage();
  };
  bindDetails();
  document.querySelectorAll('[data-edit]').forEach(
    (b) =>
      (b.onclick = () => {
        const u = S.members.find((u) => u.id === b.dataset.edit);
        audit('查看授权', u.account, '打开授权表单');
        editUser(u);
      }),
  );
  document
    .querySelectorAll('[data-ban]')
    .forEach(
      (b) =>
        (b.onclick = () =>
          banUser(S.members.find((u) => u.id === b.dataset.ban))),
    );
}
function bindDetails() {
  document.querySelectorAll('[data-detail]').forEach(
    (b) =>
      (b.onclick = () => {
        detailPeriod = 'today';
        detailFrom = today();
        detailTo = today();
        detailPage = 1;
        const u = S.members.find((u) => u.id === b.dataset.detail);
        audit('查看使用情况', u.account, '今日');
        detail(u);
      }),
  );
}
function detail(u) {
  const counts = S.counts(u.id, detailFrom, detailTo),
    rows = S.rangeEvents(u.id, detailFrom, detailTo).sort(
      (a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id),
    );
  detailPage = Math.min(
    detailPage,
    Math.max(1, Math.ceil(rows.length / pageSize)),
  );
  showModal(
    '用户使用详情',
    `<div class="dialog-body"><div class="detail-meta"><h2>${esc(u.account)}</h2>${badge(u)}</div><p class="help">${esc(u.name)} · ${u.id} · 授权至 ${fmt(u.until)}</p><div class="toolbar detail-tabs"><div class="segmented"><button data-detail-period="today" class="${detailPeriod === 'today' ? 'active' : ''}">今日</button><button data-detail-period="history" class="${detailPeriod === 'history' ? 'active' : ''}">历史累计</button></div><small>北京时间 · 仅普通会员事件</small></div><form id="detail-range" class="date-range"><label>开始日期<input name="from" type="date" required value="${detailFrom}"></label><label>结束日期<input name="to" type="date" required value="${detailTo}" max="${today()}"></label><button>查询</button></form><div id="detail-error" role="alert"></div><div class="stats detail-stats">${counts.map((n, i) => `<div class="stat"><header>${S.metrics[i]}</header><strong>${n}</strong></div>`).join('')}</div><div class="notice">视频导出：分镜视频 ${counts[4]} 个；最终成片尚未接入。明细与汇总使用同一组模拟事件；新用户没有历史事件。</div><div class="table-wrap detail-list"><table><thead><tr><th>时间</th><th>事件</th><th>数量</th><th>来源 / 结果</th></tr></thead><tbody>${
      rows.length
        ? rows
            .slice((detailPage - 1) * pageSize, detailPage * pageSize)
            .map(
              (e) =>
                `<tr><td>${fmt(e.at)}</td><td>${e.name}</td><td>${e.quantity}</td><td>${e.source} · ${e.outcome}</td></tr>`,
            )
            .join('')
        : '<tr><td colspan="4" class="empty">所选日期没有使用记录</td></tr>'
    }</tbody></table></div>${pagination(rows.length, detailPage, 'detail')}</div><div class="dialog-footer"><button data-close>关闭</button></div>`,
    true,
  );
  modal.querySelectorAll('[data-detail-period]').forEach(
    (b) =>
      (b.onclick = () => {
        detailPeriod = b.dataset.detailPeriod;
        detailFrom = detailPeriod === 'today' ? today() : '2026-08-17';
        detailTo = today();
        detailPage = 1;
        audit('查询使用情况', u.account, `${detailFrom} 至 ${detailTo}`);
        detail(u);
      }),
  );
  $('#detail-range').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (f.get('from') > f.get('to')) {
      formError('#detail-error', '开始日期不能晚于结束日期');
      audit('查询使用情况', u.account, '日期范围无效', '输入校验', '失败');
      return;
    }
    detailFrom = f.get('from');
    detailTo = f.get('to');
    detailPeriod = 'range';
    detailPage = 1;
    audit('查询使用情况', u.account, `${detailFrom} 至 ${detailTo}`);
    detail(u);
  };
  $('#detail-prev').onclick = () => {
    detailPage--;
    audit('使用明细翻页', u.account, `第${detailPage}页`);
    detail(u);
  };
  $('#detail-next').onclick = () => {
    detailPage++;
    audit('使用明细翻页', u.account, `第${detailPage}页`);
    detail(u);
  };
}
function editUser(u) {
  showModal(
    u ? '调整用户授权' : '增加用户',
    `<form id="user-form"><div class="dialog-body"><label class="field"><span>用户账号</span><input name="account" required maxlength="64" placeholder="例如 lin.director" value="${u ? esc(u.account) : ''}" ${u ? 'readonly' : ''}></label>${!u ? '<label class="field"><span>登录密钥</span><div class="inline-field"><input name="key" id="new-key" minlength="12" maxlength="128" required placeholder="至少 12 位，或自动生成"><button type="button" id="gen-key">生成</button></div></label><p class="help">仅使用虚构密钥；创建后可用此账号与密钥模拟登录。刷新页面将清除模拟数据。</p><label class="field"><span>备注名（选填）</span><input name="name" maxlength="40" placeholder="便于识别的用户名称"></label>' : ''}<label class="field"><span>授权到期时间 · 北京时间</span><input name="until" type="datetime-local" value="${u ? u.until : S.local(S.now() + 30 * 86400000)}" required></label><div class="quick-days"><span>从现在起：</span>${[7, 30, 90, 365].map((d) => `<button type="button" data-days="${d}">${d} 天</button>`).join('')}</div><p class="help">当前演示时间：${S.local(S.now()).replace('T', ' ')}。到达设定时间即失效。${u?.banned ? '调整期限不会自动解除封禁。' : ''}</p><label class="field"><span>操作原因</span><textarea name="reason" rows="2" maxlength="200" placeholder="例如：开通授权 / 续期 30 天" required></textarea></label><div id="form-error" role="alert"></div></div><div class="dialog-footer"><button type="button" data-close>取消</button><button class="primary" type="submit">${u ? '保存授权' : '创建用户'}</button></div></form>`,
  );
  if (!u)
    $('#gen-key').onclick = () => {
      $('#new-key').value =
        'DEMO-' +
        Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
          n.toString(16).padStart(2, '0'),
        ).join('');
      audit('生成模拟密钥', '新用户', '生成新密钥（内容不记录）');
    };
  modal.querySelectorAll('[data-days]').forEach(
    (b) =>
      (b.onclick = () => {
        modal.querySelector('[name=until]').value = S.local(
          S.now() + Number(b.dataset.days) * 86400000,
        );
      }),
  );
  $('#user-form').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      if (u) S.change(u, { until: f.get('until'), reason: f.get('reason') });
      else S.create(Object.fromEntries(f));
      close();
      section = 'users';
      search = '';
      filter = 'all';
      userPageNumber = 1;
      admin();
      toast(
        u
          ? '授权已更新，登录校验同步生效。'
          : '模拟用户已创建，可退出并用新账号与密钥登录。',
      );
    } catch (err) {
      formError('#form-error', err.message);
    }
  };
}
function banUser(u) {
  const restoring = u.banned;
  showModal(
    restoring ? '恢复用户权限' : '封禁用户权限',
    `<form id="ban-form"><div class="dialog-body"><div class="notice">用户：${esc(u.account)}<br>${restoring ? '恢复只解除封禁；已到期的账号仍无法登录。' : '封禁后此账号将无法登录；记录及已有使用量保留。'}</div><label class="field"><span>操作原因</span><textarea name="reason" required maxlength="200" rows="3" placeholder="请填写原因，便于后续追溯"></textarea></label><div id="ban-error" role="alert"></div></div><div class="dialog-footer"><button type="button" data-close>取消</button><button type="submit" class="${restoring ? 'primary' : 'danger'}">确认${restoring ? '恢复' : '封禁'}</button></div></form>`,
  );
  $('#ban-form').onsubmit = (e) => {
    e.preventDefault();
    try {
      S.change(u, {
        banned: !restoring,
        reason: new FormData(e.target).get('reason'),
      });
      close();
      admin();
      toast('操作成功，已记录日志并影响后续登录。');
    } catch (err) {
      formError('#ban-error', err.message);
    }
  };
}
let logFilters = { query: '', action: 'all', from: '', to: '' },
  logPageNumber = 1,
  logSnapshot = [];
function logsPage() {
  logSnapshot = [...S.logs];
  const actions = [...new Set(S.logs.map((l) => l.action))];
  $('#section').innerHTML =
    `<div class="toolbar"><div><h2>管理员操作记录</h2><span class="badge">仅可查看</span></div></div><form id="log-form" class="log-filters"><label>操作对象 / 操作者<input name="query" placeholder="搜索账号" value="${esc(logFilters.query)}"></label><label>操作类型<select name="action"><option value="all">全部操作</option>${actions.map((a) => `<option ${a === logFilters.action ? 'selected' : ''}>${a}</option>`).join('')}</select></label><label>开始日期<input name="from" type="date" value="${logFilters.from}"></label><label>结束日期<input name="to" type="date" value="${logFilters.to}"></label><button>查询</button></form><div id="log-error" role="alert"></div><div class="notice">记录操作者、对象、变更前后、原因和结果。密钥不会写入日志；没有修改、删除入口。翻页使用本次查询快照，点击查询可更新记录。</div><div class="panel"><div class="table-wrap"><table><thead><tr><th>时间 / 记录 ID</th><th>操作者 / 动作</th><th>对象</th><th>内容 / 原因</th><th>结果</th></tr></thead><tbody id="log-rows"></tbody></table></div><div id="log-pages"></div></div>`;
  $('#log-form').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.from && f.to && f.from > f.to) {
      audit('查询操作日志', '审计', '日期范围无效', '输入校验', '失败');
      formError('#log-error', '开始日期不能晚于结束日期');
      return;
    }
    logFilters = f;
    logPageNumber = 1;
    audit(
      '查询操作日志',
      '审计',
      `${f.query || '全部对象'} / ${f.action === 'all' ? '全部操作' : f.action} / ${f.from || '最早记录'} 至 ${f.to || '最新记录'}`,
    );
    logSnapshot = [...S.logs];
    drawLogs();
  };
  drawLogs();
}
function drawLogs() {
  const f = logFilters,
    rows = logSnapshot.filter(
      (l) =>
        (!f.query ||
          `${l.target} ${l.actor}`
            .toLowerCase()
            .includes(f.query.toLowerCase())) &&
        (f.action === 'all' || l.action === f.action) &&
        (!f.from || l.at.slice(0, 10) >= f.from) &&
        (!f.to || l.at.slice(0, 10) <= f.to),
    );
  logPageNumber = Math.min(
    logPageNumber,
    Math.max(1, Math.ceil(rows.length / pageSize)),
  );
  $('#log-rows').innerHTML = rows.length
    ? rows
        .slice((logPageNumber - 1) * pageSize, logPageNumber * pageSize)
        .map(
          (l) =>
            `<tr><td>${l.at}<small>${l.id}</small></td><td><strong>${l.actor}</strong><small>${l.actorId} · ${l.action}</small></td><td>${esc(l.target)}</td><td class="log-diff">${esc(l.change)}<small>原因：${esc(l.reason)}</small></td><td><span class="badge ${l.outcome === '成功' ? 'good' : 'bad'}">${l.outcome}</span></td></tr>`,
        )
        .join('')
    : '<tr><td colspan="5" class="empty">没有匹配的操作记录。</td></tr>';
  $('#log-pages').innerHTML = pagination(rows.length, logPageNumber, 'logs');
  $('#logs-prev').onclick = () => {
    logPageNumber--;
    audit('操作日志翻页', '审计', `第${logPageNumber}页`);
    drawLogs();
  };
  $('#logs-next').onclick = () => {
    logPageNumber++;
    audit('操作日志翻页', '审计', `第${logPageNumber}页`);
    drawLogs();
  };
}
function syncReviewer() {
  if (!review) return;
  $('#preview').value = !S.session
    ? 'login'
    : S.session.role === 'super_admin'
      ? 'admin'
      : 'member';
}
if (review) {
  $('#review-controls').innerHTML =
    '<label class="sr-only" for="preview">评审场景</label><select id="preview"><option value="login">登录流程</option><option value="admin">后台布局预览</option><option value="member">会员布局预览</option></select>';
  $('#preview').onchange = (e) => {
    close();
    S.logout();
    notice = '';
    if (e.target.value !== 'login') {
      S.login(e.target.value === 'admin' ? 'admin' : 'member', 'demo-key-2026');
      page = e.target.value === 'admin' ? '管理员后台' : '创作工作台';
      section = 'overview';
      audit('访问页面', page, '评审布局');
    }
    render();
  };
}
function theme() {
  const dark = document.documentElement.classList.contains('dark');
  $('#theme').innerHTML = icon(dark ? 'Sun' : 'Moon');
  $('#theme').setAttribute(
    'aria-label',
    dark ? '切换浅色主题' : '切换深色主题',
  );
}
$('#theme').onclick = () => {
  document.documentElement.classList.toggle('dark');
  theme();
  audit(
    '切换主题',
    '界面',
    document.documentElement.classList.contains('dark') ? '深色' : '浅色',
  );
};
if (params.get('theme') === 'dark')
  document.documentElement.classList.add('dark');
if (review && ['admin', 'member'].includes(params.get('view'))) {
  S.login(params.get('view'), 'demo-key-2026');
  page = params.get('view') === 'admin' ? '管理员后台' : '创作工作台';
  audit('访问页面', page, '评审布局');
}
theme();
render();
setInterval(() => {
  if (S.session && S.status(S.session) !== 'active') render();
}, 1000);
