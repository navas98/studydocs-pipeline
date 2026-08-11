import type { FastifyInstance } from 'fastify';
import type { CompleteUploadUseCase } from '../../../application/documents/CompleteUpload.js';
import type { CreateDocumentUseCase } from '../../../application/documents/CreateDocument.js';
import type { DownloadDocumentFileUseCase } from '../../../application/documents/DownloadDocumentFile.js';
import type { GetDocumentUseCase } from '../../../application/documents/GetDocument.js';
import type { ListDocumentsUseCase } from '../../../application/documents/ListDocuments.js';
import type { RetryDocumentUseCase } from '../../../application/documents/RetryDocument.js';
import type { UpdateDocumentMetadataUseCase } from '../../../application/documents/UpdateDocumentMetadata.js';
import { toDocumentResponse } from '../documentMapper.js';

export interface DocumentRoutesDeps {
  createDocument: CreateDocumentUseCase;
  getDocument: GetDocumentUseCase;
  listDocuments: ListDocumentsUseCase;
  completeUpload: CompleteUploadUseCase;
  updateDocumentMetadata: UpdateDocumentMetadataUseCase;
  retryDocument: RetryDocumentUseCase;
  downloadDocumentFile: DownloadDocumentFileUseCase;
}

const ALLOWED_MIME_TYPES = new Set(['application/pdf']);

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

const errorResponseSchema = { type: 'object', properties: { error: { type: 'string' } } } as const;

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
          404: errorResponseSchema,
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

  app.patch(
    '/documents/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['version'],
          properties: {
            version: { type: 'integer', minimum: 0 },
            title: { type: 'string', minLength: 1 },
            subject: { type: 'string', minLength: 1 },
            university: { type: 'string', minLength: 1 },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
        response: {
          200: documentResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { id } = request.params as { id: string };
      const { version, ...fields } = request.body as {
        version: number;
        title?: string;
        subject?: string;
        university?: string;
        tags?: string[];
      };

      const document = await deps.updateDocumentMetadata.execute({
        documentId: id,
        expectedVersion: version,
        fields,
      });
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

  app.post(
    '/documents/:id/complete-upload',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          202: documentResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          415: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const uploadedFile = await request.file();
      if (!uploadedFile || !ALLOWED_MIME_TYPES.has(uploadedFile.mimetype)) {
        reply.code(415);
        return { error: 'Only application/pdf uploads are accepted' };
      }

      const fileBuffer = await uploadedFile.toBuffer();

      const document = await deps.completeUpload.execute({
        documentId: id,
        file: fileBuffer,
        mimeType: uploadedFile.mimetype,
        correlationId: request.id,
      });
      reply.code(202);
      return toDocumentResponse(document);
    },
  );

  app.get(
    '/documents/:id/file',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const file = await deps.downloadDocumentFile.execute(id);
      reply
        .header('Content-Type', file.mimeType)
        // inline (not attachment): clicking the link opens the PDF in a
        // new tab instead of forcing a download.
        .header('Content-Disposition', `inline; filename="${file.filename}"`);
      return file.buffer;
    },
  );

  app.post(
    '/documents/:id/retry',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          202: documentResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const document = await deps.retryDocument.execute(id, request.id);
      reply.code(202);
      return toDocumentResponse(document);
    },
  );
}
