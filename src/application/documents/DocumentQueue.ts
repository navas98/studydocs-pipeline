export interface ProcessingRequestedMessage {
  documentId: string;
  correlationId: string;
}

export interface DocumentQueue {
  publishProcessingRequested(message: ProcessingRequestedMessage): Promise<void>;
}
