import { shotVisualText, type Project } from './studio';
import { composeVideoContext, videoReferences } from './video-context';
import { finalVideoPrompt } from './video-request';
import type { GenerationInput } from './models';
export const doubaoModels = ['Seedance 2.5', 'Seedance 2.0', 'Seedance 2.0 Fast', 'Seedance 2.0 Mini'];
export const doubaoRatios = ['自动', '3:4', '4:3', '9:16', '16:9', '1:1', '21:9'];
type Defaults = { model?: string; ratio?: string; duration?: number; resolution?: string };
export function doubaoParameters(project: Project, shot: Project['shots'][number], defaults: Defaults = {}) {
  return {
    model: shot.doubaoModel || defaults.model || 'Seedance 2.0 Mini',
    ratio: shot.doubaoRatio || defaults.ratio || project.ratio || '16:9',
    duration: shot.duration > 0 ? shot.duration : defaults.duration || 10,
    resolution: defaults.resolution || '',
    sources: { model: shot.doubaoModel ? '分镜' : '插件默认', ratio: shot.doubaoRatio ? '分镜' : defaults.ratio ? '插件默认' : project.ratio ? '项目画幅' : '插件默认', duration: shot.duration > 0 ? '分镜' : '插件默认' },
  };
}
export function doubaoTasks(project: Project, ids: string[], defaults: Defaults = {}) {
  return project.shots
    .filter((s) => ids.includes(s.id))
    .map((s) => {
      const parameters = doubaoParameters(project, s, defaults);
      const references = videoReferences(project, s);
      const input: GenerationInput = {
        projectId: project.id,
        targetId: s.id,
        target: 'video',
        prompt: composeVideoContext(project, s, shotVisualText(s), {
          ratio: parameters.ratio,
          resolution: parameters.resolution || '自动',
          duration: parameters.duration,
        }),
        ratio: parameters.ratio,
        duration: parameters.duration,
        resolution: parameters.resolution || '自动',
        size: '2K',
        referenceIds: references.map((r) => r.mediaId),
        referenceBindings: references.map(({ mediaId, label }) => ({
          mediaId,
          label,
        })),
      };
      return {
        id: s.id,
        originalVideoId: s.video?.id || '',
        dependsOnShotId: s.firstFrameSource?.shotId,
        tailFrameMediaId: s.firstFrameSource ? s.firstFrame?.id : undefined,
        title: s.title,
        prompt: finalVideoPrompt(input).replace(/（目标尺寸NaNxNaN）/g, ''),
        model: parameters.model,
        resolution: parameters.resolution,
        sources: parameters.sources,
        duration: parameters.duration,
        ratio: parameters.ratio,
        references,
      };
    });
}
export async function doubaoBundle(project: Project, ids: string[], defaults: Defaults = {}) {
  const tasks = doubaoTasks(project, ids, defaults);
  if (!tasks.length) throw Error('请先选择需要发送到豆包的分镜');
  const media = [];
  const seen = new Set<string>();
  for (const task of tasks)
    for (const ref of task.references) {
      if (seen.has(ref.mediaId)) continue;
      seen.add(ref.mediaId);
      if (ref.media.url !== `/api/media/${ref.media.id}`)
        throw Error('参考图地址无效，请重新绑定素材');
      const r = await fetch(ref.media.url);
      if (!r.ok) throw Error(`${ref.media.name} 无法读取`);
      const blob = await r.blob();
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type))
        throw Error('参考图格式无效');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(Error('参考图读取失败'));
        reader.onerror = () => reject(Error('参考图读取失败'));
        reader.readAsDataURL(blob);
      });
      media.push({
        id: ref.mediaId,
        name: ref.media.name,
        type: blob.type,
        dataUrl,
      });
    }
  return {
    format: 'director-doubao-task',
    version: 1,
    projectId: project.id,
    projectTitle: project.title,
    createdAt: new Date().toISOString(),
    tasks: tasks.map((t) => ({
      id: t.id,
      originalVideoId: t.originalVideoId,
      dependsOnShotId: t.dependsOnShotId,
      tailFrameMediaId: t.tailFrameMediaId,
      title: t.title,
      prompt: t.prompt,
      duration: t.duration,
      ratio: t.ratio,
      model: t.model,
      resolution: t.resolution,
      sources: t.sources,
      references: t.references.map((r, i) => ({
        mediaId: r.mediaId,
        label: `参考图${i + 1}：${r.label}`,
      })),
    })),
    media,
  };
}
