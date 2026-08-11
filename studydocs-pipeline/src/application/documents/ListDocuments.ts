import type { Document } from '../../domain/document/Document.js';
import type { DocumentRepository } from './DocumentRepository.js';

export interface ListDocumentsQuery {
  ownerId: string;
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class ListDocumentsUseCase {
  constructor(private readonly documents: DocumentRepository) {}

  async execute(query: ListDocumentsQuery): Promise<Document[]> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = query.offset ?? 0;
    return this.documents.findByOwner(query.ownerId, { limit, offset });
  }
}
