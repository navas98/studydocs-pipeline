import type { FastifyInstance } from 'fastify';
import type { SearchDocumentsUseCase } from '../../../application/documents/SearchDocuments.js';

export interface SearchRoutesDeps {
  searchDocuments: SearchDocumentsUseCase;
}

export function registerSearchRoutes(app: FastifyInstance, deps: SearchRoutesDeps): void {
  app.get(
    '/search',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            subject: { type: 'string' },
            university: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            offset: { type: 'integer', minimum: 0 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              total: { type: 'integer' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    documentId: { type: 'string' },
                    title: { type: 'string' },
                    subject: { type: 'string' },
                    university: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const query = request.query as {
        text?: string;
        subject?: string;
        university?: string;
        limit?: number;
        offset?: number;
      };
      return deps.searchDocuments.execute(query);
    },
  );
}
