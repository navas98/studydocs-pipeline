import type { Document } from '../../domain/document/Document.js';

export type ProcessingStage = 'EXTRACTING' | 'CHUNKING';

// Lets the processor report progress through its internal pipeline without
// owning persistence itself — ProcessDocumentUseCase is still the only
// place that calls DocumentRepository.save(), it just does so on the
// processor's signal.
export type OnProcessingStage = (stage: ProcessingStage) => Promise<void>;

export interface DocumentProcessor {
  process(document: Document, onStage: OnProcessingStage): Promise<void>;
}
