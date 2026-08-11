import type { ProcessDocumentOutcome } from '../application/documents/ProcessDocument.js';
import type { ProcessDocumentUseCase } from '../application/documents/ProcessDocument.js';

export interface ProcessingRequestedBody {
  documentId: string;
  correlationId: string;
}

export type MessageAction = 'ack' | 'requeue';

export interface MessageResult {
  action: MessageAction;
  outcome: ProcessDocumentOutcome;
}

// Outcomes that end the document's lifecycle (successfully or not) or that
// we've determined reprocessing can't help with (message points at a
// document that no longer exists) are acked so the message leaves the
// queue. RETRYING is deliberately left unacked: not deleting it lets SQS's
// visibility timeout + redrive policy handle backoff and eventual DLQ
// routing without duplicating that logic here.
export async function handleMessage(
  useCase: ProcessDocumentUseCase,
  rawBody: string,
): Promise<MessageResult> {
  const body = JSON.parse(rawBody) as ProcessingRequestedBody;
  const outcome = await useCase.execute(body.documentId, body.correlationId);

  const action: MessageAction = outcome === 'RETRYING' ? 'requeue' : 'ack';
  return { action, outcome };
}
