import { Client } from '@elastic/elasticsearch';

export const DOCUMENTS_INDEX = 'documents';

export function createElasticsearchClient(node: string): Client {
  return new Client({ node });
}

// Explicit mapping per section 12: keyword sub-fields on subject/university
// allow exact-match filtering, while the default text analyzer on
// title/subject/university/tags backs the full-text query.
export async function ensureDocumentsIndex(client: Client): Promise<void> {
  const exists = await client.indices.exists({ index: DOCUMENTS_INDEX });
  if (exists) {
    return;
  }

  await client.indices.create({
    index: DOCUMENTS_INDEX,
    mappings: {
      properties: {
        title: { type: 'text' },
        subject: {
          type: 'text',
          fields: { keyword: { type: 'keyword' } },
        },
        university: {
          type: 'text',
          fields: { keyword: { type: 'keyword' } },
        },
        tags: { type: 'keyword' },
      },
    },
  });
}
