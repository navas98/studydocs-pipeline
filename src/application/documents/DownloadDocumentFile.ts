import type { DocumentRepository } from './DocumentRepository.js';
import type { ObjectStorage } from './ObjectStorage.js';
import { DocumentNotFoundError } from './errors.js';

export interface DownloadedFile {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

// Backs the "open the PDF" link in the minimal frontend (section 18, Day 5).
// Not part of the original section 9 API surface, but a natural extension
// once the frontend needed a way to actually view an uploaded file.
export class DownloadDocumentFileUseCase {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async execute(documentId: string): Promise<DownloadedFile> {
    const document = await this.documents.findById(documentId);
    if (!document) {
      throw new DocumentNotFoundError(documentId);
    }

    const props = document.toProps();
    if (!props.storageKey) {
      // No file uploaded yet (still CREATED) — same 404 shape as "not
      // found" from the client's point of view: there's nothing to open.
      throw new DocumentNotFoundError(documentId);
    }

    const buffer = await this.storage.download(props.storageKey);
    return {
      buffer,
      mimeType: props.mimeType ?? 'application/pdf',
      filename: `${props.title}.pdf`,
    };
  }
}
