import { describe, expect, it } from 'vitest';
import { buildApp, type AppDeps } from '../../src/interfaces/http/app.js';

// Every route dependency needs to exist to satisfy AppDeps, but this test
// only ever hits /health, so unused ones are harmless stand-ins rather than
// real use case instances.
const unusedUseCase = {} as never;

function buildDeps(checkHealth: AppDeps['checkHealth']): AppDeps {
  return {
    createDocument: unusedUseCase,
    getDocument: unusedUseCase,
    listDocuments: unusedUseCase,
    completeUpload: unusedUseCase,
    searchDocuments: unusedUseCase,
    updateDocumentMetadata: unusedUseCase,
    retryDocument: unusedUseCase,
    downloadDocumentFile: unusedUseCase,
    deleteDocument: unusedUseCase,
    checkHealth,
    registerUser: unusedUseCase,
    loginUser: unusedUseCase,
    authMiddleware: async () => {},
  };
}

describe('/health route', () => {
  it('returns 200 when all dependencies are healthy', async () => {
    const app = await buildApp(buildDeps(async () => ({ mongo: 'ok', elasticsearch: 'ok' })));

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', checks: { mongo: 'ok', elasticsearch: 'ok' } });
    await app.close();
  });

  it('returns 503 when a dependency is unhealthy', async () => {
    const app = await buildApp(buildDeps(async () => ({ mongo: 'error', elasticsearch: 'ok' })));

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'error',
      checks: { mongo: 'error', elasticsearch: 'ok' },
    });
    await app.close();
  });
});
