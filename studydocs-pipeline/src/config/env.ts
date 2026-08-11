export interface AppConfig {
  port: number;
  mongoUri: string;
  awsRegion: string;
  awsEndpoint: string | undefined;
  s3Bucket: string;
  sqsQueueUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const mongoUri = env['MONGO_URI'];
  if (!mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  const s3Bucket = env['S3_BUCKET'];
  if (!s3Bucket) {
    throw new Error('S3_BUCKET is required');
  }

  const sqsQueueUrl = env['SQS_QUEUE_URL'];
  if (!sqsQueueUrl) {
    throw new Error('SQS_QUEUE_URL is required');
  }

  const port = env['PORT'] ? Number(env['PORT']) : 3000;
  if (Number.isNaN(port)) {
    throw new Error(`Invalid PORT: ${env['PORT']}`);
  }

  return {
    port,
    mongoUri,
    awsRegion: env['AWS_REGION'] ?? 'us-east-1',
    awsEndpoint: env['AWS_ENDPOINT_URL'],
    s3Bucket,
    sqsQueueUrl,
  };
}
