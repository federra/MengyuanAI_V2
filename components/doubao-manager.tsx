'use client';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import {
  doubaoCommand,
  type DoubaoSnapshot,
  type DoubaoAccount,
  type DoubaoSettings,
} from '@/lib/doubao-manager';
import { useDoubaoTaskPreview } from './doubao-task-preview';
import { DoubaoTaskRecords } from './doubao-task-records';
import { download } from '@/lib/export';
import type { Project } from '@/lib/studio';
export function DoubaoManager({
  project,
  shotIds,
}: {
  project: Project;
  shotIds: string[];
}) {
  const [data, setData] = useState<DoubaoSnapshot>();
  const [tab, setTab] = useState('账号');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState('全部分组');
  const [edit, setEdit] = useState<Partial<DoubaoAccount>>();
  const [settings, setSettings] = useState<DoubaoSettings>();
  const [pair, setPair] = useState('');
  const [message, setMessage] = useState('');
  const taskPreview = useDoubaoTaskPreview(state => {setData(state);setTab('任务');setMessage('已确认并加入豆包队列，结果返回对应分镜。');});
  async function run(action: string, body?: unknown) {
    if (action === 'regenerate') {
      try {await taskPreview.open(project, [], {retryId:(body as {id:string}).id, saved:true});}
      catch(e) {setError((e as Error).message);}
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await doubaoCommand(action, body);
      setData(next);
      if(next.operationReport){const r=next.operationReport;setMessage(`已打开 ${r.opened} 个账号，跳过 ${r.skipped.length} 个，失败 ${r.failed.length} 个。${[...r.skipped,...r.failed].join('；')}`);}
      return next;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await doubaoCommand();
        if (!disposed) setData(next);
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      }
      if (!disposed) timer = setTimeout(poll, 4000);
    };
    const refresh = () => void doubaoCommand().then(next => { if (!disposed) setData(next); }).catch(() => {});
    window.addEventListener('director-doubao-change', refresh);
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener('director-doubao-change', refresh);
    };
  }, []);
  if (!data) return <output>{error || '正在连接本机豆包管理服务…'}</output>;
  const selected = data.accounts.filter(a => a.enabled && data.participatingAccountIds?.includes(a.id)).map(a => a.id);
  const groups = [...new Set(data.accounts.map((a) => a.group))];
  const shown = data.accounts.filter(
    (a) => group === '全部分组' || a.group === group,
  );
  async function queue() {
    setBusy(true);
    setError('');
    try {
      await taskPreview.open(project, shotIds, {group,onGroupSelected:setGroup});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const s = settings || data.settings;
  return (
    <section className="doubao-manager">
      {taskPreview.dialog}
      <nav className="doubao-tabs" aria-label="豆包管理">
        <div>
          {['账号', '任务', '生成设置', 'Helper'].map((x) => (
            <Button
              key={x}
              variant={tab === x ? 'default' : 'outline'}
              onClick={() => setTab(x)}
            >
              {x}
            </Button>
          ))}
        </div>
        <span className="tag">
          浏览器助手 · {data.accounts.filter((a) => a.connected).length}{' '}
          个在线
        </span>
      </nav>
      <details className="doubao-connect-help"><summary>连接帮助 · 自动安装 / 故障排查</summary>
        <p className="helper">桌面程序 0.1.31 起，点击“打开登录”会自动加载豆包助手并连接账号。本人完成登录即可，无需手动安装或复制连接码。</p>
      <div className="actions">
        <Button
          variant="outline"
          onClick={() =>
            void window.directorDesktop
              ?.openDoubaoExtension?.()
              .catch((e) => setError(e.message))
          }
        >
          打开 Chrome 插件目录
        </Button>
        <a className="tag" href="/doubao-extension.zip" download>
          下载插件 {data.helper.version}
        </a>
        <span className="helper">
          升级后关闭对应账号的旧窗口，再点击“打开登录”。下方手动安装仅供故障排查。
        </span>
      </div>
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <output>{message}</output>}
      {tab === '账号' && (
        <>
          <div className="actions">
            <Button
              onClick={() =>
                setEdit({
                  name: '',
                  group: group === '全部分组' ? '默认分组' : group,
                  enabled: true,
                  dailyLimit: null,
                })
              }
            >
              新增账号
            </Button>
            <label>
              分组{' '}
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                {['全部分组', ...groups].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <Button
              variant="outline"
              disabled={busy || !shown.some(a=>selected.includes(a.id))}
              onClick={() => void run('openAvailable', { ids: shown.filter(a=>selected.includes(a.id)).map(a=>a.id) })}
            >
              批量打开可用账号（{shown.filter(a=>selected.includes(a.id)&&!a.openSkipReason).length}）
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void doubaoCommand('backup')
                  .then((b) =>
                    download(
                      '豆包账号备份.json',
                      JSON.stringify(b),
                      'application/json',
                    ),
                  )
                  .catch((e) => setError(e.message))
              }
            >
              备份账号
            </Button>
            <label className="tag">
              恢复账号
              <input
                type="file"
                accept=".json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    if (f.size > 2000000) throw Error('账号备份文件过大');
                    await run('restore', JSON.parse(await f.text()));
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
            </label>
          </div>
          <p className="helper">
            勾选账号“调用”，回到分镜选择豆包并点击生成，软件会自动打开账号浏览器、设置参数、上传参考图和提示词。仅遇到登录或滑块时需要你操作，完成后自动继续。昵称检测可选，不影响生成。用量为本工具记录。
          </p>
          <p className="helper">勾选“调用”后，该账号参与任务；取消后停止接收新任务，已提交任务继续接收结果。设置立即保存，关闭弹窗或重启软件仍保留。分镜生成只使用已勾选“调用”的账号；当前选择 {selected.length} 个。</p>
          <p className="helper">批量打开仅处理当前分组，跳过原任务未结束、登录检测中和额度不足的账号。浏览器打开后仍需确认登录与页面空闲，才会分配新任务。</p>
          {data.paused && <output>豆包任务已暂停，等待任务已暂停，恢复后继续；已提交任务继续接收结果。请到“任务”页恢复。</output>}
          {edit && (
            <div className="doubao-edit">
              <label>
                账号名称
                <input
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </label>
              <label>
                分组
                <input
                  list="doubao-groups"
                  value={edit.group}
                  onChange={(e) => setEdit({ ...edit, group: e.target.value })}
                />
                <datalist id="doubao-groups">
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </datalist>
              </label>
              <label>
                每日提交上限（留空不设）
                <input
                  type="number"
                  min="0"
                  value={edit.dailyLimit ?? ''}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      dailyLimit:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <div className="actions">
                <Button
                  disabled={busy}
                  onClick={async () => {
                    if (await run('account', edit)) setEdit(undefined);
                  }}
                >
                  保存账号
                </Button>
                <Button variant="outline" onClick={() => setEdit(undefined)}>
                  取消
                </Button>
              </div>
            </div>
          )}
          <div className="doubao-account-table">
            <table>
              <thead>
                <tr>
                  <th scope="col" className="doubao-account-serial" title="固定账号序号，不随分组筛选变化">序号</th>
                  <th>账号 / 分组</th>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="设置当前分组账号调用"
                      checked={
                        !!shown.length &&
                        shown.every((a) => selected.includes(a.id))
                      }
                      disabled={busy}
                      onChange={(e) => void run('participation', { ids: shown.map(a => a.id), selected: e.target.checked })}
                    /> 调用
                  </th>
                  <th>登录与连接</th>
                  <th>今日视频</th>
                  <th>积分 / 剩余次数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id}>
                    <td className="doubao-account-serial">{a.serial ? String(a.serial).padStart(3, '0') : '—'}</td>
                    <td>
                      <strong>豆包{String(a.serial || '').padStart(3, '0')} · {a.name}</strong>
                      <small>昵称：{a.nickname || '待检测'}</small>
                      <small>{a.group}</small>
                      <small>{a.openSkipReason || '可打开；接单前检测登录与空闲'}</small>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${a.name}调用`}
                        checked={selected.includes(a.id)}
                        disabled={busy}
                        onChange={(e) => void run('participation', { ids: [a.id], selected: e.target.checked })}
                      />
                    </td>
                    <td>
                      <small>{a.loginCheck?.status === 'pending' ? a.loginCheck.waitingFor === 'login' ? '请在浏览器登录' : a.loginCheck.waitingFor === 'verification' ? '请在浏览器完成验证' : '正在读取左下角昵称…' : a.loginStatus}</small>
                      {a.loginCheckedAt && <small>检测于 {new Date(a.loginCheckedAt).toLocaleString()}</small>}
                      {a.loginCheck?.message && <small>{a.loginCheck.message}</small>}
                      <strong>{a.extensionSetup?.status === 'verified' ? `扩展已自动配置${a.extensionSetup.version ? ` · ${a.extensionSetup.version}` : ''}` : a.extensionSetup?.status === 'failed' ? '扩展启动失败' : '扩展待核验'}</strong>
                      {a.extensionSetup?.message && <small>{a.extensionSetup.message}</small>}
                      {!a.extensionSetup && <small>点击“打开登录”，自动安装并核验。</small>}
                      <span title="这里表示浏览器助手与工作台的通信状态，和豆包账号是否登录分别检测。">{a.connected ? '浏览器助手在线' : '浏览器助手离线'}</span>
                      {a.connected && <small>实际运行版本：{a.executionBuild || '等待浏览器回报'}</small>}
                      {a.connected && a.executionBuild && data.helper.version && a.executionBuild !== data.helper.version && <small className="error">{a.extensionUpdateMessage || (a.today.active ? '新版助手已就绪，原任务结束后自动更新。' : '检测到新版助手，页面空闲后自动更新。')}</small>}
                      {!a.connected && <small>浏览器关闭后会离线，不代表账号已退出登录。点击“打开登录”可重新连接。</small>}
                      <small>{a.today.active ? '原任务仍占用账号' : a.runtimeState === 'idle' && a.connected ? '页面空闲已检测' : a.runtimeState === 'busy' && a.connected ? '页面有任务运行' : a.connected ? '等待页面空闲确认' : '连接后再检测页面是否空闲'}</small>
                    </td>
                    <td>
                      <strong>
                        {a.today.completed} 完成 / {a.today.submitted} 提交
                      </strong>
                      <small>
                        {a.today.failed} 失败或待处理 · 上限{' '}
                        {a.dailyLimit ?? '未设置'}
                      </small>
                    </td>
                    <td>
                      <strong>
                        {a.points ?? '未知'} / {a.remaining ?? '未知'}
                      </strong>
                      <small>
                        {a.balanceSource || '尚未读取'}
                        {a.balanceAt
                          ? ' · ' + new Date(a.balanceAt).toLocaleString()
                          : ''}
                      </small>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          const points = window.prompt(
                            '记录豆包页面显示的积分（留空为未知）',
                            a.points == null ? '' : String(a.points),
                          );
                          if (points === null) return;
                          const remaining = window.prompt(
                            '剩余视频次数（留空为未知）',
                            a.remaining == null ? '' : String(a.remaining),
                          );
                          if (remaining !== null)
                            void run('balance', {
                              id: a.id,
                              points,
                              remaining,
                            });
                        }}
                      >
                        记录积分
                      </Button>
                    </td>
                    <td aria-label="账号操作">
                      <div className="doubao-row-actions">
                        <Button
                          variant="outline"
                          onClick={() => void run('open', { ids: [a.id] })}
                        >
                          打开登录
                        </Button>
                        <Button variant="outline" disabled={busy} onClick={()=>void run('open',{ids:[a.id],viewExtensions:true})}>查看账号扩展</Button>
                        <details><summary>连接帮助</summary>                        <Button
                          variant="outline"
                          onClick={() =>
                            void doubaoCommand('pair', { id: a.id })
                              .then((p) => setPair(JSON.stringify(p)))
                              .catch((e) => setError(e.message))
                          }
                        >
                          手动连接码（备用）
                        </Button></details>
                        <Button variant="outline" disabled={busy || a.loginCheck?.status === 'pending'} onClick={() => void run('checkLogin', {id:a.id})}>{a.loginCheck?.status === 'pending' ? '检测中…' : '检测登录'}</Button>
                        <Button variant="ghost" onClick={() => setEdit(a)}>
                          编辑
                        </Button>
                        <Button variant="ghost" disabled={busy || a.today.active > 0} title={a.today.active ? '请先处理该账号的原任务' : '删除账号，保留历史视频记录'} onClick={() => {if(window.confirm(`删除豆包${a.serial}「${a.name}」？将取消此账号的参与设置和连接，保留历史视频与本地登录目录。`)) void run('deleteAccount', {id:a.id});}}>删除账号</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length && (
              <p>添加账号后点击“打开登录”，在独立 Chrome 窗口完成登录。</p>
            )}
          </div>
          {pair && (
            <div className="doubao-edit">
              <p>
                在对应账号 Chrome 插件的“连接本机
                Helper”中粘贴。连接码仅允许访问此账号任务，勿发给他人。重启后若端口变化请重新复制。
              </p>
              <textarea
                readOnly
                value={pair}
                rows={3}
                aria-label="当前账号连接码"
              />
              <div className="actions">
                <Button
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(pair)
                      .then(() => setMessage('账号连接码已复制'))
                      .catch(() => setError('请手动复制连接码'))
                  }
                >
                  复制连接码
                </Button>
                <Button variant="outline" onClick={() => setPair('')}>
                  收起
                </Button>
              </div>
            </div>
          )}
          <Button
            disabled={busy || data.paused || !shotIds.length}
            onClick={() => void queue()}
          >
            {data.paused ? '豆包任务已暂停' : `自动生成 ${shotIds.length} 个分镜视频`}
          </Button>
        </>
      )}
      {tab === '任务' && (
        <>
          <div className="actions">
            <Button onClick={() => void run('pause', { paused: !data.paused })}>
              {data.paused ? '恢复任务' : '暂停任务'}
            </Button>
            <span>
              并发 {data.settings.concurrency} · 每个账号同时处理一个任务
            </span>
          </div>
          <p className="helper">
            提交由插件确认匹配的生成请求后记录；超时不自动重复提交。完成后下载原始视频并回填原分镜。关闭此弹窗可继续工作，请保持桌面版和对应
            Chrome 打开。
          </p>
          <DoubaoTaskRecords data={data} onCommand={run} />
        </>
      )}
      {tab === '生成设置' && (
        <>
          <div className="doubao-settings-grid">
            {(
              [
                ['timeoutMinutes', '结果未确认提醒（分钟）'],
                ['concurrency', '同时运行账号数'],
                ['duration', '默认视频秒数'],

                ['model', '模型名称（按页面选项）'],
                ['ratio', '画幅'],
                ['resolution', '清晰度（留空沿用页面）'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  value={s[key]}
                  type={
                    ['timeoutMinutes', 'concurrency', 'duration'].includes(key)
                      ? 'number'
                      : 'text'
                  }
                  onChange={(e) =>
                    setSettings({
                      ...s,
                      [key]: [
                        'timeoutMinutes',
                        'concurrency',
                        'duration',
                      ].includes(key)
                        ? Number(e.target.value)
                        : e.target.value,
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p className="helper">
            先进入 AI 创作 → 视频 → 模型 → 比例与时长。分镜模型、时长、画幅优先，未填写的使用插件默认设置。插件只选择豆包页面现有选项；不能匹配时停止，避免错误参数提交。
          </p>
          <label>
            <input
              type="checkbox"
              checked={s.autoSubmit}
              onChange={(e) =>
                setSettings({ ...s, autoSubmit: e.target.checked })
              }
            />{' '}
            自动提交已准备任务（分镜“生成”按钮会自动启动全流程）
          </label>
          <details>
            <summary>高级页面适配与余额读取</summary>
            <label><input type="checkbox" checked={s.automaticPage!==false} onChange={e=>setSettings({...s,automaticPage:e.target.checked})} /> 自动识别豆包创作页面（推荐，无需填写选择器）</label>
            <p>
              默认自动识别输入框、图片附件和发送按钮；下方选择器仅在关闭自动识别后生效，供页面变化时排查。积分读取只读取指定元素的数字。
            </p>
            <div className="doubao-settings-grid">
              {(
                [
                  ['promptSelector', '提示词输入框'],
                  ['uploadSelector', '参考图上传控件'],
                  [
                    'uploadReadySelector',
                    '已上传成功的参考图元素（自动提交必填）',
                  ],
                  ['submitSelector', '生成按钮'],
                  ['runningSelector', '任务运行中标记（轮询必填）'],
                  ['idleSelector', '已空闲标记（轮询必填，不能使用始终显示的元素）'],
                  ['resultSelector', '当前任务结果区域（用于失败检测）'],
                  ['nicknameSelector', '账号昵称元素（无法自动识别时填写）'],
                  ['pointsSelector', '积分元素'],
                  ['remainingSelector', '剩余次数元素'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={s[key]}
                    onChange={(e) =>
                      setSettings({ ...s, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          <label>
            失败关键词（每行一个，仅匹配当前任务结果区域）
            <textarea
              rows={6}
              value={s.failureKeywords.join('\n')}
              onChange={(e) =>
                setSettings({
                  ...s,
                  failureKeywords: e.target.value.split('\n'),
                })
              }
            />
          </label>
          <Button
            disabled={busy}
            onClick={async () => {
              if (await run('settings', s)) {
                setSettings(undefined);
                setMessage(
                  '设置已保存，超时立即生效；生成参数用于新加入的任务。',
                );
              }
            }}
          >
            保存设置
          </Button>
        </>
      )}
      {tab === 'Helper' && (
        <>
          <div className="actions">
            <Button variant="outline" disabled={busy} onClick={() => void run('chrome-select')}>选择 Chrome 程序</Button>
            <Button variant="outline" disabled={busy} onClick={() => void run('chrome-auto')}>恢复自动查找</Button>
          </div>
          <p>自动识别失败时，选择安装目录里的 chrome.exe（Mac 选择 Google Chrome.app）。路径保存在本机；已打开的账号窗口不受影响，新路径用于下次启动浏览器。</p>
          <dl className="doubao-helper">
            {Object.entries({
              版本: data.helper.version,
              进程PID: data.helper.pid,
              监听地址: `${data.helper.address}:${data.helper.port}`,
              启动时间: new Date(data.helper.startedAt).toLocaleString(),
              Chrome: data.helper.chrome || '未检测到',
              数据目录: data.helper.root,
              数据库: data.helper.database,
            }).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p>
            账号备份仅包含名称、分组和用量配置，不包含 Chrome
            Cookie、登录凭据、连接令牌和历史任务。恢复会添加新账号，需重新登录。
          </p>
        </>
      )}
    </section>
  );
}
