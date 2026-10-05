import type { Project } from './studio';

export const projectRetentionMs = 30 * 24 * 60 * 60 * 1000;
export type TrashedProject = { project: Project; deletedAt: number; expiresAt: number };

export function trashEntry(project: Project, deletedAt: number): TrashedProject {
  return { project, deletedAt, expiresAt: deletedAt + projectRetentionMs };
}
