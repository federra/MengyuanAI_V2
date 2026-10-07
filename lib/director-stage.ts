import { type Project, type Shot, shotVisualText } from './studio';
import { type Change, applyChanges, valueAt } from './director';

const textFields: Record<string, keyof Project> = {
  创意: 'brief',
  故事: 'story',
  剧本: 'script',
  分场: 'scenes',
};

const shotFields = new Set([
  'title', 'description', 'scene', 'character', 'dialogue',
  'duration', 'size', 'camera', 'prompt',
]);

export function stageContext(project: Project, stage: string) {
  const field = Object.hasOwn(textFields, stage) ? textFields[stage] : undefined;
  if (field) return { projectId: project.id, content: project[field] };
  if (stage === '分镜')
    return {
      projectId: project.id,
      shots: project.shots.map((shot, index) => ({ id: shot.id, number: index + 1, title: shot.title,
        description: shot.description, prompt: shot.prompt, dialogue: shot.dialogue, duration: shot.duration,
        size: shot.size, camera: shot.camera, scene: shot.scene, character: shot.character })),
    };
  if (stage === '资产')
    return {
      projectId: project.id,
      assets: project.assets.map((asset) => ({ id: asset.id, kind: asset.kind, name: asset.name, description: asset.description })),
    };
  if (stage === '视频' || stage === '配音')
    return {
      projectId: project.id,
      shots: project.shots.map((shot) => ({
        id: shot.id,
        title: shot.title,
        status: stage === '视频' ? (shot.video ? '已生成' : '未生成') : (shot.audio ? '已生成' : '未生成'),
      })),
    };
  if (stage === '剪辑')
    return { projectId: project.id, shotCount: project.shots.length };
  throw Error('当前环节不支持导演助手');
}

export function assertStageChanges(stage: string, changes: Pick<Change, 'target' | 'field'>[]) {
  const field = Object.hasOwn(textFields, stage) ? textFields[stage] : undefined;
  for (const change of changes) {
    const allowed = field
      ? change.target === 'project' && change.field === field
      : stage === '分镜'
        ? change.target === 'shot' && shotFields.has(change.field)
        : stage === '资产'
          ? change.target === 'asset' && ['name', 'description'].includes(change.field)
          : false;
    if (!allowed) throw Error('模型修改超出当前环节，原内容未修改');
  }
}

export type DirectorSelection = {
  target: 'project' | 'shot' | 'asset';
  id: string;
  field: string;
  start: number;
  end: number;
  text: string;
};

export function dialogueSelectionOffset(shot: Shot, index: number, text: string): number | null {
  if (shot.lines && shot.lines.map((line) => line.text).join('\n') === shot.dialogue)
    return shot.lines.slice(0, index).reduce((offset, line) => offset + line.text.length + 1, 0);
  const offset = shot.dialogue.indexOf(text);
  return !text || offset < 0 || shot.dialogue.indexOf(text, offset + 1) !== -1 ? null : offset;
}

export type DirectorUndo = {
  recordId: string;
  changes: Change[];
  shotSnapshots?: { before: Shot; after: Shot }[];
};

export function undoStageChanges(current: Project, stage: string, action: DirectorUndo) {
  if (current.changeLog?.at(-1)?.id !== action.recordId || !action.changes.length)
    throw Error('已有后续修改，不能撤销这条回复');
  for (const snapshot of action.shotSnapshots || []) {
    if (JSON.stringify(current.shots.find((shot) => shot.id === snapshot.after.id)) !== JSON.stringify(snapshot.after))
      throw Error('分镜已有后续修改，不能撤销这条回复');
  }
  const next = applyStageChanges(current, stage, action.changes.map((change) => ({ ...change, before: change.after, after: change.before, reason: '撤销助手修改' })), '撤销：AI 导演助手修改');
  for (const snapshot of action.shotSnapshots || []) {
    const index = next.shots.findIndex((shot) => shot.id === snapshot.before.id);
    next.shots[index] = structuredClone(snapshot.before);
  }
  next.changeLog!.at(-1)!.undo = true;
  return next;
}

export function selectionSource(project: Project, stage: string, selection: DirectorSelection) {
  const field = selection.field === 'visual' ? 'prompt' : selection.field;
  assertStageChanges(stage, [{ target: selection.target, field }]);
  const shot = selection.target === 'shot' ? project.shots.find((shot) => shot.id === selection.id) : undefined;
  const source = selection.field === 'visual' && shot
    ? shotVisualText(shot)
    : valueAt(project, selection);
  if (typeof source !== 'string' || typeof selection.text !== 'string' ||
      !Number.isInteger(selection.start) || !Number.isInteger(selection.end) ||
      selection.start < 0 || selection.end <= selection.start || selection.end > source.length ||
      !selection.text.trim() || selection.text.length > 10000 ||
      source.slice(selection.start, selection.end) !== selection.text)
    throw Error('选中片段已变化，请重新选择后发送');
  return source;
}

export function selectionChanges(project: Project, stage: string, selection: DirectorSelection, replacement: string): Change[] {
  const source = selectionSource(project, stage, selection);
  if (typeof replacement !== 'string' || replacement.length > 10000)
    throw Error('局部修改结果无效，原内容未修改');
  const after = source.slice(0, selection.start) + replacement + source.slice(selection.end);
  const fields = selection.field === 'visual' ? ['description', 'prompt'] : [selection.field];
  return fields.map((field) => ({
    target: selection.target, id: selection.id, field,
    before: valueAt(project, { ...selection, field }) as string,
    after, reason: '按用户要求修改选中片段',
  })).filter((change) => change.before !== change.after);
}

// Keep content in other stages intact; only the change log records this action.
export function applyStageChanges(project: Project, stage: string, changes: Change[], instruction: string, selection?: DirectorSelection) {
  assertStageChanges(stage, changes);
  const next = applyChanges(project, changes, instruction);
  if (textFields[stage] || stage === '资产') next.shots = structuredClone(project.shots);
  if (stage === '分镜') {
    for (const change of changes.filter((change) => change.field === 'dialogue')) {
      const old = project.shots.find((shot) => shot.id === change.id)!;
      const shot = next.shots.find((shot) => shot.id === change.id)!;
      if (old.lines && old.lines.map((line) => line.text).join('\n') === old.dialogue &&
          selection?.id === old.id && selection.field === 'dialogue') {
        let offset = 0;
        const replacementLength = String(change.after).length - String(change.before).length + selection.end - selection.start;
        const replacement = String(change.after).slice(selection.start, selection.start + replacementLength);
        shot.lines = old.lines.map((line) => {
          const start = offset; offset += line.text.length + 1;
          if (selection.start < start || selection.end > start + line.text.length) return structuredClone(line);
          return { ...line, text: line.text.slice(0, selection.start - start) + replacement + line.text.slice(selection.end - start), audio: undefined, speechPendingId: undefined, speechGenerationId: undefined };
        });
      }
    }
  }
  return next;
}
