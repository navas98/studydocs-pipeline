import type { Client, estypes } from '@elastic/elasticsearch';
import type {
  SearchIndex,
  SearchQuery,
  SearchResult,
} from '../../application/documents/SearchIndex.js';
import type { Document } from '../../domain/document/Document.js';

interface DocumentSearchBody {
  ownerId: string;
  title: string;
  subject: string;
  university: string;
  tags: string[];
  content?: string;
}

export class ElasticsearchSearchIndex implements SearchIndex {
  constructor(
    private readonly client: Client,
    private readonly indexName: string,
  ) {}

  async index(document: Document, content?: string): Promise<void> {
    const props = document.toProps();
    const body: DocumentSearchBody = {
      ownerId: props.ownerId,
      title: props.title,
      subject: props.subject,
      university: props.university,
      tags: props.tags,
      ...(content !== undefined ? { content } : {}),
    };

    // refresh: 'wait_for' trades a little write latency for read-your-writes
    // consistency, which keeps demo/test behavior deterministic; a
    // higher-throughput system would rely on the default refresh interval.
    await this.client.index({
      index: this.indexName,
      id: document.id,
      document: body,
      refresh: 'wait_for',
    });
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const must: estypes.QueryDslQueryContainer[] = [];
    const filter: estypes.QueryDslQueryContainer[] = [{ term: { ownerId: query.ownerId } }];

    if (query.text) {
      must.push({
        multi_match: { query: query.text, fields: ['title', 'subject', 'university', 'tags', 'content'] },
      });
    }
    // match_phrase_prefix instead of an exact term match on the .keyword
    // subfield: these are free-text inputs in the demo UI, so "Sevilla"
    // should find "Universidad de Sevilla" rather than requiring the full,
    // exact, case-sensitive university name.
    if (query.subject) {
      filter.push({ match_phrase_prefix: { subject: query.subject } });
    }
    if (query.university) {
      filter.push({ match_phrase_prefix: { university: query.university } });
    }

    const response = await this.client.search<DocumentSearchBody>({
      index: this.indexName,
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

  async delete(documentId: string): Promise<void> {
    // ignore 404: a document that never made it to INDEXED (still
    // CREATED/QUEUED/FAILED) was never written here, so "already gone" is
    // the expected outcome, not an error. refresh: 'wait_for' matches
    // index() — without it, a search right after a delete can still see
    // the "deleted" document until the next refresh interval.
    await this.client.delete(
      { index: this.indexName, id: documentId, refresh: 'wait_for' },
      { ignore: [404] },
    );
  }
}
