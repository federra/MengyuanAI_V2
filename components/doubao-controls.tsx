'use client';
import { useState, useSyncExternalStore } from 'react';
import { DoubaoManager } from './doubao-manager';
import { Button } from './ui/button';
import { doubaoBundle } from '@/lib/doubao';
import { download } from '@/lib/export';
import type { Project, Shot, Media } from '@/lib/studio';
const subscribeDesktop = () => () => {};
export function DoubaoControls({
  project,
  shotIds,
  onEdit,
}: {
  project: Project;
  shotIds: string[];
  onEdit: (patch: Partial<Shot>, id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    () => !!window.directorDesktop?.doubao,
    () => false,
  );
  const [message, setMessage] = useState('');
  async function exportTasks() {
    setBusy(true);
    setMessage('正在打包提示词与参考图…');
    try {
      const bundle = await doubaoBundle(project, shotIds);
      download(
        `${project.title}-豆包任务.json`,
        JSON.stringify(bundle),
        'application/json',
      );
      setMessage(
        `已导出${bundle.tasks.length}个分镜，请在 Chrome 插件中导入任务包。`,
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function chrome() {
    try {
      if (window.directorDesktop?.openDoubao)
        await window.directorDesktop.openDoubao();
      else window.open('https://www.doubao.com/chat/', '_blank', 'noopener');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function result(file: File) {
    setBusy(true);
    setMessage('');
    try {
      if (file.size > 72 * 1024 * 1024)
        throw Error('结果包过大，请直接上传视频');
      const data = JSON.parse(await file.text());
      if (
        data.format !== 'director-doubao-result' ||
        data.version !== 1 ||
        data.projectId !== project.id ||
        !project.shots.some((s) => s.id === data.shotId)
      )
        throw Error('结果包不属于当前项目或原分镜已删除');
      if (
        !['video/mp4', 'video/webm'].includes(data.mime) ||
        typeof data.base64 !== 'string' ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64)
      )
        throw Error('结果包视频格式无效');
      const raw = atob(data.base64);
      if (!raw.length || raw.length > 50 * 1024 * 1024)
        throw Error('视频必须为1字节至50MB');
      const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const form = new FormData();
      form.set(
        'file',
        new File(
          [bytes],
          `${String(data.videoName || '豆包视频')
            .replace(/[\\/:*?"<>|]/g, '_')
            .slice(0, 150)}`,
          { type: data.mime },
        ),
      );
      const response = await fetch('/api/media', {
        method: 'POST',
        body: form,
      });
      const media = (await response.json()) as Media & { error?: string };
      if (!response.ok) throw Error(media.error || '视频导入失败');
      onEdit(
        { video: media, trimStart: 0, videoPendingJobId: undefined },
        data.shotId,
      );
      setMessage('视频已返回对应分镜的预览区，请保存项目。');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (desktop) return <DoubaoManager project={project} shotIds={shotIds} />;
  return (
    <div className="doubao-controls">
      <p>
        多账号管理请使用桌面版；网页版保留任务包传递。当前选择 {shotIds.length}{' '}
        个分镜
      </p>
      <ol>
        <li>
          下载插件并解压，在 Chrome
          的扩展程序页面开启开发者模式，选择“加载已解压的扩展程序”。
        </li>
        <li>用 Chrome 登录豆包，打开视频创作页面。</li>
        <li>
          导出任务包，在插件中导入；按图片编号上传参考图并填写提示词，核对后在豆包提交。
        </li>
      </ol>
      <div className="actions">
        <a className="tag" href="/doubao-extension.zip" download>
          下载 Chrome 插件
        </a>
        <Button variant="outline" onClick={() => void chrome()}>
          打开豆包登录
        </Button>
        {typeof window !== 'undefined' &&
          window.directorDesktop?.openDoubaoExtension && (
            <Button
              variant="outline"
              onClick={() =>
                window.directorDesktop!.openDoubaoExtension!().catch((e) =>
                  setMessage(e.message),
                )
              }
            >
              打开插件目录
            </Button>
          )}
      </div>
      <Button
        disabled={busy || !shotIds.length}
        onClick={() => void exportTasks()}
      >
        {busy ? '处理中…' : '导出豆包任务包'}
      </Button>
      <label className="field">
        <span>导入插件导出的结果包（视频返回原分镜）</span>
        <input
          type="file"
          accept=".json"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void result(f);
            e.target.value = '';
          }}
        />
      </label>
      <p className="helper">
        首版支持任务包、按序参考图、提示词填入和结果包回传。登录、图片上传及最终提交在
        Chrome 中完成；当前不自动监控豆包生成进度。未选择分镜时使用当前分镜。
      </p>
      <output aria-live="polite">{message}</output>
    </div>
  );
}
