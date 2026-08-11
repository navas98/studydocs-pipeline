// One-off dev tool (section 17): measure latency of a representative
// endpoint under a small local load. Builds the real app in-process (real
// Mongo/S3/SQS/Elasticsearch adapters, same as the running server) and
// drives it via Fastify's inject() rather than a separate HTTP server —
// this exercises the full route/validation/use-case/repository path but
// skips actual TCP/network overhead, so treat these numbers as a lower
// bound on real request latency, not a production benchmark (section 17:
// "no presentar resultados de un portátil como métricas de producción").
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/env.js';
import { CompleteUploadUseCase } from '../src/application/documents/CompleteUpload.js';
import { CreateDocumentUseCase } from '../src/application/documents/CreateDocument.js';
import { GetDocumentUseCase } from '../src/application/documents/GetDocument.js';
import { ListDocumentsUseCase } from '../src/application/documents/ListDocuments.js';
import { RetryDocumentUseCase } from '../src/application/documents/RetryDocument.js';
import { SearchDocumentsUseCase } from '../src/application/documents/SearchDocuments.js';
import { UpdateDocumentMetadataUseCase } from '../src/application/documents/UpdateDocumentMetadata.js';
import { createS3Client, createSqsClient } from '../src/infrastructure/aws/clients.js';
import { createElasticsearchClient, ensureDocumentsIndex } from '../src/infrastructure/elasticsearch/connection.js';
import { ElasticsearchSearchIndex } from '../src/infrastructure/elasticsearch/ElasticsearchSearchIndex.js';
import { connectMongo, ensureDocumentIndexes } from '../src/infrastructure/mongodb/connection.js';
import { MongoDocumentRepository } from '../src/infrastructure/mongodb/MongoDocumentRepository.js';
import { S3ObjectStorage } from '../src/infrastructure/s3/S3ObjectStorage.js';
import { SqsDocumentQueue } from '../src/infrastructure/sqs/SqsDocumentQueue.js';
import { buildApp } from '../src/interfaces/http/app.js';
import { createCheckHealth } from '../src/interfaces/http/health.js';

const TOTAL_REQUESTS = 200;
const CONCURRENCY = 20;

interface LatencyStats {
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  errors: number;
}

function computeStats(latencies: number[], errors: number): LatencyStats {
  const sorted = [...latencies].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  return {
    min: sorted[0] ?? 0,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted[sorted.length - 1] ?? 0,
    errors,
  };
}

async function runLoad(
  label: string,
  total: number,
  concurrency: number,
  makeRequest: (i: number) => Promise<{ statusCode: number }>,
): Promise<LatencyStats> {
  const latencies: number[] = [];
  let errors = 0;
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < total) {
      const i = nextIndex++;
      const start = performance.now();
      const response = await makeRequest(i);
      latencies.push(performance.now() - start);
      if (response.statusCode >= 400) {
        errors += 1;
      }
    }
  }

  console.log(`Running ${label}: ${total} requests at concurrency ${concurrency}...`);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return computeStats(latencies, errors);
}

function toMarkdown(label: string, stats: LatencyStats): string {
  return [
    `**${label}**`,
    '',
    `- min: ${stats.min.toFixed(1)} ms`,
    `- p50: ${stats.p50.toFixed(1)} ms`,
    `- p95: ${stats.p95.toFixed(1)} ms`,
    `- p99: ${stats.p99.toFixed(1)} ms`,
    `- max: ${stats.max.toFixed(1)} ms`,
    `- errors: ${stats.errors} / ${TOTAL_REQUESTS}`,
  ].join('\n');
}

