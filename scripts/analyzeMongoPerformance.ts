// One-off dev tool (section 17 of the design doc): seed a realistic volume
// of documents into a scratch database, then capture MongoDB's
// explain('executionStats') for the owner+date listing query before and
// after the {ownerId, createdAt} index exists, and write the comparison to
// docs/performance.md. Not part of the running app — run manually with
// `npm run perf:mongo`.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, type Document as MongoDocument } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/studydocs_perf';
const TOTAL_DOCUMENTS = 50_000;
const TARGET_OWNER_DOCUMENTS = 25;
const TARGET_OWNER_ID = 'perf-test-owner';

interface ExecutionSummary {
  stage: string;
  totalDocsExamined: number;
  totalKeysExamined: number;
  nReturned: number;
  executionTimeMillis: number;
}

function findStage(plan: MongoDocument): string {
  if (plan.stage) {
    return plan.inputStage ? `${plan.stage} -> ${findStage(plan.inputStage)}` : plan.stage;
  }
  return 'UNKNOWN';
}

function summarize(explainResult: MongoDocument): ExecutionSummary {
  const stats = explainResult.executionStats;
  return {
    stage: findStage(explainResult.queryPlanner.winningPlan),
    totalDocsExamined: stats.totalDocsExamined,
    totalKeysExamined: stats.totalKeysExamined,
    nReturned: stats.nReturned,
    executionTimeMillis: stats.executionTimeMillis,
  };
}

async function seed(collection: MongoDocument): Promise<void> {
  await collection.deleteMany({});
  const now = Date.now();
  const BATCH_SIZE = 1000;
  let batch: MongoDocument[] = [];

  for (let i = 0; i < TOTAL_DOCUMENTS; i++) {
    const isTargetOwner = i < TARGET_OWNER_DOCUMENTS;
    batch.push({
      _id: `perf-${i}`,
      ownerId: isTargetOwner ? TARGET_OWNER_ID : `owner-${i}`,
      title: `Documento de rendimiento ${i}`,
      subject: 'Matemáticas',
      university: 'Universidad de Sevilla',
      tags: [],
      storageKey: null,
      mimeType: null,
      sizeBytes: null,
      status: 'INDEXED',
      processingAttempts: 1,
      version: 4,
      createdAt: new Date(now - i * 1000),
      updatedAt: new Date(now - i * 1000),
      indexedAt: new Date(now - i * 1000),
      failureReason: null,
    });

    if (batch.length === BATCH_SIZE) {
      await collection.insertMany(batch);
      batch = [];
    }
  }
  if (batch.length > 0) {
    await collection.insertMany(batch);
  }
}

function toMarkdownSummary(label: string, summary: ExecutionSummary): string {
  return [
    `**${label}**`,
    '',
    `- Winning plan stage: \`${summary.stage}\``,
    `- Documents examined: ${summary.totalDocsExamined.toLocaleString('en-US')}`,
    `- Index keys examined: ${summary.totalKeysExamined.toLocaleString('en-US')}`,
    `- Documents returned: ${summary.nReturned}`,
    `- Execution time: ${summary.executionTimeMillis} ms`,
  ].join('\n');
}

async function main(): Promise<void> {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();
  const collection = db.collection('documents');

  await collection.dropIndexes().catch(() => {});

  console.log(`Seeding ${TOTAL_DOCUMENTS.toLocaleString('en-US')} documents into ${MONGO_URI}...`);
  await seed(collection);

  const query = { ownerId: TARGET_OWNER_ID };
  const sort = { createdAt: -1 };

  console.log('Running query WITHOUT index...');
  const before = summarize(await collection.find(query).sort(sort).explain('executionStats'));

  console.log('Creating index { ownerId: 1, createdAt: -1 }...');
  await collection.createIndex({ ownerId: 1, createdAt: -1 }, { name: 'ownerId_createdAt' });

  console.log('Running query WITH index...');
  const after = summarize(await collection.find(query).sort(sort).explain('executionStats'));

  console.log('\nBEFORE:', before);
  console.log('AFTER:', after);

  const report = `# Rendimiento: consulta de listado por propietario

Medición generada con \`npm run perf:mongo\` (\`scripts/analyzeMongoPerformance.ts\`) el ${new Date().toISOString().slice(0, 10)}.

## Contexto

La API expone \`GET /documents?ownerId=...\`, respaldada por \`MongoDocumentRepository.findByOwner()\`,
que consulta \`{ ownerId }\` ordenando por \`createdAt\` descendente. Es el patrón de acceso más frecuente
de la aplicación (un usuario listando sus propios documentos), documentado como tal en la sección 11
del documento de diseño.

## Metodología

- ${TOTAL_DOCUMENTS.toLocaleString('en-US')} documentos sembrados en una base de datos MongoDB local (Docker, \`mongo:7\`), de los cuales
  ${TARGET_OWNER_DOCUMENTS} pertenecen al propietario consultado — un ratio deliberadamente desfavorable
  (0.05%) para hacer visible el coste de un COLLSCAN.
- Se ejecuta \`explain('executionStats')\` sobre la misma consulta antes y después de crear el índice
  compuesto \`{ ownerId: 1, createdAt: -1 }\`.
- Entorno: portátil de desarrollo, MongoDB en Docker Desktop sin límites de recursos aplicados. **Estos
  números no son representativos de producción** (sección 17); lo relevante es la diferencia relativa
  entre ambos planes de ejecución, no los milisegundos absolutos.

## Resultados

### ${toMarkdownSummary('Antes del índice (COLLSCAN)', before)}

### ${toMarkdownSummary('Después del índice (IXSCAN)', after)}

## Interpretación

Sin el índice, MongoDB recorre la colección completa (\`${before.totalDocsExamined.toLocaleString('en-US')}\` documentos examinados para devolver solo ${before.nReturned}) porque no tiene forma de saltar directamente a los documentos del propietario buscado. Con el índice compuesto, el motor resuelve tanto el filtro por \`ownerId\` como el orden por \`createdAt\` directamente desde las entradas del índice, examinando ${after.totalKeysExamined.toLocaleString('en-US')} claves y ${after.totalDocsExamined.toLocaleString('en-US')} documentos — una reducción proporcional al tamaño de la colección, no al número de resultados.

## Coste del índice

Cada índice adicional tiene un coste de escritura (cada \`insertOne\`/\`replaceOne\` debe actualizar también
la entrada del índice) y de almacenamiento. Para esta colección, con escrituras poco frecuentes por
documento (creación, subida, unos pocos cambios de estado) frente a lecturas más frecuentes (listar,
consultar estado), el trade-off favorece claramente tener el índice.

## Qué cambiaría a mayor escala

- Con 10× más tráfico de lectura, este índice sigue siendo suficiente: el coste por consulta no depende
  del tráfico, solo del tamaño de la colección y el índice ya lo acota.
- Con 100× más documentos por propietario, la paginación (ya limitada a un máximo de 100 por página en
  \`ListDocumentsUseCase\`) seguiría acotando el trabajo por petición; el índice compuesto sigue sirviendo
  igual de bien porque \`createdAt\` ya está ordenado dentro de cada \`ownerId\`.
- Con una tasa de escritura mucho mayor (p. ej. miles de documentos/segundo), el coste de mantenimiento
  de este índice adicional empezaría a pesar más y merecería revisión, pero está fuera del alcance
  realista de esta demo de 5 días.
`;

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outputPath = path.resolve(scriptDir, '../docs/performance.md');
  await writeFile(outputPath, report, 'utf-8');
  console.log(`\nReport written to ${outputPath}`);

  await client.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
