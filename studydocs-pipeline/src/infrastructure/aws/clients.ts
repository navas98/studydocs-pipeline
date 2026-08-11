import { S3Client } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';

export interface AwsClientConfig {
  region: string;
  endpoint?: string;
}

// `endpoint` is set to point at LocalStack in local/dev/test; omitted in a
// real AWS deployment where the SDK resolves the regional endpoint itself.
export function createS3Client(config: AwsClientConfig): S3Client {
  return new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
  });
}

export function createSqsClient(config: AwsClientConfig): SQSClient {
  return new SQSClient({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  });
}