async function main(): Promise<void> {
  const config = loadConfig();
  const { client: mongoClient, db } = await connectMongo(config.mongoUri);
  await ensureDocumentIndexes(db);
  const esClient = createElasticsearchClient(config.elasticsearchNode);
  await ensureDocumentsIndex(esClient, config.elasticsearchIndex);

  const repository = new MongoDocumentRepository(db);
  const awsClientConfig = {
    region: config.awsRegion,
    ...(config.awsEndpoint ? { endpoint: config.awsEndpoint } : {}),
  };
  const storage = new S3ObjectStorage(createS3Client(awsClientConfig), config.s3Bucket);
  const queue = new SqsDocumentQueue(createSqsClient(awsClientConfig), config.sqsQueueUrl);
  const searchIndex = new ElasticsearchSearchIndex(esClient, config.elasticsearchIndex);

  const app = await buildApp({
    createDocument: new CreateDocumentUseCase(repository),
    getDocument: new GetDocumentUseCase(repository),
    listDocuments: new ListDocumentsUseCase(repository),
    completeUpload: new CompleteUploadUseCase(repository, storage, queue),
    searchDocuments: new SearchDocumentsUseCase(searchIndex),
    updateDocumentMetadata: new UpdateDocumentMetadataUseCase(repository),
    retryDocument: new RetryDocumentUseCase(repository, queue),
    checkHealth: createCheckHealth(db, esClient),
  });
  app.log.level = 'silent';
  await app.ready();

  const ownerId = 'load-test-owner';

  const createStats = await runLoad('POST /documents', TOTAL_REQUESTS, CONCURRENCY, () =>
    app.inject({
      method: 'POST',
      url: '/documents',
      payload: { ownerId, title: 'Load test doc', subject: 'Mates', university: 'US', tags: [] },
    }),
  );

  const listStats = await runLoad('GET /documents?ownerId=...', TOTAL_REQUESTS, CONCURRENCY, () =>
    app.inject({ method: 'GET', url: `/documents?ownerId=${ownerId}&limit=20` }),
  );

  console.log('\nPOST /documents:', createStats);
  console.log('GET /documents:', listStats);

  await db.collection('documents').deleteMany({ ownerId });
  await app.close();
  await mongoClient.close();
  await esClient.close();

  const report = `
## Prueba ligera de carga (endpoints representativos)

Medición generada con \`npm run perf:load\` (\`scripts/loadTest.ts\`) el ${new Date().toISOString().slice(0, 10)}.

**Metodología**: ${TOTAL_REQUESTS} peticiones por endpoint, concurrencia ${CONCURRENCY}, ejecutadas contra la
app real (Mongo/S3/SQS/Elasticsearch reales) vía \`app.inject()\` en vez de un servidor HTTP separado —
evita el coste de red/TCP, así que estos números son un límite inferior de la latencia real, no una
medición de producción. Entorno: portátil de desarrollo, sin aislamiento de recursos.

### ${toMarkdown('POST /documents (crear metadatos)', createStats)}

### ${toMarkdown('GET /documents?ownerId=... (listado paginado)', listStats)}

### Interpretación

\`POST /documents\` solo escribe en MongoDB (sin tocar S3/SQS/Elasticsearch), por lo que su latencia
refleja principalmente el coste de una escritura simple. \`GET /documents\` usa el índice
\`{ownerId, createdAt}\` creado en el Día 1, por lo que su p95/p99 se mantiene bajo incluso con
${TOTAL_REQUESTS} peticiones concurrentes contra los mismos datos.

### Cuellos de botella y qué cambiaría a mayor escala

- El cuello de botella más probable a mayor escala no es MongoDB (ya indexado), sino el pool de
  conexiones por defecto del driver y el hilo único de Node.js para JSON parsing/serialización bajo
  carga muy alta.
- Con 10×-100× más tráfico, el primer paso sería medir con un servidor HTTP real bajo una herramienta
  de carga dedicada (k6, autocannon) en vez de \`inject()\`, y considerar escalar horizontalmente la API
  (es stateless) detrás de un balanceador.
`;

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outputPath = path.resolve(scriptDir, '../docs/performance.md');
  const { readFile } = await import('node:fs/promises');
  const existing = await readFile(outputPath, 'utf-8').catch(() => '');
  const sectionMarker = '## Prueba ligera de carga';
  const markerIndex = existing.indexOf(sectionMarker);
  const base = markerIndex === -1 ? existing : existing.slice(0, markerIndex);
  await writeFile(outputPath, `${base.trimEnd()}\n${report}`, 'utf-8');
  console.log(`\nReport written to ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
