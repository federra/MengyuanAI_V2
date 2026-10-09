'use client';
import { useState, useEffect } from 'react';
import { FolderOpen, Plus, Trash2, RotateCcw } from 'lucide-react';
import type { Project } from '@/lib/studio';
import type { TrashedProject } from '@/lib/project-trash';
import { ProjectCard } from './project-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function ProjectCenter({ projects, trashed, disabled, onNew, onOpen, onRename, onDelete, onRestore, onClearTrash }: {
  projects: Project[];
  trashed: TrashedProject[];
  disabled: boolean;
  onNew: () => void;
  onOpen: (project: Project) => void;
  onRename: (project: Project, title: string) => Promise<void>;
  onDelete: (project: Project) => Promise<void>;
  onRestore: (entry: TrashedProject) => Promise<void>;
  onClearTrash: () => Promise<void>;
}) {
  const [target, setTarget] = useState<Project>();
  const [renameTarget, setRenameTarget] = useState<Project>();
  const [renameTitle, setRenameTitle] = useState('');
  const [error, setError] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {const timer=setInterval(() => setNow(Date.now()),60000);return () => clearInterval(timer);}, []);
  async function remove() {
    if (!target || disabled) return;
    setError('');
    try { await onDelete(target); setTarget(undefined); }
    catch (e) { setError(e instanceof Error ? e.message : '删除失败，请重试。'); }
  }
  async function restore(entry: TrashedProject) {
    setError('');
    try { await onRestore(entry); }
    catch (e) { setError(e instanceof Error ? e.message : '恢复失败，请重试。'); }
  }
  async function clearTrash() {
    if (disabled || !trashed.length) return;
    setError('');
    try { await onClearTrash(); setClearOpen(false); }
    catch (e) { setError(e instanceof Error ? e.message : '清空失败，请重试。'); }
  }
  async function rename() {
    if (!renameTarget || disabled || !renameTitle.trim()) return;
    setError('');
    try { await onRename(renameTarget, renameTitle.trim()); setRenameTarget(undefined); }
    catch (e) { setError(e instanceof Error ? e.message : '重命名失败，请重试。'); }
  }
  return <section className="panel project-center-panel">
    <div className="section-title"><div><h2>项目中心</h2><p>每个故事，拥有独立的创作空间</p></div></div>
    <div className="project-center-actions"><Button disabled={disabled} onClick={onNew}><Plus />新建项目</Button></div>
    {error && !target && !renameTarget && !clearOpen && <p className="project-trash-error" role="alert">{error}</p>}
    <div className="project-cards">
      {!projects.length ? <div className="empty-note"><FolderOpen /><h3>还没有保存的项目</h3><p>新建项目，或在下方回收站恢复项目。</p></div> : projects.map(project =>
        <ProjectCard key={project.id} project={project} disabled={disabled} onOpen={() => onOpen(project)} onRename={() => {setError(''); setRenameTitle(project.title); setRenameTarget(project);}} onDelete={() => {setError(''); setTarget(project);}} />)}
    </div>
    <section className="project-trash-section" aria-label="项目回收站">
      <div className="project-trash-heading"><div><h3><Trash2 aria-hidden="true" />回收站 <small>{trashed.length}个项目</small></h3><p>删除后保留30天，期间可恢复；到期自动清理。</p></div><Button variant="outline" disabled={disabled || !trashed.length} onClick={() => {setError('');setClearOpen(true);}}><Trash2 aria-hidden="true" />清空回收站</Button></div>
      {!trashed.length ? <p className="helper">回收站为空</p> : <section className="project-trash-list" aria-label="回收站项目卡片">{trashed.map(entry => <ProjectCard className="project-trash-item" key={entry.project.id} project={entry.project} footer={<>
        <p>删除于{new Date(entry.deletedAt).toLocaleDateString('zh-CN')}<br />{new Date(entry.expiresAt).toLocaleString('zh-CN')}到期 · 剩余{Math.min(30,Math.max(0, Math.ceil((entry.expiresAt-now)/86400000)))}天</p>
        <Button variant="outline" disabled={disabled || entry.expiresAt <= now} onClick={() => void restore(entry)} aria-label={`恢复项目${entry.project.title}`}><RotateCcw aria-hidden="true" />恢复</Button>
      </>} />)}</section>}
    </section>
    <Dialog open={!!renameTarget} onOpenChange={open => {if (!open && !disabled) {setRenameTarget(undefined); setError('');}}}>
      <DialogContent showCloseButton={!disabled}><DialogHeader><DialogTitle>重命名项目</DialogTitle><DialogDescription>修改“{renameTarget?.title}”的名称，确认后保存。</DialogDescription></DialogHeader>
        <form onSubmit={event => {event.preventDefault(); void rename();}}>
          <label htmlFor="project-rename-title">项目名称</label>
          <Input id="project-rename-title" value={renameTitle} disabled={disabled} onChange={event => setRenameTitle(event.target.value)} />
          {error && <p role="alert" className="project-trash-error">{error}</p>}
          <div className="actions"><Button type="button" variant="outline" disabled={disabled} onClick={() => {setRenameTarget(undefined); setError('');}}>取消</Button><Button type="submit" disabled={disabled || !renameTitle.trim()}>确认改名</Button></div>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={!!target} onOpenChange={open => {if (!open && !disabled) {setTarget(undefined); setError('');}}}>
      <DialogContent showCloseButton={!disabled}><DialogHeader><DialogTitle>删除项目？</DialogTitle><DialogDescription>“{target?.title}”将移至回收站，30天内可恢复。此项目若有未保存修改，将先保存再移入回收站；已生成的素材关联会保留。</DialogDescription></DialogHeader>
        {error && <p role="alert" className="project-trash-error">{error}</p>}
        <div className="actions"><Button variant="outline" disabled={disabled} onClick={() => {setTarget(undefined); setError('');}}>取消</Button><Button variant="destructive" disabled={disabled} onClick={() => void remove()}>确认删除</Button></div>
      </DialogContent>
    </Dialog>
    <Dialog open={clearOpen} onOpenChange={open => {if (!disabled) {setClearOpen(open);setError('');}}}>
      <DialogContent showCloseButton={!disabled}><DialogHeader><DialogTitle>清空回收站？</DialogTitle><DialogDescription>将永久删除回收站内的全部项目，清空后无法恢复。正常项目和共享素材文件会保留。</DialogDescription></DialogHeader>
        {error && <p role="alert" className="project-trash-error">{error}</p>}
        <div className="actions"><Button variant="outline" disabled={disabled} onClick={() => {setClearOpen(false);setError('');}}>取消</Button><Button variant="destructive" disabled={disabled || !trashed.length} onClick={() => void clearTrash()}>确认清空</Button></div>
      </DialogContent>
    </Dialog>
  </section>;
}
