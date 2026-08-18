export const DOCUMENT_STATUSES = [
  'CREATED',
  'UPLOADING',
  'QUEUED',
  'PROCESSING',
  'EXTRACTING',
  'CHUNKING',
  'RETRYING',
  'INDEXED',
  'FAILED',
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

// Explicit whitelist per section 4.2 of the design doc: happy path
// CREATED -> UPLOADING -> QUEUED -> PROCESSING -> EXTRACTING -> CHUNKING ->
// INDEXED, plus the error path (from any processing sub-stage) ->
// RETRYING -> PROCESSING | FAILED. FAILED -> QUEUED is the section 9 manual
// retry endpoint (POST /documents/:id/retry) — distinct from the automatic
// RETRYING loop, this is a human re-queuing a document that already
// exhausted its automatic attempts.
//
// EXTRACTING/CHUNKING were added in v2 phase 2 once real PDF text
// extraction and chunking existed as actual pipeline steps — not added
// ahead of time "in case", per the project's own YAGNI stance on state
// machines (see ADR-001).
const ALLOWED_TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  CREATED: ['UPLOADING'],
  UPLOADING: ['QUEUED'],
  QUEUED: ['PROCESSING'],
  PROCESSING: ['EXTRACTING', 'RETRYING', 'FAILED'],
  EXTRACTING: ['CHUNKING', 'RETRYING', 'FAILED'],
  CHUNKING: ['INDEXED', 'RETRYING', 'FAILED'],
  RETRYING: ['PROCESSING', 'FAILED'],
  INDEXED: [],
  FAILED: ['QUEUED'],
};

export function canTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
