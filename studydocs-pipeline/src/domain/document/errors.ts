import type { DocumentStatus } from './DocumentStatus.js';

export class InvalidDocumentTransitionError extends Error {
  constructor(
    public readonly from: DocumentStatus,
    public readonly to: DocumentStatus,
  ) {
    super(`Cannot transition document from ${from} to ${to}`);
    this.name = 'InvalidDocumentTransitionError';
  }
}
