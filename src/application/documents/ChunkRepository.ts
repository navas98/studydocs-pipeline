import type { Chunk } from '../../domain/document/Chunk.js';

export interface ChunkRepository {
  saveMany(chunks: Chunk[]): Promise<void>;
  findByDocumentId(documentId: string): Promise<Chunk[]>;
  deleteByDocumentId(documentId: string): Promise<void>;
}
