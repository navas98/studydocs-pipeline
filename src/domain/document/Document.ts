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

  // Clones mutable fields for the same reason create()/toProps() do: a
  // repository adapter that hands back a cached/pooled props object (as
  // opposed to one freshly deserialized, like MongoDB's driver produces)
  // shouldn't end up aliased with this aggregate's internal state.
  static fromProps(props: DocumentProps): Document {
    return new Document({
      ...props,
      tags: [...props.tags],
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
      indexedAt: props.indexedAt ? new Date(props.indexedAt) : null,
    });
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

  get ownerId(): string {
    return this.props.ownerId;
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

  beginExtracting(): void {
    this.transitionTo('EXTRACTING');
  }

  beginChunking(): void {
    this.transitionTo('CHUNKING');
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

  // Manual retry (POST /documents/:id/retry, section 9): only valid from
  // FAILED. Resets processingAttempts so the document gets a full fresh
  // budget — a human triggered this, presumably because whatever caused
  // the failure has since been addressed.
  retryFromFailure(): void {
    this.transitionTo('QUEUED');
    this.props.processingAttempts = 0;
    this.props.failureReason = null;
  }

  // Metadata edits don't change `status`, but still bump `version` — the
  // field section 13 of the design doc uses for optimistic concurrency, so
  // two clients editing the same document can be told apart regardless of
  // whether the edit is a state transition or not.
  updateMetadata(fields: Partial<Pick<DocumentProps, 'title' | 'subject' | 'university' | 'tags'>>): void {
    if (fields.title !== undefined) {
      this.props.title = fields.title;
    }
    if (fields.subject !== undefined) {
      this.props.subject = fields.subject;
    }
    if (fields.university !== undefined) {
      this.props.university = fields.university;
    }
    if (fields.tags !== undefined) {
      this.props.tags = [...fields.tags];
    }
    this.props.version += 1;
    this.props.updatedAt = new Date();
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
