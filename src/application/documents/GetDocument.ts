import type { Document } from '../../domain/document/Document.js';
import type { DocumentRepository } from './DocumentRepository.js';

export class GetDocumentUseCase {
  constructor(private readonly documents: DocumentRepository) {}

  async execute(id: string): Promise<Document | null> {
    return this.documents.findById(id);
  }
}
