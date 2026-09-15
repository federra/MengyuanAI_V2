const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { openChrome, findChrome } = require('./doubao-chrome.cjs');
// Source checkout and packaged desktop use the same manifest as their helper.
const sourceManifest = path.join(__dirname, '../browser-extension/manifest.json');
const EXTENSION_VERSION = require(require('node:fs').existsSync(sourceManifest) ? sourceManifest : './doubao-extension/manifest.json').version;
const ACTIVE = ['prepared', 'submitted', 'downloading'];
const holdsAccount = j => ACTIVE.includes(j.status) || (j.status === 'attention' && !j.terminalAt);
const pendingVideo = j => j.status === 'submitted' && !!j.generationAcceptedAt && !!j.requestId;
// Keep unresolved jobs for result routing; release only their scheduling slot
// three minutes after the original submission, including across restarts.
const slotReleased = j => holdsAccount(j) && Number.isFinite(Date.parse(j.submittedAt)) && Date.now() - Date.parse(j.submittedAt) >= 3 * 60000;
const blocksSubmission = j => holdsAccount(j) && !slotReleased(j);
const recoverable = j => ['submitted','attention'].includes(j.status) && !!j.requestId && !!j.submittedAt && !j.retryJobId && !j.terminalAt;
const conversation = value => { try { const u=new URL(value); return ['https://www.doubao.com','https://doubao.com'].includes(u.origin)&&/^\/chat\/\d+$/.test(u.pathname)?u.href:''; } catch { return ''; } };
const freshIdle = a => a.runtimeState === 'idle' && a.idleSamples >= 2 && Date.now() - (a.runtimeAt || 0) < 45000;
const day = (time = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
const DEFAULTS = { timeoutMinutes: 20, concurrency: 2, automaticPage: true, autoSubmit: true, mode: '视频', model: 'Seedance 2.0 Mini', ratio: '16:9', duration: 10, resolution: '', promptSelector: '', uploadReadySelector: '', uploadSelector: 'input[type="file"]', submitSelector: '', resultSelector: '', pointsSelector: '', remainingSelector: '', runningSelector: '', idleSelector: '', nicknameSelector: '', failureKeywords: ['生成失败','生成错误','视频生成失败','生成异常','肖像保护','不支持','无法生成','网络异常','服务器繁忙','服务异常','内容违规','违规','审核失败','余额不足','次数不足','额度不足','包含侵权','免费次数用完了'] };
function clean(value, max = 150) { return String(value ?? '').trim().slice(0, max); }
function nonnegative(value) { if (value === '' || value == null) return null; const n = Number(value); if (!Number.isFinite(n) || n < 0) throw Error('次数或积分需为非负数'); return n; }
function allowedMedia(value, officialAiRemoved = false) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) throw Error('结果地址必须是可信 HTTPS 素材地址');
  if (!['doubao.com','byteimg.com','byteimg.cn','ibyteimg.com','doubaocdn.com','bytecdn.cn','bytecdn.com','bytegecko.com','volces.com','volccdn.com','douyinvod.com','bytedance.net','ibytedtos.com'].some(h => u.hostname === h || u.hostname.endsWith('.' + h))) throw Error('未识别此素材域名，请从豆包手动下载');
  // Do not rename CDN presets: a renamed URL can return identical marked bytes.
  const href=u.href;
  const preset=new URL(href).searchParams.get('lr')||'';
  if(/watermark/i.test(preset)&&preset!=='video_gen_no_watermark'&&!(officialAiRemoved&&preset==='video_gen_watermark_unpaid')||['watermark','water_mark','wm'].some(k=>['1','true'].includes(u.searchParams.get(k)?.toLowerCase())))throw Error('返回地址仍标记为带水印，保留原任务，请重新获取原始视频');
  return href;
}
class DoubaoManager {
  constructor({ root, backend, notify = () => {}, launch = openChrome, fetchMedia = fetch, authorize = async()=>{}, log = async()=>{} }) {
    this.log = log; this.authorize=authorize;
    this.root = root; this.backend = backend; this.notify = notify; this.launch = launch; this.fetchMedia = fetchMedia;
    this.state = { version: 2, accounts: [], participatingAccountIds: [], jobs: [], settings: { ...DEFAULTS }, paused: false };
    this.writes = Promise.resolve(); this.downloading = new Set(); this.incoming = Promise.resolve(); this.loginTickets = new Map();
    this.stopping = false; this.downloadAbort = new AbortController(); this.downloadJobs = new Set();
  }
  async start() {
    await fs.mkdir(this.root, { recursive: true });
    try { const old = JSON.parse(await fs.readFile(path.join(this.root, 'manager.json'), 'utf8')); if (old.version !== 2 || !Array.isArray(old.accounts) || !Array.isArray(old.jobs)) throw Error('豆包数据库格式无效'); this.state = { ...old, participatingAccountIds: Array.isArray(old.participatingAccountIds) ? old.participatingAccountIds.filter(id => old.accounts.some(a => a.id === id)) : [], settings: { ...DEFAULTS, ...old.settings } }; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    for (const job of this.state.jobs) {
      if (this.state.paused && job.status === 'queued') job.status = 'paused';
    }
    this.state.accountSequence = Math.max(this.state.accountSequence || 0, ...this.state.accounts.map(a => a.serial || 0));
    for (const a of this.state.accounts) { if (!a.serial) a.serial = ++this.state.accountSequence; a.closingCheckId = ''; if(a.loginCheck?.status === 'pending') a.loginCheck.status = 'interrupted'; a.runtimeState = 'unknown'; a.executionBuild='';a.extensionUpdating=false; a.creationReady=false; a.idleSamples = 0; a.runtimeAt = 0; }
    for (const job of this.state.jobs) if (ACTIVE.includes(job.status) && !pendingVideo(job)) { job.status = 'attention'; job.error = '工作台重启，请核对豆包任务后手动重新获取，避免重复提交'; }
    this.server = http.createServer((req, res) => this.handle(req, res));
    const listen = port => new Promise((resolve,reject)=>{const fail=e=>reject(e);this.server.once('error',fail);this.server.listen(port,'127.0.0.1',()=>{this.server.removeListener('error',fail);resolve();});});
    try { await listen(this.state.port || 0); } catch(e) { if(e.code!=='EADDRINUSE')throw e;await listen(0); }
    this.port = this.server.address().port; this.state.port = this.port; this.startedAt = new Date().toISOString();
    this.timer = setInterval(() => {void this.expire().catch(() => {});this.requestWake();this.requestExtensionUpdates();}, 5000); this.timer.unref();
    await this.save(); return this;
  }
  async stop() {
    if(this.stopPromise) return this.stopPromise;
    this.stopping = true; clearInterval(this.timer); this.downloadAbort.abort();
    this.stopPromise = (async()=>{
      if (this.server) await new Promise(resolve=>{
        const deadline=setTimeout(()=>this.server.closeAllConnections(),1000);
        this.server.close(()=>{clearTimeout(deadline);resolve();});this.server.closeIdleConnections();
      });
      await this.incoming;
      await Promise.allSettled([...this.downloadJobs]);
      await this.writes;
    })();
    return this.stopPromise;
  }
  save() { const body = JSON.stringify(this.state); const target = path.join(this.root, 'manager.json'); const write = this.writes.then(async () => { await fs.writeFile(target + '.tmp', body, { mode: 0o600 }); await fs.rename(target + '.tmp', target); }); this.writes = write.catch(() => {}); return write; }
  account(id) { const a = this.state.accounts.find(a => a.id === id); if (!a) throw Error('账号不存在'); return a; }
  openSkipReason(a) {
    if (!a.enabled || !this.state.participatingAccountIds.includes(a.id)) return '未勾选调用';
    if (this.state.jobs.some(j => j.accountId === a.id && blocksSubmission(j))) return '原任务尚未结束';
    if (a.loginCheck?.status === 'pending' || a.closingCheckId) return '正在检测登录或关闭窗口';
    if (a.runtimeState === 'busy' && Date.now() - (a.runtimeAt || 0) < 45000) return '豆包页面正在运行';
    if (a.dailyLimit != null && this.stats(a).submitted >= a.dailyLimit) return '今日提交达到设置上限';
    if (a.remaining === 0 && a.balanceAt && day(a.balanceAt) === day()) return '今日剩余次数为0';
    return '';
  }
  stats(a) { const today = day(); const jobs = this.state.jobs.filter(j => j.accountId === a.id && j.submittedAt && day(j.submittedAt) === today); return { submitted: jobs.length, completed: jobs.filter(j => j.status === 'succeeded').length, failed: jobs.filter(j => ['failed','attention'].includes(j.status)).length, active: this.state.jobs.filter(j => j.accountId === a.id && holdsAccount(j)).length }; }
  async snapshot() { return { ...this.state, settings: { ...this.state.settings }, accounts: this.state.accounts.map(({ token, ...a }) => ({ ...a, connected: Date.now() - (a.lastSeen || 0) < 45000, today: this.stats(a), openSkipReason: this.openSkipReason(a) })), jobs: this.state.jobs.map(({ task, resultUrl, ...j }) => ({...j, slotReleased:slotReleased(j), hasSavedResult: !!resultUrl, promptExcerpt: clean(task?.prompt, 220), parameters: {model: task?.model || j.settings?.model, actualModel:j.actualModel, ratio: task?.ratio || j.settings?.ratio, duration: task?.duration || j.settings?.duration, sources: task?.sources}})), helper: { pid: process.pid, port: this.port, address: '127.0.0.1', root: this.root, database: path.join(this.root, 'manager.json'), startedAt: this.startedAt, chrome: await findChrome().catch(() => ''), version: EXTENSION_VERSION } }; }
  command(action, data = {}) { if(this.stopping)return Promise.reject(Error('工作台正在关闭')); const run = this.incoming.then(() => this.runCommand(action, data)); this.incoming = run.catch(() => {}); return run; }
  requestExtensionUpdates() {
    if(this.stopping||this.updatePending)return;
    this.updatePending=true;
    void this.command('updateExtensions').catch(()=>{}).finally(()=>{this.updatePending=false;});
  }
  extensionRepairSafe(a){
    const held=this.state.jobs.filter(j=>j.accountId===a.id&&holdsAccount(j));
    // A timed-out observer can be replaced without touching its remote task.
    // Its saved conversation lets the new worker resume collection. Never
    // reload in the middle of configuring, sending or downloading a task.
    return held.every(j=>j.status==='attention'&&recoverable(j)&&conversation(j.conversationUrl));
  }
  requestWake() {
    if(this.stopping||this.wakePending||this.state.paused||!this.state.jobs.some(j=>j.status==='queued'))return;
    this.wakePending=true;
    setImmediate(()=>{void this.command('wakeQueue').catch(()=>{}).finally(()=>{this.wakePending=false;});});
  }
  async runCommand(action, data = {}) {
    await this.authorize();
    if (action === 'snapshot') return this.snapshot();
    if (action === 'previewJob') {
      const job = this.state.jobs.find(j => j.id === data.id);
      if (!job) throw Error('任务不存在');
      const bundle = JSON.parse(await fs.readFile(path.join(this.root, `${job.id}.bundle.json`), 'utf8'));
      return {bundle, accountIds: job.accountIds};
    }
    if(action==='updateExtensions'){
      let changed=false;
      for(const a of this.state.accounts){
        const recoveryUpdate=this.state.jobs.some(j=>j.accountId===a.id&&holdsAccount(j))&&this.extensionRepairSafe(a);
        if(!this.needsExtensionUpdate(a)||Date.now()-(a.lastSeen||0)>=45000||(!freshIdle(a)&&!recoveryUpdate)||a.loginCheck?.status==='pending'||a.closingCheckId||!this.extensionRepairSafe(a)||Date.now()-(a.lastExtensionUpdateAt||0)<60000)continue;
        // New workers can reload themselves, including after the desktop restarts.
        if(a.autoUpdateCapable&&!recoveryUpdate)continue;
        changed=true;a.extensionUpdating=true;a.lastExtensionUpdateAt=Date.now();
        try {await this.runCommand('open',{ids:[a.id],updateOnly:true});}
        catch(e){a.extensionUpdateMessage='自动更新暂未完成，将自动重试：'+clean(e.message,180);}
      }
      if(changed)await this.save();return {ok:true};
    }
    if(action==='wakeQueue'){
      if(this.state.paused)return this.snapshot();
      const waiting=this.state.jobs.filter(j=>j.status==='queued');
      // A blocked queue must wake the owner to collect its original result,
      // not keep trying to open a different creation page for the next job.
      for(const old of this.state.jobs.filter(j=>recoverable(j)&&j.conversationUrl&&waiting.some(w=>w.accountIds.includes(j.accountId)))){
        const a=this.account(old.accountId);
        if(!a.enabled||!this.state.participatingAccountIds.includes(a.id)||Date.now()-(a.lastSeen||0)<45000||Date.now()-(a.lastRecoveryWake||0)<60000)continue;
        a.lastRecoveryWake=Date.now();
        try{await this.runCommand('open',{ids:[a.id]});this.record(old,'恢复账号连接，继续获取原对话的视频；未重新提交');}
        catch(e){this.record(old,'原任务连接恢复失败：'+clean(e.message,200));}
      }
      for (const old of this.state.jobs.filter(j => j.retryJobId && holdsAccount(j) && waiting.some(w => w.id === j.retryJobId))) {
        const a = this.account(old.accountId);
        if (Date.now() - (a.lastSeen || 0) < 45000 || Date.now() - (a.lastRetryWake || 0) < 30000) continue;
        a.lastRetryWake = Date.now();
        try { await this.runCommand('open', {ids:[a.id]}); }
        catch(e) { const retry = waiting.find(j=>j.id===old.retryJobId); retry.error = '等待原账号恢复连接并确认空闲：' + clean(e.message,200); this.record(retry,retry.error); }
      }
      // Old generation login checks must never lock the launch of a new task.
      for(const a of this.state.accounts)if(a.loginCheck?.purpose==='generation'&&a.loginCheck.status==='pending')a.loginCheck.status='interrupted';
      let slots=Math.max(0,+this.state.settings.concurrency-this.state.jobs.filter(blocksSubmission).length);
      const ids=[...new Set(waiting.flatMap(j=>j.accountIds))].filter(id=>this.state.accounts.some(a=>a.id===id));
      ids.sort((x,y)=>(this.account(x).lastAssigned||0)-(this.account(y).lastAssigned||0));
      for(const id of ids){
        if(!slots||this.stopping||this.state.paused)break;
        const a=this.account(id),jobs=waiting.filter(j=>j.accountIds.includes(id));
        const reason=this.openSkipReason(a);
        if(reason){for(const j of jobs)if(!j.error)j.error=`${a.name}：${reason}`;continue;}
        if(freshIdle(a)&&a.creationReady){slots--;continue;}
        const wakeJob=jobs[0];
        if(a.wakeJobId===wakeJob.id&&(Date.now()-(a.lastWakeAt||0)<30000||Date.now()-(a.lastSeen||0)<15000)){slots--;continue;}
        a.lastWakeAt=Date.now();a.wakeJobId=wakeJob.id;slots--;
        for(const j of jobs){j.error='';this.record(j,`正在打开账号：${a.name}，进入豆包创作页`);}
        try{await this.runCommand('open',{ids:[id]});}
        catch(e){for(const j of jobs){j.error=`自动打开 ${a.name} 失败：${clean(e.message,250)}`;this.record(j,j.error);}}

      }
      this.dispatch();await this.save();return this.snapshot();
    }
    if (action === 'participation') {
      if (!Array.isArray(data.ids) || data.ids.length > 200 || typeof data.selected !== 'boolean') throw Error('参与账号设置无效');
      const ids = [...new Set(data.ids)]; ids.forEach(id => this.account(id));
      const selected = new Set(this.state.participatingAccountIds);
      // Retain the stored selection list for older clients; one toggle now
      // updates both gates atomically, including previously disabled accounts.
      for (const id of ids) { this.account(id).enabled = data.selected; if (data.selected) selected.add(id); else selected.delete(id); }
      this.state.participatingAccountIds = [...selected];
    } else if (action === 'account') {
      const a = data.id ? this.account(data.id) : { id: crypto.randomUUID(), serial: ++this.state.accountSequence, token: crypto.randomBytes(32).toString('hex'), enabled: true, group: '默认分组', loginStatus: '未确认', points: null, dailyLimit: null, remaining: null };
      if (!clean(data.name)) throw Error('请填写账号名称');
      Object.assign(a, { name: clean(data.name, 60), group: clean(data.group, 60) || '默认分组', enabled: data.enabled !== false, dailyLimit: nonnegative(data.dailyLimit) });
      if (!data.id) this.state.accounts.push(a);
    } else if (action === 'balance') {
      const a = this.account(data.id); a.points = nonnegative(data.points); a.remaining = nonnegative(data.remaining); a.balanceSource = '手动记录'; a.balanceAt = new Date().toISOString();
    } else if (action === 'loginStatus') { this.account(data.id).loginStatus = data.loggedIn ? '已人工确认登录' : '未确认'; }
    else if (action === 'checkLogin') {
      const a = this.account(data.id);
      if (a.loginCheck?.status === 'pending' && a.loginCheck.expiresAt > Date.now()) return this.snapshot();
      a.loginCheck = {id: crypto.randomUUID(), status: 'pending', requestedAt: new Date().toISOString(), expiresAt: Date.now() + 10 * 60000};
      a.closingCheckId = ''; a.runtimeState = 'unknown'; a.idleSamples = 0;
      if (Date.now() - (a.lastSeen || 0) >= 45000) {
        try { await this.runCommand('open', {ids:[a.id]}); }
        catch(e) { a.loginCheck.status = 'failed'; a.loginCheck.message = clean(e.message, 300); await this.save(); throw e; }
      }
    } else if (action === 'deleteAccount') {
      const a = this.account(data.id);
      if (this.state.jobs.some(j => j.accountId === a.id && holdsAccount(j))) throw Error('此账号仍有生成或待核对任务，请先处理原任务后再删除');
      for (const j of this.state.jobs) {
        if(j.accountId === a.id) j.accountName ||= `豆包${a.serial} · ${a.nickname || a.name}`;
        j.accountIds = (j.accountIds || []).filter(id => id !== a.id);
        if (['queued','paused'].includes(j.status) && !j.accountIds.length) {j.status = 'cancelled';j.error = '参与账号已删除，任务已取消';}
      }
      this.state.accounts = this.state.accounts.filter(x => x.id !== a.id);
      this.state.participatingAccountIds = this.state.participatingAccountIds.filter(id => id !== a.id);
      for (const [key,ticket] of this.loginTickets) if(ticket.accountId === a.id) this.loginTickets.delete(key);
    }
    else if (action === 'openAvailable') {
      if (!Array.isArray(data.ids) || data.ids.length > 200) throw Error('请选择需要打开的账号');
      const ids = [...new Set(data.ids)]; ids.forEach(id => this.account(id));
      const report = {opened:0, skipped:[], failed:[]};
      for (const id of ids) {
        const a = this.account(id), reason = this.openSkipReason(a);
        if (reason) {report.skipped.push(`${a.name}：${reason}`);continue;}
        try { await this.runCommand('open',{ids:[id]});report.opened++; }
        catch(e) {report.failed.push(`${a.name}：${clean(e.message,180)}`);}
      }
      return {...await this.snapshot(), operationReport:report};
    }
    else if (action === 'open') {
      const ids = [...new Set(data.ids || [])];
      for (const id of ids) {
        const a = this.account(id); const profileDir = path.join(this.root, 'profiles', a.id); await fs.mkdir(profileDir, { recursive: true });
        for (const [key, ticket] of this.loginTickets) if (ticket.expiresAt < Date.now() || ticket.accountId === a.id) this.loginTickets.delete(key);
        const ticket = crypto.randomBytes(32).toString('hex');
        this.loginTickets.set(ticket, {accountId: a.id, expiresAt: Date.now() + 5 * 60000});
        try {
          const result=await this.launch({ profileDir, extensionDir: path.join(path.dirname(this.root), 'doubao-extension'), viewExtensions:data.viewExtensions===true, updateOnly:data.updateOnly===true, forceRefresh:this.needsExtensionUpdate(a), allowRepair:this.extensionRepairSafe(a), url: `http://127.0.0.1:${this.port}/__director_connect#ticket=${ticket}` });
          if(data.updateOnly){a.runtimeState='unknown';a.idleSamples=0;a.extensionUpdateMessage=result?.updateDeferred?'等待账号浏览器连接后自动更新':'已加载新版助手，等待浏览器确认';}
          if(result?.extensionInstalled) a.extensionSetup={status:'verified',version:result.extensionVersion,checkedAt:new Date().toISOString()};
          await this.log(`Doubao account ${a.serial}: extension load ${result?.extensionInstalled ? 'verified' : 'not confirmed'}.`);
          if(data.viewExtensions) this.loginTickets.delete(ticket);
        }
        catch (e) { this.loginTickets.delete(ticket);a.extensionSetup={status:'failed',message:clean(e.message,300),checkedAt:new Date().toISOString()};await this.save();await this.log(`Doubao account ${a.serial}: extension launch failed.`);throw e; }
        a.lastOpenedAt = new Date().toISOString();
      }
    } else if (action === 'pair') { const a = this.account(data.id); return { version: 1, url: `http://127.0.0.1:${this.port}`, accountId: a.id, accountName: a.name, token: a.token }; }
    else if (action === 'settings') {
      const s = { ...this.state.settings, ...data };
      if (!Number.isInteger(+s.timeoutMinutes) || +s.timeoutMinutes < 1 || +s.timeoutMinutes > 120 || !Number.isInteger(+s.concurrency) || +s.concurrency < 1 || +s.concurrency > 10) throw Error('超时为1–120分钟，并发为1–10');
      if (!['自动','3:4','4:3','16:9','9:16','1:1','21:9'].includes(s.ratio) || !Number.isFinite(+s.duration) || +s.duration < 1 || +s.duration > 60) throw Error('画幅或时长无效');
      s.failureKeywords = [...new Set((s.failureKeywords || []).map(x => clean(x, 60)).filter(Boolean))].slice(0, 60);
      for (const key of ['mode','model','resolution','promptSelector','uploadReadySelector','uploadSelector','submitSelector','resultSelector','pointsSelector','remainingSelector','runningSelector','idleSelector','nicknameSelector']) s[key] = clean(s[key], 300);
      s.autoSubmit = s.autoSubmit === true; this.state.settings = s;
    } else if (action === 'pause') {
      this.state.paused = !!data.paused;
      for(const a of this.state.accounts){if(a.loginCheck?.purpose==='generation'&&a.loginCheck.status==='pending')a.loginCheck.status='interrupted';if(!this.state.paused){a.lastWakeAt=0;a.wakeJobId='';}}
      for (const job of this.state.jobs) {
        if (this.state.paused && job.status === 'queued') job.status = 'paused';
        else if (!this.state.paused && job.status === 'paused') job.status = 'queued';
      }
    }
    else if (action === 'enqueue' || action === 'regenerate') {
      const previous = action === 'regenerate' ? this.state.jobs.find(j => j.id === data.id) : null;
      if (action === 'regenerate') {
        if (!previous || !['failed','attention'].includes(previous.status)) throw Error('仅可重新生成失败的任务');
        if (previous.retryJobId) return this.snapshot();
        const bundle = data.bundle || JSON.parse(await fs.readFile(path.join(this.root, `${previous.id}.bundle.json`), 'utf8'));
        if (bundle.projectId !== previous.projectId || bundle.tasks?.length !== 1 || bundle.tasks[0].id !== previous.shotId) throw Error('重试分镜与原任务不匹配');
        data = {...data, bundle, accountIds: data.accountIds || previous.accountIds, autoSubmit: true};
      }
      if (this.state.paused) throw Error('豆包任务已暂停，请恢复任务后再提交；本次未加入队列。');
      if (!this.state.accounts.some(a => a.enabled && this.state.participatingAccountIds.includes(a.id))) throw Error('请先在豆包插件的账号页勾选“调用”的账号；本次未加入队列。');
      const b = data.bundle;
      if (b?.format !== 'director-doubao-task' || b.version !== 1 || !Array.isArray(b.tasks) || !b.tasks.length || b.tasks.length > 200 || !/^[\w-]{1,100}$/.test(b.projectId)) throw Error('任务包格式无效');
      const accountIds = [...new Set(data.accountIds || [])].filter(id => this.account(id).enabled && this.state.participatingAccountIds.includes(id));
      if(data.group!==undefined&&(!clean(data.group)||data.group==='全部分组'||accountIds.some(id=>this.account(id).group!==data.group)))throw Error('请先选择账号分组，确认调用账号均属于该分组；本次未加入队列。');
      if (new Set(b.tasks.map(t => t.id)).size !== b.tasks.length) throw Error('任务包中有重复分镜');
      if (!accountIds.length) throw Error('所选分组没有已勾选“调用”的账号；本次未加入队列。');
      for (const task of b.tasks) {
        if(task.dependsOnShotId && (b.tasks.some(t=>t.id===task.dependsOnShotId) || this.state.jobs.some(j=>j.projectId===b.projectId&&j.shotId===task.dependsOnShotId&&(['queued','paused'].includes(j.status)||holdsAccount(j))))) throw Error('当前分镜依赖上一视频尾帧，请等待原视频完成并重新绑定尾帧后提交');
        if (task.dependsOnShotId && (!/^[\w-]{1,100}$/.test(task.dependsOnShotId) || task.dependsOnShotId===task.id || !task.references.some(r=>r.mediaId===task.tailFrameMediaId))) throw Error('请先取得上一镜头尾帧并绑定到当前分镜，再提交依赖任务');
        if (!/^[\w-]{1,100}$/.test(task.id) || typeof task.prompt !== 'string' || task.prompt.length > 60000 || !Array.isArray(task.references)) throw Error('分镜任务格式无效');
        if (this.state.jobs.some(j => j.id !== previous?.id && j.projectId === b.projectId && j.shotId === task.id && (['queued', 'paused'].includes(j.status) || holdsAccount(j)))) throw Error(`${task.title} 已在队列中，请勿重复提交`);
      }
      for (const task of b.tasks) {
        const id = crypto.randomUUID();
        await fs.writeFile(path.join(this.root, `${id}.bundle.json`), JSON.stringify({ ...b, tasks: [task] }), { flag: 'wx' });
        this.state.jobs.push({ id, projectId: b.projectId, shotId: task.id, title: clean(task.title), kind: 'video', originalVideoId: task.originalVideoId || '', accountIds, group:data.group, status: 'queued', createdAt: new Date().toISOString(), settings: { ...this.state.settings, ...(data.autoSubmit === true ? {autoSubmit:true} : {}) }, task: { ...task } });
        if (previous) {
          const retry = this.state.jobs.at(-1);
          retry.retryOf = previous.id; previous.retryJobId = id; previous.retryRequestedAt = Date.now();
          this.record(retry, '已手动重新生成；按所选分组排队，账号空闲后提交');
          this.record(previous, '本次生成失败，已创建新的生成任务；保留原记录');
          if (previous.accountId && !previous.terminalAt) {
            const a = this.account(previous.accountId); a.idleSamples = 0; a.runtimeAt = 0;
          }
        }
      }
      this.requestWake();
    } else if(action==='retryPrepare'){
      const j=this.state.jobs.find(j=>j.id===data.id);
      if(!j||j.status!=='prepared'||j.submittedAt)throw Error('只能重新准备尚未提交的任务');
      j.prepareRevision=(j.prepareRevision||0)+1;j.error='';j.workflowError='';this.record(j,'已请求重新识别页面并准备原任务');
    } else if (action === 'release') {
      const j = this.state.jobs.find(j => j.id === data.id);
      if (!j || j.status !== 'attention' || !j.accountId || data.confirmed !== true) throw Error('请先核对原任务已结束');
      const a = this.account(j.accountId);
      if (!freshIdle(a)) throw Error('插件尚未连续确认页面空闲，不能释放账号');
      this.terminal(a,j); j.error = '已人工核对原任务结束，并通过页面空闲检测；未重新提交。';
    } else if (action === 'cancel') {
      const j = this.state.jobs.find(j => j.id === data.id);
      if (!j || !['queued', 'paused', 'attention'].includes(j.status)) throw Error('仅可取消排队或待核对任务');
      if (j.status === 'attention' && data.confirmed !== true) throw Error('请确认取消本地追踪；豆包网页上的生成不会自动停止，结果将不再自动回填');
      j.status = 'cancelled'; j.terminalAt = Date.now();
      this.record(j, '已人工取消本地任务追踪；豆包网页生成不会自动停止，结果不再自动回填');
    }
    else if (action === 'resume') {
      const j = this.state.jobs.find(j => j.id === data.id);
      if (j && ['submitted','downloading'].includes(j.status) && j.recoveryKey) return this.snapshot();
      if (!j || j.status !== 'attention' || !j.submittedAt || j.retryJobId) throw Error('仅可重新获取尚未重新生成的原提交任务');
      if (this.state.jobs.some(x => x.id !== j.id && x.accountId === j.accountId && holdsAccount(x))) throw Error('该账号已有活动或待核对任务');
      const a=this.account(j.accountId);
      if (!j.resultUrl && Date.now() - (a.lastSeen || 0) >= 45000) await this.runCommand('open',{ids:[a.id]});
      j.recoveryKey=crypto.randomUUID();j.recoveryCount=(j.recoveryCount||0)+1;
      j.status='submitted';delete j.terminalAt;j.waitStartedAt=Date.now();j.error='';
      this.record(j,j.resultUrl?'重取原任务：重新下载已匹配的原始视频，不重复生成':j.videoId?'重取原任务：按已保存的视频编号刷新原始下载链接，不重复生成':'重取原任务：等待原豆包对话返回，请保持原对话打开；不重复生成');
      if(j.resultUrl) await this.startDownload(a,j,j.resultUrl);
    }
    else if (action === 'backup') return { version: 2, accounts: this.state.accounts.map(({ token, lastSeen, ...a }) => a), settings: this.state.settings };
    else if (action === 'restore') {
      if (data.version !== 2 || !Array.isArray(data.accounts) || data.accounts.length > 200) throw Error('账号备份格式不正确');
      for (const row of data.accounts) { if (!clean(row.name)) throw Error('备份账号缺少名称'); }
      for (const row of data.accounts) this.state.accounts.push({ id: crypto.randomUUID(), serial: ++this.state.accountSequence, token: crypto.randomBytes(32).toString('hex'), name: clean(row.name, 60), group: clean(row.group, 60) || '默认分组', enabled: row.enabled !== false, points: nonnegative(row.points), dailyLimit: nonnegative(row.dailyLimit), remaining: nonnegative(row.remaining), balanceSource: '备份记录（需核对）', loginStatus: '未确认' });
    } else throw Error('不支持的豆包管理操作');
    await this.save();if(['pause','cancel'].includes(action))this.requestWake(); return this.snapshot();
  }
  async expire() { let changed = false; for (const a of this.state.accounts) if (a.closingCheckId && Date.now() - (a.closingCheckAt || 0) > 60000 && Date.now() - (a.lastSeen || 0) > 45000) { a.closingCheckId = ''; a.runtimeState = 'unknown'; a.idleSamples = 0; changed = true; } for (const a of this.state.accounts) if (a.loginCheck?.status === 'pending' && a.loginCheck.expiresAt < Date.now()) {a.loginCheck.status = 'failed';a.loginCheck.message = '等待登录或昵称超过10分钟；窗口已保留，请完成登录、验证并展开侧栏后重新检测';a.loginStatus = '检测未确认'; changed = true;} for (const j of this.state.jobs) if (ACTIVE.includes(j.status) && Date.now() - (j.waitStartedAt || Date.parse(j.submittedAt || j.preparedAt)) > this.state.settings.timeoutMinutes * 60000) { j.status = 'attention'; j.error = '等待结果时间较长，尚未确认结果；请核对原任务，勿重复生成'; changed = true; this.notify(j); } if (changed) await this.save(); }
  needsExtensionUpdate(a) { return !!a.executionBuild && a.executionBuild !== EXTENSION_VERSION; }
  eligible(a) {
    return !this.needsExtensionUpdate(a) && !a.extensionUpdating && a.enabled && this.state.participatingAccountIds.includes(a.id) && (a.creationReady || ['已人工确认登录','已检测登录'].includes(a.loginStatus)) && a.loginCheck?.status !== 'pending' && !a.closingCheckId && freshIdle(a)
      && !this.state.jobs.some(j => j.accountId === a.id && blocksSubmission(j))
      && !(a.dailyLimit != null && this.stats(a).submitted >= a.dailyLimit)
      && !(a.remaining === 0 && a.balanceAt && day(a.balanceAt) === day());
  }
  dispatch() {
    if(this.stopping) return;
    if (this.state.paused) return;
    for (const j of this.state.jobs.filter(j => j.status === 'queued')) {
      if (this.state.jobs.filter(blocksSubmission).length >= +this.state.settings.concurrency) break;
      if(j.task?.dependsOnShotId && this.state.jobs.some(other=>other.projectId===j.projectId&&other.shotId===j.task.dependsOnShotId&&(['queued','paused'].includes(other.status)||holdsAccount(other)))){j.error='等待上一镜头完成并更新尾帧参考图';continue;}
      const candidates = j.accountIds.map(id => this.state.accounts.find(a => a.id === id)).filter(a => a && this.eligible(a));
      // Least recently assigned within this task's selected group; polling speed cannot win extra work.
      candidates.sort((a,b) => (a.lastAssigned || 0) - (b.lastAssigned || 0));
      const a = candidates[0]; if (!a) continue;
      this.state.assignmentSequence = Math.max(this.state.assignmentSequence || 0, ...this.state.accounts.map(a => a.lastAssigned || 0)) + 1;
      a.lastAssigned = this.state.assignmentSequence;
      this.record(j, `已分配账号：${a.name}`);
      j.error = ''; Object.assign(j, { accountId: a.id, status: 'prepared', preparedAt: new Date().toISOString(), waitStartedAt: Date.now() });
    }
  }
  async claim(a) {
    a.lastSeen = Date.now(); const allowed=await this.authorize().then(()=>true).catch(()=>false);if(allowed)this.dispatch();
    const owned = this.state.jobs.filter(j => j.accountId === a.id && holdsAccount(j));
    const current = owned.find(blocksSubmission);
    // Snapshot before saving: only expose completion after its media receipt is durable.
    const jobStates = this.state.jobs.filter(j => j.accountId === a.id).map(j => ({id:j.id, requestId:j.requestId, status:j.status, terminal:!!j.terminalAt, returned:j.status==='succeeded' && !!j.media?.id}));
    await this.save();
    return { jobStates, waitingJobs: owned.filter(recoverable).map(j=>({...j, slotReleased:slotReleased(j)})), extensionVersion:EXTENSION_VERSION, extensionUpdateRequired:this.needsExtensionUpdate(a), accountName: a.name, serial: a.serial, nickname: a.nickname || '', loginCheck: a.loginCheck?.status === 'pending' ? a.loginCheck : null, waiting: this.state.jobs.some(j=>j.status==='queued'&&j.accountIds.includes(a.id)), enabled: a.enabled && this.state.participatingAccountIds.includes(a.id), paused: this.state.paused || !allowed, runtimeState: a.runtimeState || 'unknown', settings: this.state.settings, job: current && (allowed || current.status==='submitted') ? { ...current, bundle: JSON.parse(await fs.readFile(path.join(this.root, `${current.id}.bundle.json`), 'utf8')) } : null };
  }
  terminal(a,j) { j.terminalAt = Date.now(); a.runtimeState = 'unknown'; a.runtimeAt = 0; a.idleSamples = 0; }
  record(j, message) { const log = j.history ||= []; if (log.at(-1)?.message !== message) log.push({at: new Date().toISOString(), message: clean(message, 400)}); j.history = log.slice(-80); }
  async event(a, data) {
    a.lastSeen = Date.now();
    if(/^\d+\.\d+\.\d+$/.test(data.executionBuild||'')){a.executionBuild=data.executionBuild;a.autoUpdateCapable=data.autoUpdateCapable===true;}
    if(data.autoUpdateCapable===true)a.autoUpdateCapable=true;
    if(data.type==='extensionUpdate'){
      if(!this.needsExtensionUpdate(a))return {ok:true,updateAllowed:false};
      const updateAllowed=freshIdle(a)&&data.safeToUpdate===true&&!a.closingCheckId&&a.loginCheck?.status!=='pending'&&!this.state.jobs.some(j=>j.accountId===a.id&&holdsAccount(j));
      if(updateAllowed){a.extensionUpdating=true;a.runtimeState='unknown';a.idleSamples=0;a.extensionUpdateMessage='正在自动更新浏览器助手';}
      await this.save();return {ok:true,updateAllowed,version:EXTENSION_VERSION};
    }
    if(!this.needsExtensionUpdate(a)&&a.executionBuild){a.extensionUpdating=false;a.extensionUpdateMessage='';if(a.extensionSetup?.version!==EXTENSION_VERSION)a.extensionSetup={status:'verified',version:EXTENSION_VERSION,checkedAt:new Date().toISOString()};}
    if (data.type === 'loginResult') {
      if (!a.loginCheck || a.loginCheck.status !== 'pending' || a.loginCheck.id !== data.checkId || a.loginCheck.expiresAt < Date.now()) throw Error('登录检测已过期，请重新检测');
      const state = ['loggedIn','loggedOut','verification','unknown'].includes(data.state) ? data.state : 'unknown';
      const nickname = clean(data.nickname, 80);
      a.loginStatus = state === 'loggedIn' && nickname ? '已检测登录' : state === 'loggedOut' ? '未登录' : state === 'verification' ? '等待手动验证' : '检测未确认';
      if (a.loginStatus === '已检测登录') a.nickname = nickname;
      else if(state === 'loggedOut') a.nickname = '';
      const confirmed = a.loginStatus === '已检测登录';
      a.loginCheckedAt = new Date().toISOString(); a.loginCheck.status = confirmed ? 'done' : 'pending';
      a.loginCheck.waitingFor = confirmed ? '' : state === 'loggedOut' ? 'login' : state === 'verification' ? 'verification' : 'nickname';
      const closeAllowed = confirmed && a.loginCheck.purpose !== 'generation' && data.safeToClose === true && !this.state.jobs.some(j => j.accountId === a.id && holdsAccount(j));
      a.closingCheckId = closeAllowed ? data.checkId : ''; a.closingCheckAt = Date.now();
      a.loginCheck.message = clean(data.message, 250) || a.loginStatus;
      if (!confirmed) a.loginCheck.message += '；保留窗口，10分钟内自动重试';
      else if (a.loginCheck.purpose==='generation') a.loginCheck.message += '；自动继续准备生成任务';
      else if (!closeAllowed) a.loginCheck.message += '；窗口已保留（有任务或草稿）';
      a.runtimeState = 'unknown'; a.idleSamples = 0;
      await this.save(); return {ok:true, closeAllowed, pending:!confirmed, message:a.loginCheck.message, serial:a.serial, nickname:a.nickname||'', accountName:a.name};
    }
    if (data.type === 'loginClosed') {
      if (a.closingCheckId !== data.checkId) throw Error('关闭确认与检测不匹配');
      a.closingCheckId = ''; a.loginCheck.message += data.closed ? '；检测窗口已关闭' : '；窗口关闭失败，请手动关闭';
      a.lastSeen = data.closed ? 0 : Date.now(); a.runtimeState = 'unknown'; a.idleSamples = 0;
      await this.save(); return {ok:true};
    }
    if (data.type === 'runtime') {
      const now = Date.now(); const state = ['idle','busy'].includes(data.state) ? data.state : 'unknown';
      if (state === 'idle' && a.runtimeState === 'idle') {
        if (now - (a.runtimeAt || 0) >= 1000) a.idleSamples = Math.min(2, (a.idleSamples || 0) + 1);
      } else a.idleSamples = state === 'idle' ? 1 : 0;
      a.runtimeState = state; a.runtimeAt = now;a.runtimeError=clean(data.error,300);
      a.creationReady=state==='idle'&&data.readyForGeneration===true;
      // A failed attempt remains an account lock until fresh observations prove
      // it is no longer running. Display failure immediately; never guess idle.
      if (freshIdle(a)) for (const old of this.state.jobs.filter(j => j.accountId === a.id && j.retryJobId && holdsAccount(j))) {
        old.status = 'failed'; this.terminal(a, old);
        this.record(old, '重新生成前已确认原账号空闲，结束原任务占用'); this.notify(old);
      }
      if(data.nickname&&a.creationReady){a.nickname=clean(data.nickname,80);a.loginStatus='已检测登录';}
      else if(a.creationReady&&!['已检测登录','已人工确认登录'].includes(a.loginStatus))a.loginStatus='创作页可用（昵称待识别）';
      if(data.loginState==='loggedOut'){a.loginStatus='未登录';a.nickname='';}
      if(data.loginState==='verification')a.loginStatus='等待手动验证';
      for(const j of this.state.jobs.filter(j=>(j.status==='queued'&&j.accountIds.includes(a.id))||(j.status==='prepared'&&j.accountId===a.id))){j.error=a.runtimeError||j.workflowError||'';if(a.runtimeError)this.record(j,a.runtimeError);}
      await this.save(); return {ok:true};
    }
    if (data.type === 'balance') { if(data.points!==undefined)a.points = nonnegative(data.points); if(data.remaining!==undefined)a.remaining = nonnegative(data.remaining); a.balanceAt = new Date().toISOString(); a.balanceSource = '豆包页面读取'; await this.save(); return { ok: true }; }
    const j = this.state.jobs.find(j => j.id === data.jobId && j.accountId === a.id);
    if (!j) throw Error('任务与账号不匹配');
    if (j.status === 'cancelled') return {ok:true,ignored:true};
    if(data.type==='preparationAbandoned'){
      const failedBeforeClick=(j.history||[]).some(h=>/未确认已切换到视频模式|无法唯一识别.*菜单/.test(h.message));
      if(j.status==='attention'&&!j.submittedAt&&!j.requestId&&!j.videoId&&!j.submissionAttemptedAt&&data.noSubmissionAttempt===true&&failedBeforeClick&&freshIdle(a)){
        j.status='failed';this.terminal(a,j);j.error='旧任务在提交前配置失败，已确认页面空闲；未消耗生成次数';this.record(j,j.error);this.notify(j);await this.save();return {ok:true,released:true};
      }
      return {ok:true,released:false};
    }
    if(data.type==='submissionIntent'){
      await this.authorize();
      if(j.status!=='prepared'||this.state.paused||!a.enabled||!this.state.participatingAccountIds.includes(a.id)||j.submissionAttemptedAt)throw Error('任务不可提交或已尝试提交，请核对任务状态');
      j.submissionAttemptedAt=Date.now();await this.save();return {ok:true};
    }
    if(data.type==='submissionNotSent'&&j.status==='prepared'&&!j.requestId&&!j.submittedAt){
      delete j.submissionAttemptedAt;j.status='failed';this.terminal(a,j);
      j.error=clean(data.error||'提交前页面变化，本次没有发送生成请求',400);this.record(j,j.error);this.notify(j);await this.save();return {ok:true};
    }
    if(data.type==='confirmationIntent'){
      await this.authorize();
      if(j.status!=='submitted'||j.videoId||j.confirmationAttemptedAt||this.state.paused||!a.enabled)throw Error('当前任务不可重复确认生成');
      j.confirmationAttemptedAt=Date.now();this.record(j,'豆包要求确认，继续当前视频任务');await this.save();return {ok:true};
    }
    if (j.retryJobId) return {ok:true}; // Old callbacks cannot overwrite a manual retry.
    if(data.type==='conversationBound'&&recoverable(j)&&data.requestId===j.requestId){
      const url=conversation(data.url);
      if(url&&(!j.conversationUrl||j.conversationUrl===url)){
        if(!j.conversationUrl)this.record(j,'已保存原任务对话，重连后继续获取这条视频');
        j.conversationUrl=url;await this.save();
      }
      return {ok:true};
    }
    if (data.type === 'generationWaiting' && ['submitted','attention'].includes(j.status) && j.requestId && data.requestId === j.requestId) {
      // Re-reading the same acknowledgement must not revive a timed-out task.
      if(j.status==='attention'&&j.generationAcceptedAt)return {ok:true,ignored:true};
      if(j.conversationUrl&&data.url!==j.conversationUrl)return {ok:true,ignored:true};
      j.generationAcceptedAt ||= Date.now(); j.lastProgressAt=Date.now(); j.status='submitted'; j.error='';
      j.actualModel=clean(data.model,100); j.progressMessage=clean(data.summary,500);
      j.generationMessageId=clean(data.messageId,100)||j.generationMessageId;
      try{const url=new URL(data.url);if(['https://www.doubao.com','https://doubao.com'].includes(url.origin)&&/^\/chat\/\d+$/.test(url.pathname))j.conversationUrl=url.href;}catch{}
      this.record(j, `豆包已确认生成中${j.actualModel ? ' · '+j.actualModel : ''}；持续等待原视频返回`);
    }
    else if(data.type==='resultDetected'&&recoverable(j)&&data.requestId===j.requestId&&data.url===j.conversationUrl){
      if(!j.resultDetectedAt){j.resultDetectedAt=Date.now();j.resultMessageId=clean(data.messageId,100);this.record(j,'已识别原任务视频卡片，正在读取视频编号和原始下载链接');}
    }
    else if(data.type==='resultProbeError'&&recoverable(j)&&data.requestId===j.requestId){
      const error=clean(data.error,300);
      if(error&&error!==j.resultProbeError){j.resultProbeError=error;this.record(j,'原视频回收暂未完成：'+error);}
    }
    else if (data.type === 'workflow' && j.status === 'prepared') { for (const step of (Array.isArray(data.steps) ? data.steps : []).slice(0, 8)) this.record(j, clean(step, 200)); j.workflowError = j.error = clean(data.error, 400); if(j.error) this.record(j, j.error); }
    else if (data.type === 'submitted' && j.status === 'prepared') { this.record(j, '已匹配豆包生成请求，正在生成'); j.error = ''; j.status = 'submitted'; j.submittedAt = new Date().toISOString(); j.waitStartedAt = Date.now(); j.requestId = clean(data.requestId, 100); if (a.remaining != null) { a.remaining = Math.max(0, a.remaining - 1); a.balanceSource = '提交后估算（需同步）'; } }
    else if (data.type === 'identity' && ['submitted','attention'].includes(j.status) && (!data.requestId || data.requestId===j.requestId)) { j.messageId ||= clean(data.messageId, 100); j.videoId ||= clean(data.videoId, 100); }
    else if(data.type==='resultUnavailable'&&j.status==='submitted'){
      if(!j.videoId||data.videoId!==j.videoId||data.requestId!==j.requestId)throw Error('视频结果与原提交不匹配');
      j.status='attention';this.terminal(a,j);
      j.error='豆包已返回视频，但接口仅提供带水印版本，未下载到分镜。可重新获取原视频，无需重新生成。';
      this.record(j,j.error);this.notify(j);
    }
    else if (data.type === 'failed' && holdsAccount(j) && j.status !== 'downloading') { j.status = data.terminal === true ? 'failed' : 'attention'; if (data.terminal === true) this.terminal(a,j); j.error = clean(data.error || '提交结果不明，等待确认原任务结束', 500); this.notify(j); }
    else if (data.type === 'result' && ['submitted','attention'].includes(j.status) && j.submittedAt) {
      if (data.original !== true) throw Error('没有确认原始文件地址，不自动回填');
      if (j.videoId ? data.videoId !== j.videoId : (!j.requestId || data.requestId !== j.requestId)) throw Error('视频结果与原提交不匹配');
      if (!this.downloading.has(j.id)) {
        const official=data.source==='doubao_without_watermark'&&data.aiWatermarkRemoved===true;
        allowedMedia(data.url,official);
        j.aiWatermarkRemoved=official;j.brandWatermark=official&&new URL(data.url).searchParams.get('lr')==='video_gen_watermark_unpaid';
        if(official)this.record(j,j.brandWatermark?'官方已去除 AI 生成明水印；当前账号保留豆包品牌水印':'官方已去除 AI 生成明水印');
        await this.startDownload(a,j,data.url);
      }
    }
    await this.save(); return { ok: true };
  }
  async startDownload(a,j,value) {
    const url=allowedMedia(value,j.aiWatermarkRemoved===true);j.resultUrl=url;j.resultFoundAt=new Date().toISOString();
    this.terminal(a,j);this.downloading.add(j.id);j.status='downloading';
    this.record(j,'已匹配返回视频，开始下载原始文件');await this.save();
    const work=this.download(j,url);this.downloadJobs.add(work);
    void work.finally(()=>{this.downloading.delete(j.id);this.downloadJobs.delete(work);}).catch(()=>{});
  }
  async download(j, url) {
    try {
      let response;
      for (let n = 0; n < 5; n++) { response = await this.fetchMedia(allowedMedia(url,j.aiWatermarkRemoved===true), { redirect: 'manual', signal: AbortSignal.any([this.downloadAbort.signal, AbortSignal.timeout(120000)]) }); if ([301,302,303,307,308].includes(response.status)) { url = new URL(response.headers.get('location'), url).href; continue; } break; }
      const type = response.headers.get('content-type')?.split(';')[0];
      if (!response.ok || !['video/mp4','video/webm'].includes(type)) {j.resultUrl='';throw Error('原始视频地址无法下载或已过期，请重新获取以刷新链接');}
      const blob = await response.blob();
      if (!blob.size) throw Error('返回的视频为空');
      const backend = this.backend(); const form = new FormData(); form.set('file', new File([blob], `${j.title}.${type === 'video/webm' ? 'webm' : 'mp4'}`, { type }));
      form.set('operation_id','doubao:'+j.id);
      const imported = await fetch(backend.origin + '/api/media', { method: 'POST', headers: { Origin: backend.origin, Cookie: `director_session=${backend.token}`, ...(backend.internalToken?{'x-director-finish':backend.internalToken}:{}) }, body: form, signal:this.downloadAbort.signal });
      const media = await imported.json(); if (!imported.ok) throw Error(media.error || '回传工作台失败');
      if (!media?.id) throw Error('工作台未返回视频保存凭据，请核对后重新获取原任务结果');
      this.record(j, '原始视频已下载并回传工作台'); j.media = media; j.status = 'succeeded'; j.completedAt = new Date().toISOString(); j.error = ''; this.notify(j);
    } catch (e) { j.status = 'attention'; j.error = this.stopping ? '工作台已关闭，下载中断；重启后可重新获取原任务结果，无需重复生成。' : clean(e.message, 400); this.record(j, j.error); if(!this.stopping)this.notify(j); }
    await this.save();
  }
  async handle(req, res) {
    const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    try {
      if(this.stopping) return reply(503,{error:'工作台正在关闭'});
      if (req.headers.host !== `127.0.0.1:${this.port}`) return reply(403, { error: 'Host rejected' });
      const origin = req.headers.origin;
      if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return reply(403, { error: 'Origin rejected' });
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST'); res.writeHead(204); return res.end(); }
      if (req.method === 'GET' && req.url === '/__director_connect') {
        res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"});
        res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>连接豆包账号</title><style>body{font:16px system-ui;background:#f3f6fc;color:#16305a;padding:12vh 12vw;line-height:1.8}main{max-width:650px;background:white;padding:36px;border-radius:18px}h1{font-size:24px}a{color:#2463ee}</style><main><h1>正在连接工作台</h1><p id="director-connect-status">豆包助手已由桌面程序自动加载，正在连接账号并打开豆包，无需手动安装或复制连接码。</p><details><summary>没有自动跳转？</summary><p>回到工作台再次点击“打开登录”。如果仍未连接，请关闭这个账号的旧 Chrome 窗口，再从桌面程序打开登录。</p><p>桌面程序 0.1.31 起自动加载豆包助手。若提示安装失败，请更新 Google Chrome 后重试。</p></details></main></html>'); return;
      }
      if (req.method === 'POST' && req.url === '/connect/redeem') {
        if (!origin || !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return reply(403, {error:'Extension origin required'});
        let body=''; for await (const chunk of req) { body+=chunk; if (body.length > 1024) return reply(413,{error:'连接请求过大'}); }
        const code=JSON.parse(body).ticket;
        const grant=typeof code === 'string' && this.loginTickets.get(code);
        if (!grant || grant.expiresAt < Date.now()) { this.loginTickets.delete(code); return reply(401,{error:'自动连接已过期或已使用，请回工作台再次点击“打开登录”'}); }
        this.loginTickets.delete(code);
        const account=this.account(grant.accountId); account.lastSeen=Date.now();
        return reply(200,{version:1,url:`http://127.0.0.1:${this.port}`,accountId:account.id,accountName:account.name,token:account.token});
      }
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      const a = this.state.accounts.find(a => a.token === token); if (!a) return reply(401, { error: '账号连接码无效，请重新配对' });
      if (req.method === 'GET' && req.url === '/next') { const run = this.incoming.then(() => this.claim(a)); this.incoming = run.catch(() => {}); return reply(200, await run); }
      if (req.method === 'POST' && req.url === '/event') { let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 30000) return reply(413, { error: '事件过大' }); } const run = this.incoming.then(() => this.event(a, JSON.parse(body))); this.incoming = run.catch(() => {}); return reply(200, await run); }
      return reply(404, { error: 'Not found' });
    } catch (e) { reply(400, { error: clean(e.message, 400) }); }
  }
}
module.exports = { DoubaoManager, DEFAULTS, allowedMedia, day };
