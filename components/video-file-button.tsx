'use client';
import { useState } from 'react';
import { FolderOpen, Download } from 'lucide-react';
import { Button } from './ui/button';
import type { Media } from '@/lib/studio';

export function VideoFileButton({
  media,
  projectId,
  name,
  iconOnly = false,
}: {
  media: Media;
  projectId: string;
  name: string;
  iconOnly?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const desktop =
    typeof window !== 'undefined' && !!window.directorDesktop?.revealVideo;
  async function open() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (window.directorDesktop?.revealVideo) {
        await window.directorDesktop.revealVideo({
          projectId,
          mediaId: media.id,
          name,
        });
      } else {
        const response = await fetch(media.url);
        if (!response.ok) throw Error('视频下载失败，请稍后重试');
        const blob = await response.blob();
        const ext = (
          {
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'video/quicktime': 'mov',
          } as Record<string, string>
        )[blob.type];
        if (!ext || !blob.size) throw Error('视频内容或格式无效');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 80)}.${ext}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="video-file-action">
      <Button
        variant="outline"
        data-tooltip={desktop ? '打开保存目录' : '下载视频'}
        aria-label={busy ? '正在保存视频' : desktop ? '打开保存目录' : '下载视频'}
        disabled={busy}
        onClick={() => void open()}
        title={
          desktop
            ? '保存到本机“视频 / AI短片导演 / 当前项目”，并在文件夹中选中视频'
            : '下载后可在浏览器下载列表中打开所在文件夹'
        }
      >
        {desktop ? <FolderOpen /> : <Download />}
        {!iconOnly && (busy ? '正在保存…' : desktop ? '打开保存目录' : '下载视频')}
      </Button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
