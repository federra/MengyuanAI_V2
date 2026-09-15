'use client';
import { useState } from 'react';
import Image from 'next/image';
import type { Shot } from '@/lib/studio';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
export function FirstFrameControl({
  shot,
  disabled,
  onUpload,
  onRemove,
}: {
  shot: Shot;
  disabled: boolean;
  onUpload: () => void;
  onRemove: () => void;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <section className="shot-first-frame">
      <strong>首帧参考 · 可自定义</strong>
      {shot.firstFrame ? (
        <button
          className="first-frame-preview"
          onClick={() => setPreview(true)}
          aria-label={`预览${shot.title}首帧`}
        >
          <Image
            unoptimized
            src={shot.firstFrame.url}
            width={320}
            height={180}
            alt={`${shot.title}首帧参考图`}
          />
        </button>
      ) : (
        <p className="helper">
          上传自己的图片，或从上一镜头截取。无需先上传视频。
        </p>
      )}
      {shot.firstFrame && (
        <p className="helper">
          {shot.firstFrameSource
            ? `截帧来源：${shot.firstFrameSource.time.toFixed(3)} 秒`
            : '自定义上传'}
        </p>
      )}
      <Button disabled={disabled} variant="outline" onClick={onUpload}>
        {shot.firstFrame ? '替换首帧图' : '上传自定义首帧'}
      </Button>
      {shot.firstFrame && (
        <Button disabled={disabled} variant="ghost" onClick={onRemove}>
          移除首帧引用
        </Button>
      )}
      <Dialog open={preview && !!shot.firstFrame} onOpenChange={setPreview}>
        <DialogContent className="blocking-dialog">
          <DialogHeader>
            <DialogTitle>{shot.title} · 首帧参考</DialogTitle>
            <DialogDescription>
              可替换为自己的图片，也可以移除后重新选择。
            </DialogDescription>
          </DialogHeader>
          {shot.firstFrame && (
            <Image
              unoptimized
              src={shot.firstFrame.url}
              width={1000}
              height={700}
              className="blocking-preview"
              alt="首帧参考大图"
            />
          )}
          <Button disabled={disabled} onClick={onUpload}>
            替换首帧图
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
