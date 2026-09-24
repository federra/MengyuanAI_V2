'use client';
import { useState } from 'react';
import Image from 'next/image';
import { Clapperboard } from 'lucide-react';
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

export function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const {status, covers} = projectOverview(project);
  return <button className="project-card project-card-with-cover" onClick={onOpen}>
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
  </button>;
}
