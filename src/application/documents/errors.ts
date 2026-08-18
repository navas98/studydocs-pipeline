export class DocumentNotFoundError extends Error {
  constructor(public readonly documentId: string) {
    super(`Document not found: ${documentId}`);
    this.name = 'DocumentNotFoundError';
  }
}

// A document exists but belongs to someone else. Deliberately distinct
// from DocumentNotFoundError (403 vs 404) rather than hiding ownership
// behind a fake 404 — simpler to reason about for a 2-user app where
// leaking "this id exists" isn't a meaningful risk.
export class ForbiddenError extends Error {
  constructor() {
    super('You do not have access to this document');
    this.name = 'ForbiddenError';
  }
}

// Raised when a client's expectedVersion doesn't match the document's
// current version — either it was already stale when the request was
// made, or another update won a race in between. See section 13.
export class ConcurrencyConflictError extends Error {
  constructor(
    public readonly documentId: string,
    public readonly expectedVersion: number,
  ) {
    super(`Document ${documentId} was updated by someone else (expected version ${expectedVersion})`);
    this.name = 'ConcurrencyConflictError';
  }
}
