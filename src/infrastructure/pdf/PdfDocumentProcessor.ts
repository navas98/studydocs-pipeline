import { Chunk } from '../../domain/document/Chunk.js';
import type { Document } from '../../domain/document/Document.js';
import type { ChunkRepository } from '../../application/documents/ChunkRepository.js';
import { chunkPages } from '../../application/documents/chunking.js';
import type { DocumentProcessor, OnProcessingStage } from '../../application/documents/DocumentProcessor.js';
import type { DocumentTextExtractor } from '../../application/documents/DocumentTextExtractor.js';
import type { ObjectStorage } from '../../application/documents/ObjectStorage.js';
import type { SearchIndex } from '../../application/documents/SearchIndex.js';
import { PermanentProcessingError, TransientProcessingError } from '../../application/documents/processingErrors.js';

const PDF_MAGIC_BYTES = Buffer.from('%PDF');

// Validates the uploaded file is actually a PDF, extracts and chunks its
// text (v2 phase 2), then indexes metadata + full content in
// Elasticsearch (section 4.1, step 7: indexing happens before the
// document moves to INDEXED). Elasticsearch/Mongo write failures are
// treated as transient — the file itself was fine, so retrying should
// succeed once the dependency is reachable again.
export class PdfDocumentProcessor implements DocumentProcessor {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly searchIndex: SearchIndex,
    private readonly textExtractor: DocumentTextExtractor,
    private readonly chunks: ChunkRepository,
  ) {}

  async process(document: Document, onStage: OnProcessingStage): Promise<void> {
    const props = document.toProps();
    if (!props.storageKey) {
      throw new PermanentProcessingError('Document has no storageKey to process');
    }

    let file: Buffer;
    try {
      file = await this.storage.download(props.storageKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TransientProcessingError(`Failed to download PDF from storage: ${message}`);
    }

    if (!file.subarray(0, PDF_MAGIC_BYTES.length).equals(PDF_MAGIC_BYTES)) {
      throw new PermanentProcessingError('File does not have a valid PDF header');
    }

    await onStage('EXTRACTING');
    let extracted;
    try {
      extracted = await this.textExtractor.extract(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new PermanentProcessingError(`Failed to extract text from PDF: ${message}`);
    }

    await onStage('CHUNKING');
    const chunkInputs = chunkPages(extracted.pages);
    const chunkEntities = chunkInputs.map((input) =>
      Chunk.create({ documentId: document.id, ownerId: props.ownerId, ...input }),
    );

    try {
      // Re-processing (manual retry) regenerates chunks from scratch rather
      // than appending — a document always has exactly the chunks its most
      // recent successful extraction produced.
      await this.chunks.deleteByDocumentId(document.id);
      await this.chunks.saveMany(chunkEntities);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TransientProcessingError(`Failed to save chunks: ${message}`);
    }

    const content = chunkEntities.map((chunk) => chunk.content).join('\n\n');
    try {
      await this.searchIndex.index(document, content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TransientProcessingError(`Failed to index document: ${message}`);
    }
  }
}
