import { randomUUID } from 'node:crypto';
import { canTransition, type DocumentStatus } from './DocumentStatus.js';
import { InvalidDocumentTransitionError } from './errors.js';

export interface CreateDocumentInput {
  ownerId: string;
  title: string;
  subject: string;
  university: string;
  tags: string[];
}

export interface DocumentProps {
  id: string;
  ownerId: string;
  title: string;
  subject: string;
  university: string;
  tags: string[];
  storageKey: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  status: DocumentStatus;
  processingAttempts: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  indexedAt: Date | null;
  failureReason: string | null;
}

// Aggregate root for the document lifecycle described in section 4.2 and 8
// of the design doc. Transitions are the only way to change `status`; every
// transition is checked against the whitelist in DocumentStatus.ts so an
// invalid jump (e.g. CREATED -> INDEXED) fails fast in the domain layer
// instead of leaking into infrastructure or the API.
export class Document {
  private constructor(private props: DocumentProps) {}

  static create(input: CreateDocumentInput): Document {
    const now = new Date();
    return new Document({
      id: randomUUID(),
      ownerId: input.ownerId,
      title: input.title,
      subject: input.subject,
      university: input.university,
      tags: [...input.tags],
      storageKey: null,
      mimeType: null,
      sizeBytes: null,
      status: 'CREATED',
      processingAttempts: 0,
      version: 0,
      createdAt: now,
      updatedAt: now,
      indexedAt: null,
      failureReason: null,
    });
  }

  static fromProps(props: DocumentProps): Document {
    return new Document(props);
  }

  toProps(): DocumentProps {
    return {
      ...this.props,
      tags: [...this.props.tags],
      createdAt: new Date(this.props.createdAt),
      updatedAt: new Date(this.props.updatedAt),
      indexedAt: this.props.indexedAt ? new Date(this.props.indexedAt) : null,
    };
  }

  get id(): string {
    return this.props.id;
  }

  get status(): DocumentStatus {
    return this.props.status;
  }

  get version(): number {
    return this.props.version;
  }

  get processingAttempts(): number {
    return this.props.processingAttempts;
  }

  startUpload(storageKey: string, mimeType: string, sizeBytes: number): void {
    this.transitionTo('UPLOADING');
    this.props.storageKey = storageKey;
    this.props.mimeType = mimeType;
    this.props.sizeBytes = sizeBytes;
  }

  enqueue(): void {
    this.transitionTo('QUEUED');
  }

  beginProcessing(): void {
    this.transitionTo('PROCESSING');
    this.props.processingAttempts += 1;
  }

  markIndexed(indexedAt: Date = new Date()): void {
    this.transitionTo('INDEXED');
    this.props.indexedAt = indexedAt;
    this.props.failureReason = null;
  }

  retry(reason: string): void {
    this.transitionTo('RETRYING');
    this.props.failureReason = sanitizeFailureReason(reason);
  }

  fail(reason: string): void {
    this.transitionTo('FAILED');
    this.props.failureReason = sanitizeFailureReason(reason);
  }

  private transitionTo(next: DocumentStatus): void {
    if (!canTransition(this.props.status, next)) {
      throw new InvalidDocumentTransitionError(this.props.status, next);
    }
    this.props.status = next;
    this.props.version += 1;
    this.props.updatedAt = new Date();
  }
}

// Failure reasons come from worker/infra errors and may contain stack
// traces or paths; section 14 of the design doc requires the API to never
// leak internal error detail, so we truncate at the domain boundary.
function sanitizeFailureReason(reason: string): string {
  const MAX_LENGTH = 200;
  return reason.length > MAX_LENGTH ? `${reason.slice(0, MAX_LENGTH)}...` : reason;
}
