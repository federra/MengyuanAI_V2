'use client';
import { useEffect, useState } from 'react';
import { SoftwareUpdate } from './software-update';
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
    const api = window.directorDesktop?.directories;
    let active = true;
    Promise.resolve()
      .then(() => {
        if (!api) throw Error('文件位置设置请在桌面版中使用');
        return api('get');
      })
      .then((v) => {
        if (active) {
          setMessage('');
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
      <DialogContent className="system-settings-dialog sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>系统设置</DialogTitle>
          <DialogDescription>管理文件位置及桌面软件更新。</DialogDescription>
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
          <output className="block break-all text-sm">{message}</output>
        )}
        <SoftwareUpdate />
      </DialogContent>
    </Dialog>
  );
}
