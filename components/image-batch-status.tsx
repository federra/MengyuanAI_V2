'use client';
import { useState } from 'react';
import {
  LoaderCircle,
  Images,
  CheckCircle2,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { activeImageStatus, type ImageBatch } from '@/lib/image-batch-queue';

export function ImageBatchStatus({
  batches,
  onResults,
}: {
  batches: ImageBatch[];
  onResults: (batch: ImageBatch) => Promise<void>;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [showProgress, setShowProgress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const completed = batches.find(
    (b) => b.finished && !dismissed.includes(b.id),
  );
  const active = batches.filter((b) => !b.finished);
  const all = completed ? [completed] : active;
  const items = active.flatMap((b) => b.items);
  const done = items.filter((i) => !activeImageStatus(i.job.status)).length;
  function dismiss() {
    if (completed) setDismissed((ids) => [...ids, completed.id]);
    setShowProgress(false);
    setError('');
  }
  if (!batches.length) return null;
  return (
    <>
      {!!active.length && (
        <Button
          className="background-image-progress"
          variant="outline"
          onClick={() => setShowProgress(true)}
          aria-label={`后台生图，已处理${done}项，共${items.length}项`}
        >
          <LoaderCircle className="animate-spin" />
          后台生图{' '}
          <span>
            {done} / {items.length}
          </span>
        </Button>
      )}
      <Dialog
        open={!!completed || showProgress}
        onOpenChange={(open) => {
          if (!open && !busy) dismiss();
        }}
      >
        <DialogContent className="image-batch-dialog">
          <DialogHeader>
            <DialogTitle>
              {completed
                ? completed.items.every((i) => i.job.status === 'succeeded')
                  ? '批量生图已完成'
                  : '批量生图处理结果'
                : '图片正在后台生成'}
            </DialogTitle>
            <DialogDescription>
              {completed
                ? '本批次已处理完成。成功图片可在原项目中预览应用，未成功项请查看原因。'
                : '可以关闭此窗口，继续编辑或切换项目。请保持工作台应用运行。'}
            </DialogDescription>
          </DialogHeader>
          <div className="image-batch-list">
            {all.map((batch) => {
              const succeeded = batch.items.filter(
                (i) => i.job.status === 'succeeded',
              ).length;
              const attention = batch.items.filter(
                (i) =>
                  !activeImageStatus(i.job.status) &&
                  i.job.status !== 'succeeded',
              ).length;
              return (
                <section className="image-batch-summary" key={batch.id}>
                  <div className="image-batch-heading">
                    <Images />
                    <strong>
                      {batch.projectTitle} ·{' '}
                      {batch.assetKind === '人物' ? '角色' : batch.assetKind}
                    </strong>
                  </div>
                  <p>
                    共 {batch.items.length} 项 · 已生成 {succeeded} 项
                    {attention > 0 ? ` · 待核对 ${attention} 项` : ''}
                  </p>
                  <ul>
                    {batch.items.map((item) => (
                      <li key={item.id}>
                        {item.job.status === 'succeeded' ? (
                          <CheckCircle2 />
                        ) : activeImageStatus(item.job.status) ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <TriangleAlert />
                        )}
                        <span>{item.name}</span>
                        <small>
                          {item.job.status === 'queued'
                            ? '排队中'
                            : activeImageStatus(item.job.status)
                              ? '生成中'
                              : item.job.status === 'succeeded'
                                ? '已完成'
                                : '待核对'}
                        </small>
                      </li>
                    ))}
                  </ul>
                  {attention > 0 && (
                    <p className="helper">
                      部分任务需要核对，具体原因请查看任务记录；不会自动重复生成。
                    </p>
                  )}
                  <Button
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError('');
                      try {
                        await onResults(batch);
                        dismiss();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? '正在打开…' : '查看生成结果'}
                  </Button>
                </section>
              );
            })}
          </div>
          {error && <p role="alert">{error}</p>}
          <Button variant="outline" disabled={busy} onClick={dismiss}>
            {completed ? '稍后查看' : '继续创作'}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
