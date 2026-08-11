import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type {
  DocumentQueue,
  ProcessingRequestedMessage,
} from '../../application/documents/DocumentQueue.js';

export class SqsDocumentQueue implements DocumentQueue {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
  ) {}

  async publishProcessingRequested(message: ProcessingRequestedMessage): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
      }),
    );
  }
}
