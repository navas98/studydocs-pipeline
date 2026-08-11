export class DocumentNotFoundError extends Error {
  constructor(public readonly documentId: string) {
    super(`Document not found: ${documentId}`);
    this.name = 'DocumentNotFoundError';
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
