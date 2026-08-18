import type { SearchIndex, SearchResult } from './SearchIndex.js';

export interface SearchDocumentsQuery {
  ownerId: string;
  text?: string;
  subject?: string;
  university?: string;
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class SearchDocumentsUseCase {
  constructor(private readonly searchIndex: SearchIndex) {}

  async execute(query: SearchDocumentsQuery): Promise<SearchResult> {
    return this.searchIndex.search({
      ownerId: query.ownerId,
      ...(query.text !== undefined ? { text: query.text } : {}),
      ...(query.subject !== undefined ? { subject: query.subject } : {}),
      ...(query.university !== undefined ? { university: query.university } : {}),
      limit: Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT),
      offset: query.offset ?? 0,
    });
  }
}
