import type { Client, estypes } from '@elastic/elasticsearch';
import type {
  SearchIndex,
  SearchQuery,
  SearchResult,
} from '../../application/documents/SearchIndex.js';
import type { Document } from '../../domain/document/Document.js';
import { DOCUMENTS_INDEX } from './connection.js';

interface DocumentSearchBody {
  title: string;
  subject: string;
  university: string;
  tags: string[];
}

export class ElasticsearchSearchIndex implements SearchIndex {
  constructor(private readonly client: Client) {}

  async index(document: Document): Promise<void> {
    const props = document.toProps();
    const body: DocumentSearchBody = {
      title: props.title,
      subject: props.subject,
      university: props.university,
      tags: props.tags,
    };

    // refresh: 'wait_for' trades a little write latency for read-your-writes
    // consistency, which keeps demo/test behavior deterministic; a
    // higher-throughput system would rely on the default refresh interval.
    await this.client.index({
      index: DOCUMENTS_INDEX,
      id: document.id,
      document: body,
      refresh: 'wait_for',
    });
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const must: estypes.QueryDslQueryContainer[] = [];
    const filter: estypes.QueryDslQueryContainer[] = [];

    if (query.text) {
      must.push({
        multi_match: { query: query.text, fields: ['title', 'subject', 'university', 'tags'] },
      });
    }
    if (query.subject) {
      filter.push({ term: { 'subject.keyword': query.subject } });
    }
    if (query.university) {
      filter.push({ term: { 'university.keyword': query.university } });
    }

    const response = await this.client.search<DocumentSearchBody>({
      index: DOCUMENTS_INDEX,
      query: { bool: { must, filter } },
      from: query.offset,
      size: query.limit,
    });

    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : (response.hits.total?.value ?? 0);

    return {
      total,
      items: response.hits.hits.map((hit) => ({
        documentId: hit._id as string,
        title: hit._source?.title ?? '',
        subject: hit._source?.subject ?? '',
        university: hit._source?.university ?? '',
        tags: hit._source?.tags ?? [],
      })),
    };
  }
}
