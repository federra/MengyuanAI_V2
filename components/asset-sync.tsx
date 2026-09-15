'use client';
import { readApiResponse, progressType } from '@/lib/api-response';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '@/lib/studio';
import {
  assetKinds,
  explicitAssets,
  mergeScriptAssets,
  parseAssetDrafts,
} from '@/lib/assets';
import { Button } from '@/components/ui/button';

export function AssetSync({
  project,
  ready,
  enabled,
  visible,
  onApply,
  onOpen,
}: {
  project: Project;
  ready: boolean;
  enabled: boolean;
  visible: boolean;
  onApply: (next: Project) => void;
  onOpen: () => void;
}) {
  const latest = useRef({ project, onApply });
  useEffect(() => {
    latest.current = { project, onApply };
  }, [project, onApply]);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const lastAttempt = useRef('');
  const script = project.script;
  const projectId = project.id;
  const scanned = project.assetScript;
  const mode = project.assetMode;
  useEffect(() => {
    if (
      !enabled ||
      !script.trim() ||
      (script === scanned && (!ready || mode === 'model') && retry === 0)
    )
      return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const attempt = JSON.stringify([projectId, script, ready, retry]);
      if (lastAttempt.current === attempt) return;
      lastAttempt.current = attempt;
      setPending(true);
      setFailed(false);
      setWarnings([]);
      setStatus('剧本已更新，正在整理资产…');
      try {
        let drafts = explicitAssets(script);
        if (ready) {
          const res = await fetch('/api/assets', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: progressType,
            },
            body: JSON.stringify({ script }),
            signal: controller.signal,
          });
          const data = (await readApiResponse(res, (seconds) => {
            if (!controller.signal.aborted)
              setStatus(`正在识别剧本资产，已等待${seconds}秒…`);
          })) as {
            error?: string;
            assets?: unknown;
            warnings?: string[];
          };
          if (!res.ok) throw Error(data.error || '资产识别失败');
          drafts = parseAssetDrafts(data, script);
          if (!controller.signal.aborted) setWarnings(data.warnings || []);
        }
        if (
          controller.signal.aborted ||
          latest.current.project.id !== projectId ||
          latest.current.project.script !== script
        )
          return;
        const next = mergeScriptAssets(
          latest.current.project,
          drafts,
          ready ? 'model' : 'labels',
        );
        latest.current.onApply(next);
        setStatus(
          ready
            ? `已整理${drafts.length}项剧本资产，请复核分类与设定。`
            : '已整理明确标签；配置文本模型后可自动识别剧本全文。',
        );
        setRetry(0);
      } catch (e) {
        if (!controller.signal.aborted) {
          setStatus(e instanceof Error ? e.message : '资产整理失败');
          setFailed(true);
          const drafts = explicitAssets(script);
          if (
            drafts.length &&
            latest.current.project.id === projectId &&
            latest.current.project.script === script
          )
            latest.current.onApply(
              mergeScriptAssets(latest.current.project, drafts, 'labels'),
            );
        }
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }, 1800);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setPending(false);
    };
  }, [script, projectId, scanned, mode, ready, enabled, retry]);
  if (!visible) return null;
  return (
    <section className="panel asset-summary">
      <div>
        <strong>剧本资产 · 自动分类管理</strong>
        <output className="helper">
          {pending
            ? status
            : failed
              ? status
              : !script.trim()
                ? '写入或导入剧本后自动整理。'
                : scanned !== script
                  ? '剧本已变化，资产等待重新整理。'
                  : mode === 'model'
                    ? '已根据当前剧本整理，请复核遗漏和设定。'
                    : '当前仅识别明确标签与带引号的对白角色；全文识别需要配置文本模型。'}
        </output>
      </div>
      {failed && scanned === script && mode === 'labels' && (
        <p className="helper">
          已保留剧本明确标注的资产，AI全文识别尚未完成；可手动重试。
        </p>
      )}
      {!!warnings.length && (
        <details className="helper">
          <summary>已保留有效资产，{warnings.length}项需要复核</summary>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="reference-list">
        {assetKinds
          .filter((k) => k !== '风格')
          .map((k) => (
            <span className="tag" key={k}>
              {k} {project.assets.filter((a) => a.kind === k).length}
            </span>
          ))}
      </div>
      <div className="actions">
        <Button
          variant="outline"
          disabled={pending || !enabled || !script.trim()}
          onClick={() => setRetry((n) => n + 1)}
        >
          重新整理资产
        </Button>
        <Button variant="outline" onClick={onOpen}>
          管理全部资产
        </Button>
      </div>
      {!ready && (
        <p className="helper">
          可先在剧本中使用“人物：小林；道具：信件；场景：车站；服饰：蓝色外套；声音：雨声”这样的标签。档案与参考图片、视频、声音素材分别管理；整理不会生成媒体文件。
        </p>
      )}
    </section>
  );
}
