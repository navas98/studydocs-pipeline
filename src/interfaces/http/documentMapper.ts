import type { Document } from '../../domain/document/Document.js';

// JSON-safe representation of a Document for HTTP responses.
export function toDocumentResponse(document: Document) {
  const props = document.toProps();
  return {
    id: props.id,
    ownerId: props.ownerId,
    title: props.title,
    subject: props.subject,
    university: props.university,
    tags: props.tags,
    status: props.status,
    processingAttempts: props.processingAttempts,
    version: props.version,
    createdAt: props.createdAt.toISOString(),
    updatedAt: props.updatedAt.toISOString(),
    indexedAt: props.indexedAt ? props.indexedAt.toISOString() : null,
    failureReason: props.failureReason,
  };
}
