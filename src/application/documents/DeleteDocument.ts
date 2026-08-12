import type { DocumentRepository } from './DocumentRepository.js';
import type { ObjectStorage } from './ObjectStorage.js';
import type { SearchIndex } from './SearchIndex.js';
import { DocumentNotFoundError } from './errors.js';

// Deletes a document's file (if any was uploaded), its search index entry
// (if it ever got indexed), and its metadata record — in that order, so a
// failure partway through never leaves a search hit or a file pointing at
// metadata that no longer exists.
export class DeleteDocumentUseCase {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly storage: ObjectStorage,
    private readonly searchIndex: SearchIndex,
  ) {}

  async execute(documentId: string): Promise<void> {
    const document = await this.documents.findById(documentId);
    if (!document) {
      throw new DocumentNotFoundError(documentId);
    }

    const { storageKey } = document.toProps();
    if (storageKey) {
      await this.storage.delete(storageKey);
    }
    await this.searchIndex.delete(documentId);
    await this.documents.delete(documentId);
  }
}
