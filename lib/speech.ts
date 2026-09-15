import type { ModelConfig, GenerationJob } from './models';
import type { Project } from './studio';
import { dialogueCues } from './dialogue-timeline';
import { dialogueText } from './dialogue';
export type SpeechInput = {
  projectId: string;
  targetId: string;
  lineId: string;
  text: string;
  voice: string;
  modelConfigId?: string;
  speed: number;
  instructions?: string;
};
export function speechBody(c: ModelConfig, input: SpeechInput) {
  for (const key of ['projectId', 'targetId', 'lineId'] as const)
    if (typeof input[key] !== 'string' || !/^[\w-]{1,100}$/.test(input[key]))
      throw Error('配音目标无效');
  if (
    typeof input.text !== 'string' ||
    !input.text.trim() ||
    input.text.length > 4096
  )
    throw Error('每条配音需要1至4096字台词');
  const voice = input.voice || c.speechVoice || '';
  if (typeof voice !== 'string' || !voice.trim() || voice.length > 150)
    throw Error('请填写服务商音色 ID，项目内音色名称不能代替服务商 ID');
  if (!Number.isFinite(input.speed) || input.speed < 0.25 || input.speed > 4)
    throw Error('语速范围为0.25至4');
  if (
    input.instructions !== undefined &&
    (typeof input.instructions !== 'string' || input.instructions.length > 1500)
  )
    throw Error('表演指令过长');
  return {
    model: c.model,
    input: input.text,
    voice: voice.trim(),
    response_format: c.speechFormat || 'mp3',
    speed: input.speed,
    ...(c.speechInstructions && input.instructions?.trim()
      ? { instructions: input.instructions.trim() }
      : {}),
  };
}
export function receiveGeneratedSpeech(
  project: Project,
  jobs: GenerationJob[],
): Project {
  let changed = false;
  const shots = project.shots.map((shot) => {
    const cues = dialogueCues(shot);
    let updated = false;
    const lines = cues.map((c) => {
      const line = c.line;
      if (!line.speechPendingId) return line;
      const job = jobs.find(
        (j) =>
          j.id === line.speechPendingId &&
          j.projectId === project.id &&
          j.targetId === shot.id &&
          j.lineId === line.id &&
          j.target === 'audio' &&
          j.status === 'succeeded' &&
          j.media,
      );
      if (!job || job.speechText !== line.text) return line;
      updated = true;
      return {
        ...line,
        audio: job.media,
        audioStart: 0,
        speechPendingId: undefined,
        speechGenerationId: job.id,
        start: c.start,
        end: c.end,
      };
    });
    if (!updated) return shot;
    changed = true;
    return { ...shot, lines, dialogue: dialogueText(lines) };
  });
  return changed ? { ...project, shots } : project;
}
