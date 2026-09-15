'use client';
import { useRef, useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { doubaoBundle } from '@/lib/doubao';
import { doubaoCommand, doubaoSubmissionAccounts, doubaoJobFailed, type DoubaoSnapshot } from '@/lib/doubao-manager';
import type { Project } from '@/lib/studio';

type Bundle = Awaited<ReturnType<typeof doubaoBundle>>;
type Options = {group?: string; retryId?: string; saved?: boolean; onGroupSelected?: (group:string)=>void};
type Preview = { bundle: Bundle; group:string; accountIds: string[]; accounts: string[]; retryId?: string };
type Selection = {project:Project; ids:string[]; options:Options; state:DoubaoSnapshot; saved?:{bundle:Bundle;accountIds:string[]}};

// All entry points prepare a snapshot first. Only the explicit confirmation
// sends that exact snapshot to the queue; canceling has no backend mutation.
export function useDoubaoTaskPreview(onSubmitted: (state: DoubaoSnapshot) => void) {
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [image, setImage] = useState<{url: string; label: string}>();
  const [selection,setSelection]=useState<Selection>();
  const [group,setGroup]=useState('');
  const lock = useRef(false);
  async function buildPreview(input:Selection, selectedGroup:string){
    const {project,ids,options,state,saved}=input;
    if(!selectedGroup)throw Error('请先选择豆包账号分组；本次未加入队列。');
    const accounts=doubaoSubmissionAccounts(state,selectedGroup).filter(a=>!saved||saved.accountIds.includes(a.id));
    if(!accounts.length)throw Error('原任务分组没有已启用调用的账号，请先设置调用账号。');
    const bundle=saved?.bundle||await doubaoBundle(project,ids,state.settings);
    const previous=bundle.tasks.length===1?[...state.jobs].reverse().find(j=>j.projectId===bundle.projectId&&j.shotId===bundle.tasks[0].id):undefined;
    setPreview({bundle,group:selectedGroup,accountIds:accounts.map(a=>a.id),accounts:accounts.map(a=>`${a.group} · ${a.name}`),retryId:options.retryId||(doubaoJobFailed(previous)?previous?.id:undefined)});
    options.onGroupSelected?.(selectedGroup);setSelection(undefined);
  }
  async function open(project: Project, ids: string[], options: Options = {}) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const state = await doubaoCommand();
      const saved = options.saved ? await doubaoCommand<{bundle:Bundle;accountIds:string[]}>('previewJob', {id:options.retryId}) : undefined;
      doubaoSubmissionAccounts(state); // Validate enabled accounts and pause first.
      const input={project,ids,options,state,saved};
      if(!options.group||options.group==='全部分组'){setGroup('');setSelection(input);return;}
      await buildPreview(input,options.group);
    } finally { lock.current = false; setBusy(false); }
  }
  async function confirm() {
    if (!preview || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const state = await doubaoCommand();
      const allowed = new Set(doubaoSubmissionAccounts(state,preview.group).map(a => a.id));
      if (preview.accountIds.some(id => !allowed.has(id))) throw Error('调用账号已变更，请关闭预览后重新选择账号。');
      if (preview.bundle.tasks.some(t => !t.prompt.trim())) throw Error('提示词不能为空');
      const result = await doubaoCommand(preview.retryId ? 'regenerate' : 'enqueue', {id: preview.retryId, bundle: preview.bundle, group:preview.group, accountIds: preview.accountIds, autoSubmit: true});
      setPreview(undefined); onSubmitted(result);
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  const dialog = <>
    <Dialog open={!!selection} onOpenChange={open=>{if(!open&&!lock.current)setSelection(undefined);}}>
      <DialogContent><DialogHeader><DialogTitle>请先选择豆包账号分组</DialogTitle><DialogDescription>只使用所选分组中开启“调用”的账号。确认任务预览后按账号轮流生成，每个账号完成上一条后才接收下一条。</DialogDescription></DialogHeader>
        <label className="field"><span>账号分组</span><select aria-label="提交任务的豆包账号分组" value={group} disabled={busy} onChange={e=>setGroup(e.target.value)}><option value="">请选择分组</option>{selection&&[...new Set(selection.state.accounts.filter(a=>a.enabled&&selection.state.participatingAccountIds.includes(a.id)&&(!selection.saved||selection.saved.accountIds.includes(a.id))).map(a=>a.group))].map(g=><option key={g} value={g}>{g}</option>)}</select></label>
        {error&&<p role="alert" className="error">{error}</p>}
        <Button disabled={!group||busy} onClick={()=>{if(!selection||lock.current)return;lock.current=true;setBusy(true);setError('');void buildPreview(selection,group).catch(e=>setError(e.message)).finally(()=>{lock.current=false;setBusy(false);});}}>{busy?'准备预览…':'继续预览任务'}</Button>
      </DialogContent>
    </Dialog>
    <Dialog open={!!preview} onOpenChange={open => {if (!open && !lock.current) {setPreview(undefined);setError('');}}}>
      <DialogContent className="max-w-5xl" style={{maxHeight:'90vh',overflowY:'auto'}}>
        <DialogHeader><DialogTitle>豆包视频 · 任务预览</DialogTitle><DialogDescription>核对提示词、参考图顺序和参数。点击“确认提交”后才会打开豆包并加入生成队列。</DialogDescription></DialogHeader>
        {preview && <>
          <p className="helper">调用账号：{preview.accounts.join('、')}</p>
          {preview.bundle.tasks.map((task, index) => <section key={task.id} className="rounded-xl border p-4 space-y-3">
            <h3 className="font-semibold">{index + 1}. {task.title}</h3>
            <p>{task.model} · {task.ratio} · {task.duration} 秒</p>
            <p className="helper">模型：{task.sources?.model}；画幅：{task.sources?.ratio}；时长：{task.sources?.duration}</p>
            <label className="field"><span>最终提交提示词（可修改）</span><textarea aria-label={`${task.title}最终提交提示词`} rows={10} value={task.prompt} onChange={e => setPreview(p => p && ({...p,bundle:{...p.bundle,tasks:p.bundle.tasks.map(t => t.id===task.id?{...t,prompt:e.target.value}:t)}}))} disabled={busy} /></label>
            <p className="helper">参考图按以下编号依次上传，点击图片可放大核对。</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{task.references.map((ref,i) => {
              const media = preview.bundle.media.find(m => m.id === ref.mediaId);
              return <button key={`${ref.mediaId}-${i}`} className="rounded-lg border p-2 text-left" onClick={() => media && setImage({url:media.dataUrl,label:ref.label})} disabled={!media}>
                {media && <img src={media.dataUrl} alt={ref.label} style={{width:'100%',height:120,objectFit:'contain'}} />}
                <span className="text-sm">{ref.label}</span>
              </button>;
            })}</div>
            {!task.references.length && <p className="helper">无参考图，使用文生视频。</p>}
          </section>)}
          {error && <p role="alert" className="error">{error}</p>}
          <div className="actions"><Button variant="outline" disabled={busy} onClick={() => setPreview(undefined)}>返回修改</Button><Button disabled={busy} onClick={() => void confirm()}>{busy?'正在提交…':`确认提交 ${preview.bundle.tasks.length} 个视频任务`}</Button></div>
        </>}
      </DialogContent>
    </Dialog>
    <Dialog open={!!image} onOpenChange={open => !open && setImage(undefined)}><DialogContent className="max-w-5xl"><DialogHeader><DialogTitle>{image?.label}</DialogTitle></DialogHeader>{image && <img src={image.url} alt={image.label} style={{width:'100%',maxHeight:'75vh',objectFit:'contain'}} />}</DialogContent></Dialog>
  </>;
  return {open, busy, dialog};
}
