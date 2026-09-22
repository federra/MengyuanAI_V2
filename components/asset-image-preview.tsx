'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import type { SoftwareUpdateState } from '@/lib/software-update';
import type { Media } from '@/lib/studio';

declare global {
  interface Window {
    directorDesktop?: {
      admin?: (action: string, input?: Record<string, unknown>) => Promise<{data?: unknown; error?: string}>;
      auth?: (action:string,input?:unknown)=>Promise<unknown>;
      onAuthState?: (callback:(state:import('@/lib/access').AccessState)=>void)=>()=>void;
      updates?: (
        action: 'get' | 'check' | 'install',
      ) => Promise<SoftwareUpdateState>;
      onUpdateState?: (
        callback: (state: SoftwareUpdateState) => void,
      ) => () => void;
      getVersion?: () => Promise<string>;
      directories?: (action: string, input?: unknown) => Promise<unknown>;
      exportJianying?: (input: unknown) => Promise<{
        ok: boolean;
        path: string;
        name: string;
        shots: number;
        duration: number;
      }>;
      onOpenSettings?: (callback: () => void) => () => void;
      doubao?: (action: string, data?: unknown) => Promise<unknown>;
      revealVideo?: (input: {
        projectId: string;
        mediaId: string;
        name: string;
      }) => Promise<{ ok: boolean }>;
      openDoubao?: () => Promise<{ ok: boolean }>;
      openDoubaoExtension?: () => Promise<{ ok: boolean }>;
      chooseImage?: (input: {projectId:string;mediaId?:string;name:string}) => Promise<{canceled?:boolean;media?:Media}>;
      revealImage: (input: {
        projectId: string;
        mediaId: string;
        name: string;
      }) => Promise<{ ok: boolean }>;
    };
  }
}

export function ImageFileButton({
  media,
  projectId,
  name,
  onSelect,
}: {
  onSelect?: (media:Media)=>void;
  media?: Media;
  projectId: string;
  name: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectRef = useRef(onSelect);
  useEffect(() => { selectRef.current = onSelect; return () => { selectRef.current = undefined; }; }, [onSelect]);
  const desktop = typeof window !== 'undefined' && !!window.directorDesktop;
  async function open() {
    if (busy || (!media && !onSelect)) return;
    setBusy(true);
    setError('');
    try {
      if (onSelect && window.directorDesktop) {
        if (!window.directorDesktop.chooseImage) throw Error('请重启更新后的桌面程序再选择图片');
        const result = await window.directorDesktop.chooseImage({projectId,mediaId:media?.id,name});
        if (result.media) selectRef.current?.(result.media);
      } else if (window.directorDesktop && media)
        await window.directorDesktop.revealImage({
          projectId,
          mediaId: media.id,
          name,
        });
      else if (media) {
        const response = await fetch(media.url);
        if (!response.ok) throw Error('图片下载失败，请稍后再试');
        const blob = await response.blob();
        const types: Record<string, string> = {
          'image/png': 'png',
          'image/jpeg': 'jpg',
          'image/webp': 'webp',
        };
        const ext = types[blob.type];
        if (!ext) throw Error('图片格式不可下载');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="image-file-action">
      <Button
        variant="outline"
        disabled={(!media && !onSelect) || busy}
        onClick={() => {
          if (onSelect && !desktop) {
            const input = document.createElement('input'); input.type='file'; input.accept='image/png,image/jpeg,image/webp';
            input.onchange=async()=>{
              const file=input.files?.[0]; if(!file)return;
              setBusy(true);setError('');
              try {
                const form=new FormData();form.append('file',file);
                const response=await fetch('/api/media',{method:'POST',body:form});
                if(!response.ok)throw Error('图片导入失败，请选择不超过50MB的PNG、JPG或WebP图片');
                const selected = await response.json() as Media; selectRef.current?.(selected);
              }catch(e){setError((e as Error).message);}finally{setBusy(false);}
            };input.click();
          } else void open();
        }}
        title={
          onSelect ? '选择历史图片并应用到当前资产' : desktop
            ? '导出到本机“图片 / AI短片导演”并选中该图片'
            : '网页版可下载图片，下载后在浏览器中打开所在文件夹'
        }
      >
        {busy ? '正在处理…' : onSelect || desktop ? '图片目录' : '下载图片'}
      </Button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

export function AssetImagePreview({
  media,
  name,
  projectId,
  onClose,
  returnLabel = '返回资产设置',
}: {
  media: Media;
  name: string;
  projectId: string;
  onClose: () => void;
  returnLabel?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const [naturalWidth, setNaturalWidth] = useState(1600);
  const [fitZoom, setFitZoom] = useState(1);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="asset-result-dialog asset-image-viewer">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            可放大查看细节，放大后滚动查看图片。
          </DialogDescription>
        </DialogHeader>
        {!failed && (
          <div className="image-zoom-controls" aria-label="图片缩放">
            <Button
              variant="outline"
              aria-label="缩小图片"
              disabled={(zoom ?? fitZoom) <= 0.25}
              onClick={() => setZoom(Math.max(0.25, (zoom ?? fitZoom) - 0.25))}
            >
              −
            </Button>
            <output aria-live="polite">
              {zoom === null ? '适应窗口' : `${Math.round(zoom * 100)}%`}
            </output>
            <Button
              variant="outline"
              aria-label="放大图片"
              disabled={(zoom ?? fitZoom) >= 3}
              onClick={() => setZoom(Math.min(3, (zoom ?? fitZoom) + 0.25))}
            >
              ＋
            </Button>
            <Button variant="outline" onClick={() => setZoom(1)}>
              原始大小
            </Button>
            <Button variant="outline" onClick={() => setZoom(null)}>
              适应窗口
            </Button>
          </div>
        )}
        {failed ? (
          <p role="alert">图片暂时无法读取，请确认图片仍保存在当前工作台。</p>
        ) : (
          <section className="asset-image-viewport" aria-label="图片查看区域">
            <Image
              unoptimized
              src={media.url}
              alt={name}
              width={1600}
              height={1000}
              className="asset-result-preview"
              style={
                zoom === null
                  ? undefined
                  : {
                      width: naturalWidth * zoom,
                      maxWidth: 'none',
                      maxHeight: 'none',
                    }
              }
              onLoad={(e) => {
                const img = e.currentTarget;
                setNaturalWidth(img.naturalWidth);
                setFitZoom(
                  Math.min(
                    img.clientWidth / img.naturalWidth,
                    img.clientHeight / img.naturalHeight,
                    1,
                  ),
                );
              }}
              onError={() => setFailed(true)}
            />
          </section>
        )}
        <div className="actions">
          <ImageFileButton media={media} projectId={projectId} name={name} />
          <Button variant="outline" onClick={onClose}>
            {returnLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
