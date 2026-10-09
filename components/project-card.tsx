'use client';
import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import { Clapperboard, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { Project } from '@/lib/studio';
import { projectOverview, projectStatusLabels, type ProjectCover } from '@/lib/project-overview';

function ProjectCoverPreview({ covers }: { covers: ProjectCover[] }) {
  const [index, setIndex] = useState(0);
  const cover = covers[index];
  const fallback = () => setIndex(value => value + 1);
  if (!cover) return <Clapperboard className="project-cover-placeholder" aria-hidden="true" />;
  if (cover.kind === 'image') return <Image src={cover.url} alt="" width={560} height={315} unoptimized loading="lazy" onError={fallback} />;
  return <video
    key={cover.url}
    src={cover.url}
    muted
    playsInline
    preload="metadata"
    aria-hidden="true"
    onError={fallback}
    onLoadedMetadata={event => {
      const video = event.currentTarget;
      // Seek once to paint a still frame; never autoplay project previews.
      const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : Infinity;
      video.currentTime = Math.min((cover.time || 0) + 0.1, end);
    }}
  />;
}

export function ProjectCard({ project, onOpen, onRename, onDelete, disabled, footer, className = '' }: { project: Project; onOpen?: () => void; onRename?: () => void; onDelete?: () => void; disabled?: boolean; footer?: ReactNode; className?: string }) {
  const {status, covers} = projectOverview(project);
  const content = <>
    <div className="project-card-cover">
      <ProjectCoverPreview key={JSON.stringify(covers)} covers={covers} />
    </div>
    <div className="project-card-body">
      <div className="project-card-labels">
        <span className="tag project-status">{projectStatusLabels[status]}</span>
        <span className="tag">{project.ratio}</span>
      </div>
      <h3>{project.title}</h3>
      <p>{project.brief || '尚未填写创意'}</p>
      <small>{project.shots.length} 个镜头 · {new Date(project.updatedAt).toLocaleDateString('zh-CN')}</small>
    </div>
  </>;
  return <article className={`project-card-shell ${className}`}>
    {onOpen ? <button className="project-card project-card-with-cover" disabled={disabled} onClick={onOpen}>{content}</button> : <div className="project-card project-card-with-cover">{content}</div>}
    {footer && <div className="project-card-footer">{footer}</div>}
    {(onRename || onDelete) && <DropdownMenu><DropdownMenuTrigger className="project-card-menu" disabled={disabled} aria-label={`${project.title}项目操作`}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end">
      {onRename && <DropdownMenuItem onClick={onRename}><Pencil />重命名</DropdownMenuItem>}
      {onDelete && <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 />删除</DropdownMenuItem>}
    </DropdownMenuContent></DropdownMenu>}
  </article>;
}
