import type { GenerationInput, GenerationJob } from './models';

export type ImageBatchRequest = {
  projectId: string;
  projectTitle: string;
  assetKind: string;
  modelName: string;
  concurrency: number;
  items: { id: string; name: string; input: GenerationInput }[];
};
export type ImageBatch = Omit<ImageBatchRequest, 'items'> & {
  id: string;
  createdAt: string;
  finished: boolean;
  items: (ImageBatchRequest['items'][number] & { job: GenerationJob })[];
};
export const activeImageStatus = (status: string) =>
  ['queued', 'submitting', 'running'].includes(status);

// Owned by the workbench, never by a settings dialog or the selected project.
// The original request stream stays open until its result has been consumed.
export class ImageBatchQueue {
  private batches: ImageBatch[] = [];
  constructor(
    private readonly run: (
      input: GenerationInput,
      id: string,
      accepted: (job: GenerationJob) => void,
    ) => Promise<GenerationJob>,
    private readonly changed: (batches: ImageBatch[]) => void,
    private readonly record: (job: GenerationJob) => void,
  ) {}

  start(request: ImageBatchRequest): string {
    if (
      !request.items.length ||
      request.items.length > 200 ||
      ![1, 2, 3].includes(request.concurrency)
    )
      throw Error('请选择需要生成的资产，并设置1至3个并发任务');
    const targets = new Set<string>();
    for (const item of request.items) {
      if (
        item.input.projectId !== request.projectId ||
        item.input.target !== 'asset' ||
        targets.has(item.input.targetId)
      )
        throw Error('批量生成目标无效或重复');
      targets.add(item.input.targetId);
      if (
        this.batches.some(
          (b) =>
            b.projectId === request.projectId &&
            b.items.some(
              (i) =>
                i.input.targetId === item.input.targetId &&
                activeImageStatus(i.job.status),
            ),
        )
      )
        throw Error(`${item.name}已在生成队列中，请勿重复提交`);
    }
    const snapshot = structuredClone(request);
    const createdAt = new Date().toISOString();
    const batch: ImageBatch = {
      ...snapshot,
      id: crypto.randomUUID(),
      createdAt,
      finished: false,
      items: snapshot.items.map((item) => ({
        ...item,
        job: {
          id: item.id,
          projectId: request.projectId,
          targetId: item.input.targetId,
          target: 'asset',
          status: 'queued',
          createdAt,
          model: request.modelName,
          prompt: item.input.prompt,
        },
      })),
    };
    this.batches = [...this.batches, batch];
    batch.items.forEach((item) => this.record(item.job));
    this.changed(this.batches);
    void this.execute(batch);
    return batch.id;
  }

  private update(batchId: string, job: GenerationJob) {
    this.batches = this.batches.map((b) =>
      b.id === batchId
        ? {
            ...b,
            items: b.items.map((item) =>
              item.id === job.id ? { ...item, job } : item,
            ),
          }
        : b,
    );
    this.record(job);
    this.changed(this.batches);
  }

  private async execute(batch: ImageBatch) {
    let cursor = 0;
    await Promise.all(
      Array.from(
        { length: Math.min(batch.concurrency, batch.items.length) },
        async () => {
          while (cursor < batch.items.length) {
            const item = batch.items[cursor++];
            try {
              this.update(batch.id, { ...item.job, status: 'submitting' });
              const job = await this.run(item.input, item.id, (accepted) =>
                this.update(batch.id, accepted),
              );
              this.update(batch.id, job);
            } catch (error) {
              this.update(batch.id, {
                ...item.job,
                status: 'attention',
                error:
                  (error instanceof Error
                    ? error.message
                    : '生成结果尚未确认') +
                  '；请核对任务记录，未自动重新提交。',
              });
            }
          }
        },
      ),
    );
    this.batches = this.batches.map((b) =>
      b.id === batch.id ? { ...b, finished: true } : b,
    );
    this.changed(this.batches);
  }
}
