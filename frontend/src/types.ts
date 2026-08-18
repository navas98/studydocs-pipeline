export type DocumentStatus =
  | 'CREATED'
  | 'UPLOADING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'EXTRACTING'
  | 'CHUNKING'
  | 'RETRYING'
  | 'INDEXED'
  | 'FAILED';

export interface DocumentDto {
  id: string;
  ownerId: string;
  title: string;
  subject: string;
  university: string;
  tags: string[];
  status: DocumentStatus;
  processingAttempts: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  indexedAt: string | null;
  failureReason: string | null;
}

export interface SearchHit {
  documentId: string;
  title: string;
  subject: string;
  university: string;
  tags: string[];
}

export interface SearchResult {
  total: number;
  items: SearchHit[];
}

export const NON_TERMINAL_STATUSES = new Set<DocumentStatus>([
  'UPLOADING',
  'QUEUED',
  'PROCESSING',
  'EXTRACTING',
  'CHUNKING',
  'RETRYING',
]);
