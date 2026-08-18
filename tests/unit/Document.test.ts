import { describe, expect, it } from 'vitest';
import { Document } from '../../src/domain/document/Document.js';
import { InvalidDocumentTransitionError } from '../../src/domain/document/errors.js';

function createDocument(): Document {
  return Document.create({
    ownerId: 'owner-1',
    title: 'Apuntes de Álgebra',
    subject: 'Matemáticas',
    university: 'US',
    tags: ['algebra', 'examen'],
  });
}

describe('Document', () => {
  it('starts in CREATED with version 0 and no processing attempts', () => {
    const doc = createDocument();

    expect(doc.status).toBe('CREATED');
    expect(doc.version).toBe(0);
    expect(doc.processingAttempts).toBe(0);
  });

  it('follows the happy path CREATED -> UPLOADING -> QUEUED -> PROCESSING -> EXTRACTING -> CHUNKING -> INDEXED', () => {
    const doc = createDocument();

    doc.startUpload('s3://bucket/key.pdf', 'application/pdf', 1024);
    expect(doc.status).toBe('UPLOADING');

    doc.enqueue();
    expect(doc.status).toBe('QUEUED');

    doc.beginProcessing();
    expect(doc.status).toBe('PROCESSING');
    expect(doc.processingAttempts).toBe(1);

    doc.beginExtracting();
    expect(doc.status).toBe('EXTRACTING');

    doc.beginChunking();
    expect(doc.status).toBe('CHUNKING');

    doc.markIndexed();
    expect(doc.status).toBe('INDEXED');
  });

  it('rejects jumping straight from PROCESSING to INDEXED, skipping extraction and chunking', () => {
    const doc = createDocument();
    doc.startUpload('s3://bucket/key.pdf', 'application/pdf', 1024);
    doc.enqueue();
    doc.beginProcessing();

    expect(() => doc.markIndexed()).toThrow(InvalidDocumentTransitionError);
  });

  it('allows retrying or failing from either EXTRACTING or CHUNKING', () => {
    const extracting = createDocument();
    extracting.startUpload('s3://bucket/key.pdf', 'application/pdf', 1024);
    extracting.enqueue();
    extracting.beginProcessing();
    extracting.beginExtracting();
    extracting.retry('extraction blew up');
    expect(extracting.status).toBe('RETRYING');

    const chunking = createDocument();
    chunking.startUpload('s3://bucket/key.pdf', 'application/pdf', 1024);
    chunking.enqueue();
    chunking.beginProcessing();
    chunking.beginExtracting();
    chunking.beginChunking();
    chunking.fail('chunk storage blew up');
    expect(chunking.status).toBe('FAILED');
  });

  it('bumps version on every transition', () => {
    const doc = createDocument();

    doc.startUpload('s3://bucket/key.pdf', 'application/pdf', 1024);
    doc.enqueue();

    expect(doc.version).toBe(2);
  });

  it('rejects a transition that skips states', () => {
    const doc = createDocument();

    expect(() => doc.enqueue()).toThrow(InvalidDocumentTransitionError);
  });

  it('rejects transitions out of terminal states', () => {
    const doc = createDocument();
    doc.startUpload('s3://bucket/key.pdf', 'application/pdf', 1024);
    doc.enqueue();
    doc.beginProcessing();
    doc.beginExtracting();
    doc.beginChunking();
    doc.markIndexed();

    expect(() => doc.beginProcessing()).toThrow(InvalidDocumentTransitionError);
  });

  it('follows the retry path without duplicating a processing attempt on resume', () => {
    const doc = createDocument();
    doc.startUpload('s3://bucket/key.pdf', 'application/pdf', 1024);
    doc.enqueue();
    doc.beginProcessing();

    doc.retry('transient S3 timeout');
    expect(doc.status).toBe('RETRYING');

    doc.beginProcessing();
    expect(doc.status).toBe('PROCESSING');
    expect(doc.processingAttempts).toBe(2);
  });

  it('moves to FAILED once retries are exhausted and sanitizes the reason', () => {
    const doc = createDocument();
    doc.startUpload('s3://bucket/key.pdf', 'application/pdf', 1024);
    doc.enqueue();
    doc.beginProcessing();

    const longReason = 'x'.repeat(300);
    doc.fail(longReason);

    expect(doc.status).toBe('FAILED');
    expect(doc.toProps().failureReason).toHaveLength(203); // 200 chars + '...'
  });

  it('updates metadata fields and bumps the version without changing status', () => {
    const doc = createDocument();

    doc.updateMetadata({ title: 'Nuevo título', tags: ['nuevo-tag'] });

    expect(doc.status).toBe('CREATED');
    expect(doc.version).toBe(1);
    const props = doc.toProps();
    expect(props.title).toBe('Nuevo título');
    expect(props.tags).toEqual(['nuevo-tag']);
    expect(props.subject).toBe('Matemáticas'); // untouched fields are left as-is
  });

  it('does not let a caller mutate internal state via toProps()', () => {
    const doc = createDocument();

    const snapshot = doc.toProps();
    snapshot.tags.push('leaked');
    snapshot.updatedAt.setFullYear(1999);

    expect(doc.toProps().tags).toEqual(['algebra', 'examen']);
    expect(doc.toProps().updatedAt.getFullYear()).not.toBe(1999);
  });

  it('does not let a caller mutate internal state via the tags array passed to create()', () => {
    const tags = ['algebra'];
    const doc = Document.create({
      ownerId: 'owner-1',
      title: 'Apuntes',
      subject: 'Matemáticas',
      university: 'US',
      tags,
    });

    tags.push('leaked');

    expect(doc.toProps().tags).toEqual(['algebra']);
  });

  it('clears a previous failure reason once successfully indexed', () => {
    const doc = createDocument();
    doc.startUpload('s3://bucket/key.pdf', 'application/pdf', 1024);
    doc.enqueue();
    doc.beginProcessing();
    doc.retry('transient error');
    doc.beginProcessing();
    doc.beginExtracting();
    doc.beginChunking();
    doc.markIndexed();

    expect(doc.toProps().failureReason).toBeNull();
  });

  it('allows a manual retry from FAILED, resetting attempts and clearing the failure reason', () => {
    const doc = createDocument();
    doc.startUpload('s3://bucket/key.pdf', 'application/pdf', 1024);
    doc.enqueue();
    doc.beginProcessing();
    doc.fail('permanent error');
    expect(doc.processingAttempts).toBe(1);

    doc.retryFromFailure();

    expect(doc.status).toBe('QUEUED');
    expect(doc.processingAttempts).toBe(0);
    expect(doc.toProps().failureReason).toBeNull();
  });

  it('rejects a manual retry from a non-FAILED state', () => {
    const doc = createDocument();

    expect(() => doc.retryFromFailure()).toThrow(InvalidDocumentTransitionError);
  });
});
