import { Client } from '@elastic/elasticsearch';

export function createElasticsearchClient(node: string): Client {
  return new Client({ node });
}

// Explicit mapping per section 12: keyword sub-fields on subject/university
// allow exact-match filtering (sorting/aggregations), while a custom
// analyzer on title/subject/university backs the full-text query and the
// match_phrase_prefix filters. asciifolding matters here because the
// content is Spanish: without it "fisica" would never match "Física".
//
// indexName is a parameter (not a hardcoded constant) so tests can point at
// a separate index (e.g. "documents_test") instead of sharing — and
// periodically clobbering — the one the dev server/worker use.
export async function ensureDocumentsIndex(client: Client, indexName: string): Promise<void> {
  const exists = await client.indices.exists({ index: indexName });
  if (exists) {
    return;
  }

  await client.indices.create({
    index: indexName,
    settings: {
      analysis: {
        analyzer: {
          spanish_folding: {
            type: 'custom',
            tokenizer: 'standard',
            filter: ['lowercase', 'asciifolding'],
          },
        },
      },
    },
    mappings: {
      properties: {
        ownerId: { type: 'keyword' },
        title: { type: 'text', analyzer: 'spanish_folding' },
        subject: {
          type: 'text',
          analyzer: 'spanish_folding',
          fields: { keyword: { type: 'keyword' } },
        },
        university: {
          type: 'text',
          analyzer: 'spanish_folding',
          fields: { keyword: { type: 'keyword' } },
        },
        tags: { type: 'keyword' },
        content: { type: 'text', analyzer: 'spanish_folding' },
      },
    },
  });
}
