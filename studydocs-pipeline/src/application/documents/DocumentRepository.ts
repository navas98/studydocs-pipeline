import type { Document } from '../../domain/document/Document.js';

// Port implemented by infrastructure/mongodb. The application layer only
// knows about this interface, per section 7 of the design doc.
export interface DocumentRepository {
  save(document: Document): Promise<void>;
  findById(id: string): Promise<Document | null>;
  findByOwner(ownerId: string, options: { limit: number; offset: number }): Promise<Document[]>;
}
