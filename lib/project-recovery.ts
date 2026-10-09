import type { Project } from './studio';

function content(project: Project) {
  const { revision: _revision, updatedAt: _updatedAt, ...body } = project;
  return JSON.stringify(body, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))
      : value,
  );
}

export function recoverProject(draft: Project, saved: Project[]) {
  const latest = saved.find(p => p.id === draft.id);
  // A formerly saved project that disappeared may have been deleted or purged.
  // Only unsaved new projects can recover without an active storage record.
  if (!latest && draft.revision > 0) return null;
  if (latest && content(latest) === content(draft))
    return { project: latest, dirty: false, copied: false };
  if ((!latest && draft.revision === 0) || latest?.revision === draft.revision)
    return { project: draft, dirty: true, copied: false };
  // Without a shared base, replacing the revision would silently overwrite saved work.
  return {
    project: { ...draft, id: crypto.randomUUID(), revision: 0, title: `${draft.title.slice(0, 144)}（恢复草稿）` },
    dirty: true,
    copied: true,
  };
}
