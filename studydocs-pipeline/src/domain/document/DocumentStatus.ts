export const DOCUMENT_STATUSES = [
  'CREATED',
  'UPLOADING',
  'QUEUED',
  'PROCESSING',
  'RETRYING',
  'INDEXED',
  'FAILED',
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

// Explicit whitelist per section 4.2 of the design doc: happy path
// CREATED -> UPLOADING -> QUEUED -> PROCESSING -> INDEXED, plus the
// error path PROCESSING -> RETRYING -> PROCESSING | FAILED. FAILED -> QUEUED
// is the section 9 manual retry endpoint (POST /documents/:id/retry) —
// distinct from the automatic RETRYING loop, this is a human re-queuing a
// document that already exhausted its automatic attempts.
const ALLOWED_TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  CREATED: ['UPLOADING'],
  UPLOADING: ['QUEUED'],
  QUEUED: ['PROCESSING'],
  PROCESSING: ['INDEXED', 'RETRYING', 'FAILED'],
  RETRYING: ['PROCESSING', 'FAILED'],
  INDEXED: [],
  FAILED: ['QUEUED'],
};

export function canTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
