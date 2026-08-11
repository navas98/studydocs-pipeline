import type { Document } from '../../domain/document/Document.js';
import type { DocumentProcessor } from '../../application/documents/DocumentProcessor.js';
import type { ObjectStorage } from '../../application/documents/ObjectStorage.js';
import { PermanentProcessingError, TransientProcessingError } from '../../application/documents/processingErrors.js';

const PDF_MAGIC_BYTES = Buffer.from('%PDF');

// Placeholder for the real pipeline: for now this only validates the file
// actually looks like a PDF. Elasticsearch indexing is added in Day 3 once
// that adapter exists; this class will grow an indexing step then instead
// of a new one being introduced.
export class PdfDocumentProcessor implements DocumentProcessor {
  constructor(private readonly storage: ObjectStorage) {}

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
  }
}
