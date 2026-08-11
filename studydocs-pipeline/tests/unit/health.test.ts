import { describe, expect, it } from 'vitest';
import { createCheckHealth } from '../../src/interfaces/http/health.js';

function fakeDb(ok: boolean) {
  return { command: () => (ok ? Promise.resolve({}) : Promise.reject(new Error('down'))) } as never;
}

function fakeEsClient(ok: boolean) {
  return { ping: () => (ok ? Promise.resolve(true) : Promise.reject(new Error('down'))) } as never;
}

describe('createCheckHealth', () => {
  it('reports ok for both dependencies when they respond', async () => {
    const checkHealth = createCheckHealth(fakeDb(true), fakeEsClient(true));

    expect(await checkHealth()).toEqual({ mongo: 'ok', elasticsearch: 'ok' });
  });

  it('reports error only for the dependency that is down', async () => {
    const checkHealth = createCheckHealth(fakeDb(false), fakeEsClient(true));

    expect(await checkHealth()).toEqual({ mongo: 'error', elasticsearch: 'ok' });
  });

  it('reports error for both when both are down', async () => {
    const checkHealth = createCheckHealth(fakeDb(false), fakeEsClient(false));

    expect(await checkHealth()).toEqual({ mongo: 'error', elasticsearch: 'error' });
  });
});
