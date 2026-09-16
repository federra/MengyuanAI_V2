'use client';
import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import type { SoftwareUpdateState } from '@/lib/software-update';
export function SoftwareUpdate() {
  const [state, setState] = useState<SoftwareUpdateState | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    const api = window.directorDesktop;
    const off = api?.onUpdateState?.((next) => {
      if (active) setState(next);
    });
    void Promise.resolve()
      .then(() => {
        if (!api?.updates)
          throw Error('软件更新请在支持更新功能的桌面版中使用。');
        return api.updates('get');
      })
      .then((next) => {
        if (active) setState(next);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      off?.();
    };
  }, []);
  async function run(action: 'check' | 'install') {
    setError('');
    setPending(true);
    try {
      const next = await window.directorDesktop!.updates!(action);
      setState(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新操作未完成，请重试。');
    } finally {
      setPending(false);
    }
  }
  const busy =
    pending ||
    (!!state &&
      ['checking', 'downloading', 'installing'].includes(state.status));
  const hasUpdate =
    !!state?.availableVersion &&
    ['available', 'downloaded', 'error'].includes(state.status);
  return (
    <section
      className="software-update border-t pt-5"
      aria-labelledby="software-update-title"
    >
      <h3 id="software-update-title" className="mb-4 text-base font-semibold">
        软件更新
      </h3>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">当前版本</dt>
          <dd className="mt-1 font-medium" data-update-current>
            {state?.currentVersion ? `v${state.currentVersion}` : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">可用版本</dt>
          <dd className="mt-1 font-medium" data-update-available>
            {state?.status === 'current'
              ? '无更新'
              : state?.availableVersion
                ? `v${state.availableVersion}`
                : '—'}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">更新内容</dt>
          <dd
            className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-md border p-3"
            data-update-notes
          >
            {state?.releaseNotes || '检查更新后显示版本更新内容。'}
          </dd>
        </div>
      </dl>
      {state?.status === 'downloading' && (
        <div className="mt-3">
          <progress
            className="w-full"
            max={100}
            value={state.progress}
            aria-label="更新下载进度"
          />
          <p className="text-sm">已下载 {Math.round(state.progress)}%</p>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={!state || busy || state.status === 'downloaded'}
          onClick={() => void run('check')}
        >
          {state?.status === 'checking' ? '检查中…' : '检查更新'}
        </Button>
        <Button
          disabled={(!state?.canInstall && !state?.canDownload) || !hasUpdate || busy}
          onClick={() => void run('install')}
        >
          {state?.status === 'downloading'
            ? '下载中…'
            : state?.status === 'installing'
              ? '准备安装…'
              : state?.canDownload ? '下载 Mac 更新包' : '下载并安装'}
        </Button>
      </div>
      {(error || state?.message) && (
        <output className="mt-3 block break-words text-sm">
          {error || state?.message}
        </output>
      )}
      {state && !state.canInstall && (
        <p className="mt-3 text-sm text-muted-foreground">
          {state.platform === 'darwin'
            ? 'Mac 更新包按当前芯片类型下载。保存项目并退出旧版后，解压并替换应用；已保存的项目和设置保留。'
            : '当前环境仅支持检查更新。自动安装请使用正式 Windows 安装版。'}
        </p>
      )}
      {state?.canInstall && (
        <p className="mt-3 text-sm text-muted-foreground">
          下载完成后会退出、安装新版并重新打开。请先保存项目；已保存的数据和设置会保留。
        </p>
      )}
    </section>
  );
}
