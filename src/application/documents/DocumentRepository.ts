import type { Document } from '../../domain/document/Document.js';

// Port implemented by infrastructure/mongodb. The application layer only
// knows about this interface, per section 7 of the design doc.
export interface DocumentRepository {
  save(document: Document): Promise<void>;
  findById(id: string): Promise<Document | null>;
  findByOwner(ownerId: string, options: { limit: number; offset: number }): Promise<Document[]>;
  // Persists `document` only if the stored record is still at
  // `expectedVersion`; returns false (without writing) if it has moved on,
  // meaning someone else updated it first. Kept separate from save() so the
  // rest of the app's writes (uploads, processing) don't pay for a
  // version-conditioned query they don't need — this is only exercised by
  // the metadata-update scenario in section 13.
  updateWithVersionCheck(document: Document, expectedVersion: number): Promise<boolean>;
  delete(id: string): Promise<void>;
}
