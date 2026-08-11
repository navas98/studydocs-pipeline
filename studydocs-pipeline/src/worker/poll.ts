import { DeleteMessageCommand, ReceiveMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { ProcessDocumentUseCase } from '../application/documents/ProcessDocument.js';
import { handleMessage } from './messageHandler.js';

const POLL_WAIT_SECONDS = 10;
const MAX_MESSAGES_PER_POLL = 5;

export async function pollOnce(
  sqsClient: SQSClient,
  queueUrl: string,
  useCase: ProcessDocumentUseCase,
): Promise<void> {
  const result = await sqsClient.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: MAX_MESSAGES_PER_POLL,
      WaitTimeSeconds: POLL_WAIT_SECONDS,
    }),
  );

  for (const message of result.Messages ?? []) {
    if (!message.Body || !message.ReceiptHandle) {
      continue;
    }

    const outcome = await handleMessage(useCase, message.Body);
    if (outcome === 'ack') {
      await sqsClient.send(
        new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }),
      );
    }
  }
}
