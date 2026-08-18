import type { Document } from '../../domain/document/Document.js';

export interface SearchQuery {
  // Required, and always taken from the authenticated user, never from
  // client input — otherwise a crafted query could search across other
  // users' private documents.
  ownerId: string;
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
  // content is the concatenated, cleaned text of the document's chunks
  // (v2 phase 2) — optional so callers indexing before extraction exists
  // (or re-indexing metadata only) don't need to thread an empty string
  // through everywhere.
  index(document: Document, content?: string): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult>;
  // Idempotent: deleting a document that was never indexed (e.g. it never
  // got past CREATED) is not an error.
  delete(documentId: string): Promise<void>;
}
