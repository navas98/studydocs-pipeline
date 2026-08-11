import type { Document } from '../../domain/document/Document.js';

export interface DocumentProcessor {
  process(document: Document): Promise<void>;
}
