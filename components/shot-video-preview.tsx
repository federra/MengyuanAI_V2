'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { VideoFileButton } from './video-file-button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { Project } from '@/lib/studio';
import { lastFrameTime, type FrameTarget } from '@/lib/frame-reference';

async function seek(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < 0.0001 && video.readyState >= 2)
    return;
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
      if (error) reject(error);
      else resolve();
    };
    const done = () => finish();
    const fail = () => finish(Error('视频解码失败，请更换浏览器支持的文件'));
    const timer = setTimeout(
      () => finish(Error('定位视频帧超时，请重试')),
      12000,
    );
    video.addEventListener('seeked', done);
    video.addEventListener('error', fail);
    try {
      video.currentTime = time;
    } catch {
      finish(Error('无法定位这一帧'));
    }
  });
}

export function ShotVideoPreview({
  project,
  sourceId,
  onClose,
  onApply,
}: {
  project: Project;
  sourceId: string;
  onClose: () => void;
  onApply: (file: File, target: FrameTarget) => Promise<void>;
}) {
  const index = project.shots.findIndex((s) => s.id === sourceId);
  const source = project.shots[index];
  const next = project.shots[index + 1];
  const videoRef = useRef<HTMLVideoElement>(null);
  const mounted = useRef(true);
  const captureLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<{
    file: File;
    url: string;
    target: FrameTarget;
  } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (draft) URL.revokeObjectURL(draft.url);
    },
    [draft],
  );
  async function capture(end: boolean) {
    const video = videoRef.current;
    if (!video || !source?.video || !next || captureLock.current) return;
    captureLock.current = true;
    setBusy(true);
    setError('');
    const target: FrameTarget = {
      projectId: project.id,
      sourceShotId: source.id,
      sourceVideoId: source.video.id,
      targetShotId: next.id,
      previousFrameId: next.firstFrame?.id || '',
      time: 0,
    };
    try {
      video.pause();
      if (end) await seek(video, lastFrameTime(video.duration));
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight)
        throw Error('当前画面尚未解码，请等待视频加载后重试');
      const scale = Math.min(
        1,
        4096 / Math.max(video.videoWidth, video.videoHeight),
      );
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('浏览器不支持截图');
      video.pause();
      const capturedTime = video.currentTime;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error('截图编码失败'))),
          'image/png',
        ),
      );
      if (!mounted.current) return;
      target.time = capturedTime;
      setDraft({
        file: new File(
          [blob],
          `shot-${index + 1}-frame-${target.time.toFixed(3)}.png`,
          { type: 'image/png' },
        ),
        url: URL.createObjectURL(blob),
        target,
      });
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : '截图失败，请使用平台上传的视频',
        );
    } finally {
      captureLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function apply() {
    if (!draft || captureLock.current) return;
    captureLock.current = true;
    setBusy(true);
    setError('');
    try {
      await onApply(draft.file, draft.target);
      if (mounted.current) {
        setDraft(null);
        onClose();
      }
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : '关联失败，原首帧未改动');
    } finally {
      captureLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!source?.video}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="shot-video-dialog">
        <DialogHeader>
          <DialogTitle>视频预览 · {source?.title}</DialogTitle>
          <DialogDescription>
            可放大播放、全屏查看或打开保存目录，也可截帧作为下一分镜的首帧参考。
          </DialogDescription>
        </DialogHeader>
        <div className="actions">
          {source?.video && (
            <VideoFileButton
              media={source.video}
              projectId={project.id}
              name={source.title}
            />
          )}
          <Button
            disabled={!ready || !next || busy}
            onClick={() => {
              void capture(true);
            }}
          >
            {busy ? '正在处理…' : '截取末尾帧 → 下一镜头'}
          </Button>
          <Button
            variant="outline"
            disabled={!ready || !next || busy}
            onClick={() => {
              void capture(false);
            }}
          >
            截取当前帧
          </Button>
          <span className="helper">
            {next
              ? `目标：SHOT_${String(index + 2).padStart(3, '0')} · ${next.title}`
              : '这是最后一个镜头，请先添加下一镜头'}
          </span>
        </div>
        <video
          ref={videoRef}
          className="large-shot-player"
          controls
          playsInline
          preload="auto"
          src={source?.video?.url}
          onLoadedData={() => setReady(true)}
          onError={() => {
            setReady(false);
            setError('视频无法加载或格式不受支持');
          }}
        >
          <track kind="captions" label="镜头对白" src="data:text/vtt,WEBVTT" />
        </video>
        {error && <output className="frame-error">{error}</output>}
        {draft && (
          <section className="frame-capture-review">
            <Image
              unoptimized
              src={draft.url}
              width={640}
              height={360}
              alt="截取帧预览"
            />
            <div>
              <strong>截取于 {draft.target.time.toFixed(3)} 秒</strong>
              <p>
                {draft.target.previousFrameId
                  ? '下一镜头已有首帧，确认后将替换该参考图。'
                  : '确认后上传图片，并关联为下一镜头首帧。'}
              </p>
              <div className="actions">
                <Button
                  disabled={busy}
                  onClick={() => {
                    void apply();
                  }}
                >
                  {busy
                    ? '正在上传…'
                    : draft.target.previousFrameId
                      ? '确认替换下一镜头首帧'
                      : '设为下一镜头首帧'}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  放弃截图
                </Button>
              </div>
            </div>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
