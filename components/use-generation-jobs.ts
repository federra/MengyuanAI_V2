'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GenerationJob } from '@/lib/models';
import { mergeGenerationJob, VideoJobMonitor } from '@/lib/video-generation';
import { modelApi } from './model-settings';

// Shared by the submission dialog and its parent: acknowledgement updates the
// originating row immediately, and reopening restores persisted task states.
export function useGenerationJobs(projectId: string, enabled: boolean) {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const revision = useRef(0);
  const knownJobs = useRef<GenerationJob[]>([]);
  const [monitor] = useState(() => new VideoJobMonitor());
  useEffect(() => {
    knownJobs.current = jobs;
  }, [jobs]);
  const record = useCallback((job: GenerationJob) => {
    revision.current++;
    setJobs((old) => mergeGenerationJob(old, job));
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      void monitor.tick(
        knownJobs.current,
        (id) =>
          modelApi<GenerationJob>('/api/generations', {
            id,
            action: 'refresh',
          }),
        record,
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled, monitor, record]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      const started = revision.current;
      try {
        const rows = await modelApi<GenerationJob[]>(
          '/api/generations?projectId=' + encodeURIComponent(projectId),
        );
        // A response begun before a live acknowledgement/completion is stale.
        if (active && started === revision.current) {
          setJobs((old) => rows.reduce(mergeGenerationJob, old));
        }
      } catch {
        // Keep known states during a transient outage; never resubmit here.
      } finally {
        if (active) timer = setTimeout(load, 3000);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [projectId, enabled]);
  return { jobs: jobs.filter((j) => j.projectId === projectId), record };
}
