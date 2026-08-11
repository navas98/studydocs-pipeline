import { describe, expect, it } from 'vitest';
import { createWorkerMetrics, recordOutcome } from '../../src/worker/metrics.js';

describe('worker metrics', () => {
  it('starts all counters at zero', () => {
    expect(createWorkerMetrics()).toEqual({ indexed: 0, failed: 0, retrying: 0, skipped: 0 });
  });

  it('counts each outcome into its own bucket', () => {
    const metrics = createWorkerMetrics();

    recordOutcome(metrics, 'INDEXED');
    recordOutcome(metrics, 'INDEXED');
    recordOutcome(metrics, 'FAILED');
    recordOutcome(metrics, 'RETRYING');
    recordOutcome(metrics, 'SKIPPED_NOT_FOUND');
    recordOutcome(metrics, 'SKIPPED_ALREADY_TERMINAL');

    expect(metrics).toEqual({ indexed: 2, failed: 1, retrying: 1, skipped: 2 });
  });
});
