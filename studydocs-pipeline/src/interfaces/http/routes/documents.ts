import type { FastifyInstance } from 'fastify';
import type { CreateDocumentUseCase } from '../../../application/documents/CreateDocument.js';
import type { GetDocumentUseCase } from '../../../application/documents/GetDocument.js';
import type { ListDocumentsUseCase } from '../../../application/documents/ListDocuments.js';
import { toDocumentResponse } from '../documentMapper.js';

export interface DocumentRoutesDeps {
  createDocument: CreateDocumentUseCase;
  getDocument: GetDocumentUseCase;
  listDocuments: ListDocumentsUseCase;
}

const documentResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    ownerId: { type: 'string' },
    title: { type: 'string' },
    subject: { type: 'string' },
    university: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    status: { type: 'string' },
    processingAttempts: { type: 'integer' },
    version: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    indexedAt: { type: ['string', 'null'], format: 'date-time' },
    failureReason: { type: ['string', 'null'] },
  },
} as const;

export function registerDocumentRoutes(app: FastifyInstance, deps: DocumentRoutesDeps): void {
  app.post(
    '/documents',
    {
      schema: {
        body: {
          type: 'object',
          required: ['ownerId', 'title', 'subject', 'university'],
          properties: {
            ownerId: { type: 'string', minLength: 1 },
            title: { type: 'string', minLength: 1 },
            subject: { type: 'string', minLength: 1 },
            university: { type: 'string', minLength: 1 },
            tags: { type: 'array', items: { type: 'string' }, default: [] },
          },
        },
        response: { 201: documentResponseSchema },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        ownerId: string;
        title: string;
        subject: string;
        university: string;
        tags?: string[];
      };
      const document = await deps.createDocument.execute({ ...body, tags: body.tags ?? [] });
      reply.code(201);
      return toDocumentResponse(document);
    },
  );

  app.get(
    '/documents/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          200: documentResponseSchema,
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const document = await deps.getDocument.execute(id);
      if (!document) {
        reply.code(404);
        return { error: 'Document not found' };
      }
      return toDocumentResponse(document);
    },
  );

  app.get(
    '/documents',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['ownerId'],
          properties: {
            ownerId: { type: 'string', minLength: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            offset: { type: 'integer', minimum: 0 },
          },
        },
        response: {
          200: { type: 'array', items: documentResponseSchema },
        },
      },
    },
    async (request) => {
      const query = request.query as { ownerId: string; limit?: number; offset?: number };
      const documents = await deps.listDocuments.execute(query);
      return documents.map(toDocumentResponse);
    },
  );
}
