import type { Document } from '../../domain/document/Document.js';

export interface SearchQuery {
  text?: string;
  subject?: string;
  university?: string;
  limit: number;
  offset: number;
}

export interface SearchResultItem {
  documentId: string;
  title: string;
  subject: string;
  university: string;
  tags: string[];
}

export interface SearchResult {
  items: SearchResultItem[];
  total: number;
}

export interface SearchIndex {
  index(document: Document): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult>;
  // Idempotent: deleting a document that was never indexed (e.g. it never
  // got past CREATED) is not an error.
  delete(documentId: string): Promise<void>;
}
