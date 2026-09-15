'use client';
import { useState } from 'react';
import type { GenerationJob } from '@/lib/models';
import {
  ImageBatchQueue,
  type ImageBatch,
  type ImageBatchRequest,
} from '@/lib/image-batch-queue';
import { modelApi } from './model-settings';

export function useImageBatches(record: (job: GenerationJob) => void) {
  const [batches, setBatches] = useState<ImageBatch[]>([]);
  // The caller supplies useGenerationJobs.record, whose identity is stable.
  const [queue] = useState(
    () =>
      new ImageBatchQueue(
        (input, id, accepted) =>
          modelApi<GenerationJob>('/api/generations', { id, input }, accepted),
        setBatches,
        record,
      ),
  );
  return {
    batches,
    start: (request: ImageBatchRequest) => queue.start(request),
    active: batches.some((b) => !b.finished),
  };
}
