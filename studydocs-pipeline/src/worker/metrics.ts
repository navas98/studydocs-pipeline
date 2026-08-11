import type { ProcessDocumentOutcome } from '../application/documents/ProcessDocument.js';

// Success/failure counters (section 15). Kept in-process rather than
// exported over HTTP or to a metrics backend — proportionate to a 5-day
// demo; a real deployment would push these to Prometheus/CloudWatch/etc.
export interface WorkerMetrics {
  indexed: number;
  failed: number;
  retrying: number;
  skipped: number;
}

export function createWorkerMetrics(): WorkerMetrics {
  return { indexed: 0, failed: 0, retrying: 0, skipped: 0 };
}

export function recordOutcome(metrics: WorkerMetrics, outcome: ProcessDocumentOutcome): void {
  switch (outcome) {
    case 'INDEXED':
      metrics.indexed += 1;
      break;
    case 'FAILED':
      metrics.failed += 1;
      break;
    case 'RETRYING':
      metrics.retrying += 1;
      break;
    case 'SKIPPED_NOT_FOUND':
    case 'SKIPPED_ALREADY_TERMINAL':
      metrics.skipped += 1;
      break;
  }
}
