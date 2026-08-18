import type { S3Client } from '@aws-sdk/client-s3';
import type { Db, MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PermanentProcessingError } from '../../src/application/documents/processingErrors.js';
import { Document } from '../../src/domain/document/Document.js';
import { createS3Client } from '../../src/infrastructure/aws/clients.js';
import {
  createElasticsearchClient,
  ensureDocumentsIndex,
} from '../../src/infrastructure/elasticsearch/connection.js';
import { ElasticsearchSearchIndex } from '../../src/infrastructure/elasticsearch/ElasticsearchSearchIndex.js';
import { connectMongo, ensureChunkIndexes } from '../../src/infrastructure/mongodb/connection.js';
import { MongoChunkRepository } from '../../src/infrastructure/mongodb/MongoChunkRepository.js';
import { PdfDocumentProcessor } from '../../src/infrastructure/pdf/PdfDocumentProcessor.js';
import { PdfTextExtractor } from '../../src/infrastructure/pdf/PdfTextExtractor.js';
import { S3ObjectStorage } from '../../src/infrastructure/s3/S3ObjectStorage.js';

const AWS_ENDPOINT = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';
const S3_BUCKET = process.env.S3_BUCKET ?? 'studydocs-pdfs';
const ELASTICSEARCH_NODE = process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200';
const ELASTICSEARCH_INDEX = process.env.ELASTICSEARCH_INDEX ?? 'documents_test';
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/studydocs_test';

process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';

const s3Client: S3Client = createS3Client({ region: 'us-east-1', endpoint: AWS_ENDPOINT });
const storage = new S3ObjectStorage(s3Client, S3_BUCKET);
const esClient = createElasticsearchClient(ELASTICSEARCH_NODE);

let mongoClient: MongoClient;
let db: Db;
let processor: PdfDocumentProcessor;
let chunkRepository: MongoChunkRepository;

beforeAll(async () => {
  await ensureDocumentsIndex(esClient, ELASTICSEARCH_INDEX);
  ({ client: mongoClient, db } = await connectMongo(MONGO_URI));
  await ensureChunkIndexes(db);
  chunkRepository = new MongoChunkRepository(db);
  processor = new PdfDocumentProcessor(
    storage,
    new ElasticsearchSearchIndex(esClient, ELASTICSEARCH_INDEX),
    new PdfTextExtractor(),
    chunkRepository,
  );
});

afterAll(async () => {
  await mongoClient.close();
});

function documentWithStorageKey(storageKey: string): Document {
  const document = Document.create({
    ownerId: 'owner-1',
    title: 'Apuntes',
    subject: 'Mates',
    university: 'US',
    tags: [],
  });
  document.startUpload(storageKey, 'application/pdf', 10);
  document.enqueue();
  return document;
}

// A structurally valid single-page PDF with a real text content stream —
// unlike a bare "%PDF-1.4 ..." blob, this actually parses under pdfjs-dist
// (via pdf-parse), which is what real text extraction needs.
function minimalValidPdf(text: string): Buffer {
  const escaped = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = `BT /F1 18 Tf 50 750 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 595 842] /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let out = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(out, 'latin1');
}

describe('PdfDocumentProcessor (real S3 + Elasticsearch + Mongo)', () => {
  it('succeeds for a file with a valid PDF header, extracting and chunking its text', async () => {
    const key = `documents/valid-${Date.now()}.pdf`;
    await storage.upload(key, minimalValidPdf('Apuntes de Algebra Lineal'), 'application/pdf');
    const document = documentWithStorageKey(key);

    const stages: string[] = [];
    await processor.process(document, async (stage) => {
      stages.push(stage);
    });

    expect(stages).toEqual(['EXTRACTING', 'CHUNKING']);
    const chunks = await chunkRepository.findByDocumentId(document.id);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.content).toContain('Apuntes de Algebra Lineal');
  });

  it('throws PermanentProcessingError for a file without a PDF header', async () => {
    const key = `documents/invalid-${Date.now()}.pdf`;
    await storage.upload(key, Buffer.from('not actually a pdf'), 'application/pdf');

    await expect(processor.process(documentWithStorageKey(key), async () => {})).rejects.toThrow(
      PermanentProcessingError,
    );
  });
});
