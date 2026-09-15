'use client';
import { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { VideoFileButton } from './video-file-button';
import { doubaoJobPaused, doubaoJobFailed, type DoubaoSnapshot, type DoubaoJob } from '@/lib/doubao-manager';

const names: Record<string, string> = {queued: '排队中', paused: '已暂停', prepared: '等待提交', submitted: '生成中', downloading: '下载回传中', succeeded: '已完成', failed: '生成失败', attention: '待核对', cancelled: '已取消'};
const when = (value?: string) => value ? new Date(value).toLocaleString('zh-CN', {hour12: false}) : '—';
export function DoubaoTaskRecords({data, onCommand}: {data: DoubaoSnapshot; onCommand: (action: string, body?: unknown) => Promise<unknown>}) {
  const [filter, setFilter] = useState('全部');
  const [account, setAccount] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<string>();
  const [preview, setPreview] = useState<DoubaoJob>();
  const status = (job: DoubaoJob) => doubaoJobPaused(job, data.paused) ? 'paused' : job.status;
  const jobs = [...data.jobs].reverse().filter(j => (!search.trim() || [j.title,j.promptExcerpt,j.requestId,j.videoId].join(' ').toLowerCase().includes(search.trim().toLowerCase())) && (!account || j.accountId === account) && (filter === '全部' || (filter === '进行中' ? ['queued', 'prepared', 'submitted', 'downloading'].includes(status(j)) : filter === '已暂停' ? status(j) === 'paused' : filter === '已完成' ? j.status === 'succeeded' : filter === '待核对' ? j.status === 'attention' : filter === '生成失败' ? j.status === 'failed' : j.status === 'cancelled')));
  const totalPages = Math.max(1, Math.ceil(jobs.length / pageSize));
  const current = Math.min(page, totalPages - 1);
  return <section className="doubao-records" aria-label="豆包工作与视频返回记录">
    <div className="actions">
      {['全部', '进行中', '已暂停', '已完成', '待核对', '生成失败', '已取消'].map(label => <Button key={label} variant={filter === label ? 'default' : 'outline'} onClick={() => {setFilter(label); setPage(0);}}>{label}</Button>)}
      <select aria-label="按账号筛选任务" value={account} onChange={e => {setAccount(e.target.value); setPage(0);}}><option value="">全部账号</option>{data.accounts.map(a => <option key={a.id} value={a.id}>{a.group} · {a.name}</option>)}</select>
      <input aria-label="搜索豆包任务" placeholder="搜索分镜、提示词或任务编号" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} />
    </div>
    <div className="doubao-record-scroll"><table>
      <thead><tr><th>状态 / 账号</th><th>分镜 / 提示词 / 返回视频</th><th>实际提交参数</th><th>时间 / 工作记录</th><th>操作</th></tr></thead>
      <tbody>{jobs.slice(current * pageSize, current * pageSize + pageSize).map(j => <tr key={j.id}>
        <td><span className={`doubao-record-status is-${status(j)}`}>{j.status==='submitted'&&j.generationAcceptedAt?'等待视频返回':names[status(j)] || status(j)}</span><p>{data.accounts.find(a => a.id === j.accountId)?.name || j.accountName || '待分配账号'}</p>{j.slotReleased && <small>已释放账号，继续追踪原结果</small>}{j.error && <small className="doubao-record-error">{j.error}</small>}</td>
        <td><strong>{j.title}</strong><p className="doubao-record-prompt">{j.promptExcerpt || '旧任务未保存提示词摘要'}</p>{j.media && <><button className="doubao-record-video" onClick={() => setPreview(j)} aria-label={`放大预览 ${j.title}`}><video muted preload="metadata" src={j.media.url}><track kind="captions" /></video><span>▶ 预览视频</span></button><a href={j.media.url} download={j.media.name}>下载视频</a></>}</td>
        <td>{j.parameters?.actualModel || j.parameters?.model || '旧任务未记录模型'}{j.parameters?.actualModel && <small>（豆包实际模型）</small>}<p>{j.parameters?.ratio || '—'} · {j.parameters?.duration ?? '—'} 秒</p>{j.parameters?.sources && <small>模型：{j.parameters.sources.model}<br />画幅：{j.parameters.sources.ratio}<br />时长：{j.parameters.sources.duration}</small>}</td>
        <td><time>{when(j.createdAt)}</time><details><summary>查看工作记录</summary><ol className="doubao-record-history"><li>创建：{when(j.createdAt)}</li>{(j.history || []).map((h, i) => <li key={i}>{when(h.at)}<br />{h.message}</li>)}{j.submittedAt && <li>提交：{when(j.submittedAt)}</li>}{j.completedAt && <li>回传：{when(j.completedAt)}</li>}</ol>{j.requestId && <small>请求：{j.requestId}</small>}{j.videoId && <p><small>视频：{j.videoId}</small></p>}</details></td>
        <td><div className="doubao-record-actions">
          {['queued', 'paused'].includes(j.status) && <Button variant="outline" onClick={() => void onCommand('cancel', {id: j.id})}>取消任务</Button>}
          {j.status==='attention' && <Button variant="outline" disabled={!!pending} onClick={async()=>{if(!window.confirm('取消此任务的本地追踪？豆包网页上的生成不会自动停止，视频结果将不再自动回填。原对话会保留，账号可继续下一任务。'))return;setPending(j.id);try{await onCommand('cancel',{id:j.id,confirmed:true});}finally{setPending(undefined);}}}>取消追踪</Button>}
          {j.status==='prepared'&&j.error&&<Button variant="outline" onClick={()=>void onCommand('retryPrepare',{id:j.id})}>重新准备</Button>}
          {doubaoJobFailed(j) && <Button disabled={!!pending || !!j.retryJobId || data.paused} onClick={async () => {setPending(j.id);try{await onCommand('regenerate', {id:j.id});}finally{setPending(undefined);}}}>{j.retryJobId ? '已创建新任务' : pending===j.id ? '正在加入队列…' : '重新生成'}</Button>}
          {j.status === 'attention' && j.submittedAt && !j.retryJobId && <Button variant="outline" disabled={!!pending} onClick={async () => {setPending(j.id);try{await onCommand('resume', {id: j.id});}finally{setPending(undefined);}}}>{pending===j.id?'正在重取…':j.hasSavedResult?'重新下载':'重新获取'}</Button>}
          {!!j.recoveryCount && <small>原任务重取 {j.recoveryCount} 次</small>}
          {j.hasSavedResult && j.status!=='succeeded' && <small>已找到原始视频，等待下载回传</small>}
          {j.aiWatermarkRemoved && <small>{j.brandWatermark?'AI 明水印已去除，保留豆包品牌水印':'AI 明水印已去除'}</small>}
          {j.media && <VideoFileButton media={j.media} projectId={j.projectId} name={j.title} />}
        </div></td>
      </tr>)}</tbody>
    </table>{!jobs.length && <p className="helper">此筛选条件下没有任务记录。</p>}</div>
    <div className="actions"><span>共 {jobs.length} 条</span><label>每页 <select aria-label="每页任务数量" value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(0);}}>{[5,10,20,50].map(n=><option key={n} value={n}>{n}</option>)}</select> 条</label><Button variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>上一页</Button><span>{current + 1} / {totalPages}</span><Button variant="outline" disabled={current + 1 >= totalPages} onClick={() => setPage(current + 1)}>下一页</Button></div>
    <Dialog open={!!preview} onOpenChange={open => !open && setPreview(undefined)}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>{preview?.title || '视频预览'}</DialogTitle></DialogHeader>{preview?.media && <video style={{width: '100%', maxHeight: '70vh', background: '#0f172a'}} src={preview.media.url} controls autoPlay><track kind="captions" /></video>}</DialogContent></Dialog>
  </section>;
}
