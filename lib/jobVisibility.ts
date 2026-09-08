import type { Mode, PendingJob } from './types';

export function runningJobCount(jobs: readonly PendingJob[]): number {
  return jobs.filter(job => !job.error).length;
}

/** Failed queue entries remain dismissible, but cannot obscure later work. */
export function mainViewerJob(jobs: readonly PendingJob[], mode: Mode, minimized: ReadonlySet<string>, latestResultAt?: number, historySelected = false): PendingJob | undefined {
  const current = jobs.filter(job => job.mode === mode).sort((a,b) => b.startedAt - a.startedAt);
  const running = current.filter(job => !job.error);
  const visible = running.find(job => !minimized.has(job.id));
  if (visible) return visible;
  if (running.length || historySelected) return undefined;
  const failed = current.find(job => Boolean(job.error));
  return failed && (latestResultAt === undefined || failed.startedAt > latestResultAt) ? failed : undefined;
}
