import type { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { PermanentProcessingError } from '../../src/application/documents/processingErrors.js';
import { Document } from '../../src/domain/document/Document.js';
import { createS3Client } from '../../src/infrastructure/aws/clients.js';
import { PdfDocumentProcessor } from '../../src/infrastructure/pdf/PdfDocumentProcessor.js';
import { S3ObjectStorage } from '../../src/infrastructure/s3/S3ObjectStorage.js';

const AWS_ENDPOINT = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';
const S3_BUCKET = process.env.S3_BUCKET ?? 'studydocs-pdfs';

process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';

const s3Client: S3Client = createS3Client({ region: 'us-east-1', endpoint: AWS_ENDPOINT });
const storage = new S3ObjectStorage(s3Client, S3_BUCKET);
const processor = new PdfDocumentProcessor(storage);

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

describe('PdfDocumentProcessor (real S3 via LocalStack)', () => {
  it('succeeds for a file with a valid PDF header', async () => {
    const key = `documents/valid-${Date.now()}.pdf`;
    await storage.upload(key, Buffer.from('%PDF-1.4 fake content'), 'application/pdf');

    await expect(processor.process(documentWithStorageKey(key))).resolves.toBeUndefined();
  });

  it('throws PermanentProcessingError for a file without a PDF header', async () => {
    const key = `documents/invalid-${Date.now()}.pdf`;
    await storage.upload(key, Buffer.from('not actually a pdf'), 'application/pdf');

    await expect(processor.process(documentWithStorageKey(key))).rejects.toThrow(
      PermanentProcessingError,
    );
  });
});
