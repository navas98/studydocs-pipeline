import type { Document } from '../../domain/document/Document.js';
import type { DocumentProcessor } from '../../application/documents/DocumentProcessor.js';
import type { ObjectStorage } from '../../application/documents/ObjectStorage.js';
import type { SearchIndex } from '../../application/documents/SearchIndex.js';
import { PermanentProcessingError, TransientProcessingError } from '../../application/documents/processingErrors.js';

const PDF_MAGIC_BYTES = Buffer.from('%PDF');

// Validates the uploaded file is actually a PDF, then indexes its metadata
// in Elasticsearch (section 4.1, step 7: indexing happens before the
// document moves to INDEXED). A failed index write is treated as
// transient — the file itself was fine, so retrying should succeed once
// Elasticsearch is reachable again.
export class PdfDocumentProcessor implements DocumentProcessor {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly searchIndex: SearchIndex,
  ) {}

  async process(document: Document): Promise<void> {
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

    try {
      await this.searchIndex.index(document);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TransientProcessingError(`Failed to index document: ${message}`);
    }
  }
}
