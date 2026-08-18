import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { CompleteUploadUseCase } from '../../../application/documents/CompleteUpload.js';
import type { CreateDocumentUseCase } from '../../../application/documents/CreateDocument.js';
import type { DeleteDocumentUseCase } from '../../../application/documents/DeleteDocument.js';
import type { DownloadDocumentFileUseCase } from '../../../application/documents/DownloadDocumentFile.js';
import { ForbiddenError } from '../../../application/documents/errors.js';
import type { GetDocumentUseCase } from '../../../application/documents/GetDocument.js';
import type { ListDocumentsUseCase } from '../../../application/documents/ListDocuments.js';
import type { RetryDocumentUseCase } from '../../../application/documents/RetryDocument.js';
import type { UpdateDocumentMetadataUseCase } from '../../../application/documents/UpdateDocumentMetadata.js';
import type { Document } from '../../../domain/document/Document.js';
import { NON_TERMINAL_STATUSES } from '../../../domain/document/DocumentStatus.js';
import { toDocumentResponse } from '../documentMapper.js';

// How often an open /documents/:id/events connection re-checks the
// document for a status change. Simple poll-and-diff rather than Mongo
// change streams (which need a replica set we don't run) — good enough
// at this scale and avoids adding infra just for this.
const SSE_POLL_INTERVAL_MS = 1000;

export interface DocumentRoutesDeps {
  createDocument: CreateDocumentUseCase;
  getDocument: GetDocumentUseCase;
  listDocuments: ListDocumentsUseCase;
  completeUpload: CompleteUploadUseCase;
  updateDocumentMetadata: UpdateDocumentMetadataUseCase;
  retryDocument: RetryDocumentUseCase;
  downloadDocumentFile: DownloadDocumentFileUseCase;
  deleteDocument: DeleteDocumentUseCase;
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

function currentUserId(request: FastifyRequest): string {
  // Guaranteed present: these routes only run behind the auth preHandler
  // hook registered in app.ts, which sets request.user or throws first.
  return request.user!.id;
}

// A document not owned by the caller behaves like it doesn't exist for
// GET/read purposes would be one option, but this app is small enough
// (two real users) that a clear 403 is more useful for debugging than
// hiding behind a fake 404.
function assertOwnership(document: Document, userId: string): void {
  if (document.ownerId !== userId) {
    throw new ForbiddenError();
  }
}

export function registerDocumentRoutes(app: FastifyInstance, deps: DocumentRoutesDeps): void {
  app.post(
    '/documents',
    {
      schema: {
        body: {
          type: 'object',
          required: ['title', 'subject', 'university'],
          properties: {
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
        title: string;
        subject: string;
        university: string;
        tags?: string[];
      };
      const document = await deps.createDocument.execute({
        ...body,
        tags: body.tags ?? [],
        ownerId: currentUserId(request),
      });
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
      assertOwnership(document, currentUserId(request));
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

      const existing = await deps.getDocument.execute(id);
      if (existing) {
        assertOwnership(existing, currentUserId(request));
      }

      const document = await deps.updateDocumentMetadata.execute({
        documentId: id,
        expectedVersion: version,
        fields,
      });
      return toDocumentResponse(document);
    },
  );

  app.get(
    '/me/documents',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
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
      const query = request.query as { limit?: number; offset?: number };
      const documents = await deps.listDocuments.execute({ ...query, ownerId: currentUserId(request) });
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

      const existing = await deps.getDocument.execute(id);
      if (existing) {
        assertOwnership(existing, currentUserId(request));
      }

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

      const existing = await deps.getDocument.execute(id);
      if (existing) {
        assertOwnership(existing, currentUserId(request));
      }

      const file = await deps.downloadDocumentFile.execute(id);
      reply
        .header('Content-Type', file.mimeType)
        // inline (not attachment): clicking the link opens the PDF in a
        // new tab instead of forcing a download.
        .header('Content-Disposition', `inline; filename="${file.filename}"`);
      return file.buffer;
    },
  );

  app.get(
    '/documents/:id/events',
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

      const existing = await deps.getDocument.execute(id);
      if (!existing) {
        reply.code(404);
        return { error: 'Document not found' };
      }
      assertOwnership(existing, currentUserId(request));

      // Takes over the raw response for a long-lived stream — Fastify's
      // normal reply lifecycle (onSend hooks, schema serialization) does
      // not apply past this point.
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      let lastPayload: string | null = null;
      const send = (document: Document): void => {
        const payload = JSON.stringify(toDocumentResponse(document));
        if (payload === lastPayload) return;
        lastPayload = payload;
        reply.raw.write(`data: ${payload}\n\n`);
      };

      send(existing);
      if (!NON_TERMINAL_STATUSES.has(existing.status)) {
        reply.raw.end();
        return;
      }

      const interval = setInterval(() => {
        void (async () => {
          const document = await deps.getDocument.execute(id);
          if (!document) {
            clearInterval(interval);
            reply.raw.end();
            return;
          }
          send(document);
          if (!NON_TERMINAL_STATUSES.has(document.status)) {
            clearInterval(interval);
            reply.raw.end();
          }
        })();
      }, SSE_POLL_INTERVAL_MS);

      request.raw.on('close', () => clearInterval(interval));
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

      const existing = await deps.getDocument.execute(id);
      if (existing) {
        assertOwnership(existing, currentUserId(request));
      }

      const document = await deps.retryDocument.execute(id, request.id);
      reply.code(202);
      return toDocumentResponse(document);
    },
  );

  app.delete(
    '/documents/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: {
          204: { type: 'null' },
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await deps.getDocument.execute(id);
      if (existing) {
        assertOwnership(existing, currentUserId(request));
      }

      await deps.deleteDocument.execute(id);
      reply.code(204);
    },
  );
}
