'use client';
import { useRef, useState } from 'react';
import Image from 'next/image';
import { Film, ArrowLeft, ArrowRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dialogueCues, setCueTime } from '@/lib/dialogue-timeline';
import type { DialogueLine } from '@/lib/dialogue';
import type { Project } from '@/lib/studio';
export function SequencePreview({
  project,
  onExport,
  onEditShot,
  onChangeLines,
}: {
  project: Project;
  onChangeLines: (id: string, lines: DialogueLine[]) => void;
  onExport: () => void;
  onEditShot: (id: string) => void;
}) {
  const shots = project.shots.filter((s) => s.enabled);
  const [selected, setSelected] = useState(shots[0]?.id || '');
  const [error, setError] = useState('');
  const [cueIndex, setCueIndex] = useState<number>();
  const audio = useRef<HTMLAudioElement>(null);
  const index = Math.max(
    0,
    shots.findIndex((s) => s.id === selected),
  );
  const shot = shots[index];
  const cues = shot ? dialogueCues(shot) : [];
  const activeCue = cues[cueIndex ?? 0];
  const hasDubbing = !!shot?.audio || cues.some((c) => !!c.line.audio);
  const video = useRef<HTMLVideoElement>(null);
  const duration = shots.reduce((n, s) => n + s.duration, 0);
  const before = shots.slice(0, index).reduce((n, s) => n + s.duration, 0);
  const go = (id: string) => {
    video.current?.pause();
    audio.current?.pause();
    setCueIndex(undefined);
    setSelected(id);
    setError('');
  };
  const syncAudio = (v: HTMLVideoElement) => {
    const a = audio.current;
    if (!a || !shot || !hasDubbing) return;
    const t = v.currentTime - shot.trimStart;
    const cue = cues.length
      ? cues.find((c) => c.start <= t && t < c.end)
      : {
          start: 0,
          end: shot.duration,
          audioStart: 0,
          line: { audio: shot.audio },
        };
    const media = cue?.line.audio || shot.audio;
    if (v.paused || !cue || !media || t >= shot.duration) {
      a.pause();
      return;
    }
    if (a.dataset.mediaId !== media.id) {
      a.pause();
      a.dataset.mediaId = media.id;
      a.src = media.url;
      a.load();
      return;
    }
    const target = cue.audioStart + t - cue.start;
    if (Number.isFinite(a.duration) && target >= a.duration) {
      a.pause();
      return;
    }
    if (Math.abs(a.currentTime - target) > 0.15) a.currentTime = target;
    a.playbackRate = v.playbackRate;
    if (a.paused)
      void a
        .play()
        .catch(() => setError('配音播放未启动，请再次点击视频播放。'));
  };
  let position = 0;
  const segments = shots.map((s) => {
    const entry = { shot: s, start: position, cues: dialogueCues(s) };
    position += s.duration;
    return entry;
  });
  return (
    <section className="creative-card sequence-preview">
      <div className="creative-card-heading">
        <h2>
          <Film />
          作品画面预览
        </h2>
        <span className="tag">
          {shots.length} 个镜头 · {duration.toFixed(1)} 秒
        </span>
      </div>
      <div className="sequence-columns">
        <div>
          <div className="sequence-screen">
            {shot?.video ? (
              <video
                key={`${shot.id}-${shot.video.id}-${shot.trimStart}`}
                ref={video}
                src={shot.video.url}
                controls
                playsInline
                muted={hasDubbing}
                onPause={() => audio.current?.pause()}
                onSeeking={(e) => syncAudio(e.currentTarget)}
                onRateChange={(e) => syncAudio(e.currentTarget)}
                preload="metadata"
                onPlay={(e) => {
                  const v = e.currentTarget;
                  if (shot.trimStart >= v.duration) {
                    v.pause();
                    return;
                  }
                  if (
                    v.currentTime < shot.trimStart ||
                    v.currentTime >= shot.trimStart + shot.duration
                  )
                    v.currentTime = shot.trimStart;
                  syncAudio(v);
                }}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (shot.trimStart >= v.duration) {
                    setError('镜头入点超出视频长度，请在下方调整。');
                    return;
                  }
                  v.currentTime = shot.trimStart;
                }}
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (
                    !v.paused &&
                    v.currentTime >= shot.trimStart + shot.duration
                  )
                    v.pause();
                  syncAudio(v);
                }}
                onError={() => setError('视频暂时无法播放，请检查素材。')}
              >
                <track kind="captions" src="data:text/vtt,WEBVTT" />
              </video>
            ) : shot?.image ? (
              <Image
                unoptimized
                width={1280}
                height={720}
                src={shot.image.url}
                alt={shot.title}
              />
            ) : (
              <div className="creative-empty">
                <Film />
                <p>{shot ? '这个镜头尚未添加画面' : '尚无启用镜头'}</p>
              </div>
            )}
          </div>
          {hasDubbing && (
            <audio
              key={shot.id}
              ref={audio}
              preload="metadata"
              onLoadedMetadata={() => {
                if (video.current) syncAudio(video.current);
              }}
            >
              <track kind="captions" src="data:text/vtt,WEBVTT" />
            </audio>
          )}
          {error && (
            <p role="alert" className="biz-error">
              {error}
            </p>
          )}
          <div className="sequence-controls">
            <Button
              variant="outline"
              disabled={!index}
              onClick={() => go(shots[index - 1].id)}
            >
              <ArrowLeft />
              上一镜
            </Button>
            <span>
              {shot
                ? `${index + 1} / ${shots.length} · ${before.toFixed(1)}–${(before + shot.duration).toFixed(1)}秒`
                : '未选择镜头'}
            </span>
            <Button
              variant="outline"
              disabled={index >= shots.length - 1}
              onClick={() => go(shots[index + 1].id)}
            >
              下一镜
              <ArrowRight />
            </Button>
          </div>
          <div className="sequence-thumbnails">
            {shots.map((s, i) => (
              <button
                key={s.id}
                className={s.id === shot?.id ? 'active' : ''}
                onClick={() => go(s.id)}
                aria-label={`预览镜头${i + 1}：${s.title}`}
              >
                {s.image ? (
                  <Image
                    unoptimized
                    width={160}
                    height={90}
                    src={s.image.url}
                    alt=""
                  />
                ) : s.video ? (
                  <video src={s.video.url} muted preload="metadata">
                    <track kind="captions" src="data:text/vtt,WEBVTT" />
                  </video>
                ) : (
                  <Film />
                )}
                <span>
                  {i + 1} · {s.duration}s
                </span>
              </button>
            ))}
          </div>
        </div>
        <aside className="sequence-settings">
          <h3>导出准备</h3>
          <dl>
            <dt>画幅</dt>
            <dd>{project.ratio}</dd>
            <dt>已准备画面</dt>
            <dd>
              {shots.filter((s) => s.video || s.image).length} / {shots.length}
            </dd>
            <dt>配音素材</dt>
            <dd>
              {
                shots.filter((s) => s.audio || s.lines?.some((l) => l.audio))
                  .length
              }{' '}
              个镜头
            </dd>
            <dt>BGM</dt>
            <dd>{project.bgm?.name || '未添加'}</dd>
            <dt>待复核镜头</dt>
            <dd>{shots.filter((s) => s.reviewRequired).length}</dd>
          </dl>
          <Button onClick={onExport}>
            <Download />
            选择导出内容
          </Button>
          <Button
            variant="outline"
            disabled={!shot}
            onClick={() => shot && onEditShot(shot.id)}
          >
            返回当前分镜
          </Button>
          <p className="helper">
            这里按镜头预览画面，不是已渲染的成片。完整剪辑包可通过本机 Python +
            FFmpeg 渲染 MP4；桌面版也可导出剪映草稿继续编辑。
          </p>
        </aside>
      </div>
      <div className="sequence-tracks bounded-tracks" aria-label="素材时间轴">
        {['画面', '配音', '字幕'].map((name, row) => (
          <div key={name}>
            <b>{name}</b>
            <div
              className="bounded-track"
              aria-label={`${name}轨道，总时长${duration}秒`}
            >
              {segments.flatMap(({ shot: s, start, cues: items }) =>
                row === 0
                  ? [
                      <button
                        key={s.id}
                        className="track-video"
                        style={{
                          left: `${(start / duration) * 100}%`,
                          width: `${(s.duration / duration) * 100}%`,
                        }}
                        onClick={() => go(s.id)}
                        title={`${s.title} · ${start.toFixed(2)}–${(start + s.duration).toFixed(2)}秒`}
                      >
                        {s.title}
                      </button>,
                    ]
                  : items
                      .filter((c) => c.end > c.start)
                      .map((c) => (
                        <button
                          key={`${s.id}-${c.index}`}
                          className={
                            row === 2
                              ? 'track-caption'
                              : s.audio || c.line.audio
                                ? 'track-audio'
                                : 'track-empty'
                          }
                          style={{
                            left: `${((start + c.start) / duration) * 100}%`,
                            width: `${((c.end - c.start) / duration) * 100}%`,
                          }}
                          onClick={() => {
                            go(s.id);
                            setCueIndex(c.index);
                          }}
                          title={`${c.line.speaker || '旁白'}：${c.line.text} · ${(start + c.start).toFixed(2)}–${(start + c.end).toFixed(2)}秒${row === 1 && !s.audio && !c.line.audio ? ' · 未绑定配音' : ''}`}
                        >
                          {row === 1 && !s.audio && !c.line.audio
                            ? '待配音 · '
                            : ''}
                          {c.line.text}
                        </button>
                      )),
              )}
            </div>
          </div>
        ))}
        <div>
          <b>BGM</b>
          <div className="bounded-track">
            <span className={project.bgm ? 'track-bgm' : 'track-empty'}>
              {project.bgm?.name || '尚未添加背景音乐'}
            </span>
          </div>
        </div>
        <div>
          <b>时间</b>
          <div className="timeline-endpoints">
            <span>0秒</span>
            <span>{duration.toFixed(2)}秒 · 全片结束</span>
          </div>
        </div>
      </div>
      {shot && activeCue && (
        <div className="cue-editor">
          <strong>
            {shot.title} · 第{activeCue.index + 1}条 ·{' '}
            {activeCue.line.speaker || '旁白'}
          </strong>
          <select
            aria-label="选择台词时间段"
            value={activeCue.index}
            onChange={(e) => setCueIndex(Number(e.target.value))}
          >
            {cues.map((c) => (
              <option key={c.index} value={c.index}>
                第{c.index + 1}条 · {c.start.toFixed(2)}–{c.end.toFixed(2)}秒 ·{' '}
                {c.line.text.slice(0, 30)}
              </option>
            ))}
          </select>
          <p>{activeCue.line.text}</p>
          <div className="actions">
            {(['start', 'end', 'audioStart'] as const).map((field) => (
              <label key={field}>
                {field === 'start'
                  ? '开始（秒）'
                  : field === 'end'
                    ? '结束（秒）'
                    : '配音素材入点（秒）'}
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={field === 'audioStart' ? 86400 : shot.duration}
                  value={Number(
                    (field === 'audioStart'
                      ? activeCue.audioStart
                      : activeCue[field]
                    ).toFixed(2),
                  )}
                  onChange={(e) => {
                    if (e.target.value !== '')
                      onChangeLines(
                        shot.id,
                        setCueTime(
                          shot,
                          activeCue.index,
                          field,
                          Number(e.target.value),
                        ),
                      );
                  }}
                />
              </label>
            ))}
          </div>
          <p className="helper">
            字幕与配音共用此时间段，分镜末端为{shot.duration}
            秒。配音只播放该段长度，不加速，超出部分不播放。
            {activeCue.estimated
              ? '原文未提供时间，当前按剩余时段均分，请核对。'
              : ''}
            {!shot.audio && !activeCue.line.audio
              ? '此台词尚未绑定配音素材。'
              : ''}
          </p>
        </div>
      )}
    </section>
  );
}
