'use client';
import { useEffect, useState } from 'react';
import { modelApi } from './model-settings';
import { ModelPicker } from './model-picker';
import { Button } from './ui/button';
import type { Project, Shot, Asset } from '@/lib/studio';
import type { DialogueLine } from '@/lib/dialogue';
import { dialogueCues } from '@/lib/dialogue-timeline';
import type { ModelConfig, GenerationJob } from '@/lib/models';
export function SpeechControls({
  project,
  shot,
  line,
  voiceAsset,
  jobs,
  onPrepared,
  onJob,
  onSettings,
}: {
  project: Project;
  shot: Shot;
  line: DialogueLine;
  voiceAsset?: Asset;
  jobs: GenerationJob[];
  onPrepared: (lines: DialogueLine[]) => void;
  onJob: (job: GenerationJob) => void;
  onSettings: () => void;
}) {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [modelId, setModelId] = useState(line.speechModelId || '');
  const [voice, setVoice] = useState(
    line.speechVoiceId || voiceAsset?.attributes?.['服务商音色ID'] || '',
  );
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    modelApi<ModelConfig[]>('/api/models')
      .then(setModels)
      .catch((e) => setError(e.message));
  }, []);
  const selected = models.find((m) =>
    modelId ? m.id === modelId : m.kind === 'audio' && m.isDefault,
  );
  const cues = dialogueCues(shot);
  const cue = cues.find((c) => c.line.id === line.id);
  const pending = jobs.find((j) => j.id === line.speechPendingId);
  const active = busy || pending?.status === 'submitting';
  async function generate() {
    if (!cue || active) return;
    setBusy(true);
    setError('');
    const id = crypto.randomUUID();
    const input = {
      projectId: project.id,
      targetId: shot.id,
      lineId: line.id,
      text: cue.line.text,
      voice: voice || selected?.speechVoice || '',
      modelConfigId: modelId || undefined,
      speed,
      instructions:
        `说话人：${cue.line.speaker || '旁白'}；情绪：${line.emotion}；音色设定：${voiceAsset?.description || ''}。只朗读原台词，不读角色名或说明。`.slice(
          0,
          1500,
        ),
    };
    try {
      if (!selected?.enabled || !selected.hasKey)
        throw Error('请先保存并启用声音模型');
      if (!input.voice) throw Error('请填写服务商音色 ID');
      onPrepared(
        cues.map((c) => ({
          ...c.line,
          start: c.start,
          end: c.end,
          ...(c.line.id === line.id
            ? {
                speechPendingId: id,
                speechVoiceId: input.voice,
                speechModelId: modelId,
              }
            : {}),
        })),
      );
      const job = await modelApi<GenerationJob>(
        '/api/speech',
        { id, input },
        onJob,
      );
      onJob(job);
      if (job.error) setError(job.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="speech-controls">
      <div className="field">
        <span>声音模型</span>
        <ModelPicker
          models={models}
          kind="audio"
          value={modelId}
          onChange={(id) => {
            setModelId(id);
            setVoice('');
          }}
          disabled={active}
          onSettings={onSettings}
        />
      </div>
      <label className="field">
        <span>服务商音色 ID</span>
        <input
          list="speech-voice-options"
          value={voice}
          placeholder={selected?.speechVoice || '输入服务商提供的音色 ID'}
          disabled={active}
          onChange={(e) => setVoice(e.target.value)}
        />
        <datalist id="speech-voice-options">
          {selected?.speechVoices?.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </datalist>
      </label>
      <label className="field">
        <span>语速</span>
        <input
          type="number"
          min="0.25"
          max="4"
          step="0.05"
          value={speed}
          disabled={active}
          onChange={(e) => setSpeed(Number(e.target.value))}
        />
      </label>
      <p className="helper">
        仅合成这一条原台词，结果绑定到当前台词。
        {cue ? `时间段 ${cue.start.toFixed(2)}–${cue.end.toFixed(2)}秒；` : ''}
        长于时间段的音频可在预览中调整时间。
        {selected?.speechInstructions
          ? '同时发送音色与表演说明。'
          : '此配置不发送额外表演指令。'}
        音色样本不通过此协议上传。
      </p>
      {(error || pending?.error) && (
        <p role="alert" className="error">
          {error || pending?.error}
        </p>
      )}
      {line.audio && (
        <audio controls src={line.audio.url}>
          <track kind="captions" src="data:text/vtt,WEBVTT" />
        </audio>
      )}
      <Button
        disabled={active || !cue?.line.text.trim()}
        onClick={() => void generate()}
      >
        {active ? '生成中…' : line.audio ? '重新生成此条配音' : '生成此条配音'}
      </Button>
      <small className="helper">
        提交会调用所选声音服务并可能产生费用。完成后返回对应台词，可关闭窗口继续工作。
      </small>
    </div>
  );
}
