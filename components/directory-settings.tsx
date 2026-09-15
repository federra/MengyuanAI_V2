'use client';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
type Settings = {
  workspaceDir: string;
  jianyingDraftDir: string;
  pendingWorkspaceDir?: string;
};
export function DirectorySettings({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState<Settings | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useEffect(
    () => window.directorDesktop?.onOpenSettings?.(() => onOpenChange(true)),
    [onOpenChange],
  );
  useEffect(() => {
    if (!open) return;
    setValue(null);
    setMessage('');
    const api = window.directorDesktop?.directories;
    if (!api) {
      setMessage('文件位置设置请在桌面版中使用');
      return;
    }
    let active = true;
    api('get')
      .then((v) => {
        if (active) {
          const s = v as Settings;
          setValue({
            ...s,
            workspaceDir: s.pendingWorkspaceDir || s.workspaceDir,
          });
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [open]);
  async function choose(key: 'workspaceDir' | 'jianyingDraftDir') {
    setBusy(true);
    setMessage('');
    try {
      const result = (await window.directorDesktop!.directories!('choose', {
        key,
      })) as { path: string | null };
      if (result.path) setValue((v) => (v ? { ...v, [key]: result.path! } : v));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '选择目录失败');
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const s = (await window.directorDesktop!.directories!(
        'save',
        value,
      )) as Settings;
      setMessage(
        s.pendingWorkspaceDir
          ? '已保存。下次启动时复制项目到新目录；原目录保留备份。'
          : '目录设置已保存。',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>系统设置 · 文件位置</DialogTitle>
          <DialogDescription>
            设置剪映草稿和本机项目的存放位置。
          </DialogDescription>
        </DialogHeader>
        {value && (
          <div className="grid gap-5">
            {(
              [
                ['jianyingDraftDir', '剪映草稿目录'],
                ['workspaceDir', '项目文件目录'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="grid gap-2">
                <strong>{label}</strong>
                <div className="break-all rounded-md border p-3 text-sm">
                  {value[key]}
                </div>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => choose(key)}
                >
                  选择目录
                </Button>
              </div>
            ))}
            <p className="text-sm text-muted-foreground">
              剪映目录设置保存后立即生效。项目目录包含本机数据库和素材，更换时请选择空目录，下次启动时迁移；迁移前请保存项目。
            </p>
            <Button disabled={busy} onClick={save}>
              {busy ? '处理中…' : '保存目录设置'}
            </Button>
          </div>
        )}
        {message && (
          <p role="status" className="break-all text-sm">
            {message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
