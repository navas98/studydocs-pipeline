import { loadConfig } from '../../config/env.js';
import { LoginUserUseCase } from '../../application/auth/LoginUser.js';
import { RegisterUserUseCase } from '../../application/auth/RegisterUser.js';
import { CompleteUploadUseCase } from '../../application/documents/CompleteUpload.js';
import { CreateDocumentUseCase } from '../../application/documents/CreateDocument.js';
import { DeleteDocumentUseCase } from '../../application/documents/DeleteDocument.js';
import { DownloadDocumentFileUseCase } from '../../application/documents/DownloadDocumentFile.js';
import { GetDocumentUseCase } from '../../application/documents/GetDocument.js';
import { ListDocumentsUseCase } from '../../application/documents/ListDocuments.js';
import { RetryDocumentUseCase } from '../../application/documents/RetryDocument.js';
import { SearchDocumentsUseCase } from '../../application/documents/SearchDocuments.js';
import { UpdateDocumentMetadataUseCase } from '../../application/documents/UpdateDocumentMetadata.js';
import { createS3Client, createSqsClient } from '../../infrastructure/aws/clients.js';
import { BcryptPasswordHasher } from '../../infrastructure/auth/BcryptPasswordHasher.js';
import { JwtTokenService } from '../../infrastructure/auth/JwtTokenService.js';
import {
  createElasticsearchClient,
  ensureDocumentsIndex,
} from '../../infrastructure/elasticsearch/connection.js';
import { ElasticsearchSearchIndex } from '../../infrastructure/elasticsearch/ElasticsearchSearchIndex.js';
import { connectMongo, ensureDocumentIndexes, ensureUserIndexes } from '../../infrastructure/mongodb/connection.js';
import { MongoDocumentRepository } from '../../infrastructure/mongodb/MongoDocumentRepository.js';
import { MongoUserRepository } from '../../infrastructure/mongodb/MongoUserRepository.js';
import { S3ObjectStorage } from '../../infrastructure/s3/S3ObjectStorage.js';
import { SqsDocumentQueue } from '../../infrastructure/sqs/SqsDocumentQueue.js';
import { buildApp } from './app.js';
import { createAuthMiddleware } from './authMiddleware.js';
import { createCheckHealth } from './health.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db } = await connectMongo(config.mongoUri);
  await ensureDocumentIndexes(db);
  await ensureUserIndexes(db);

  const esClient = createElasticsearchClient(config.elasticsearchNode);
  await ensureDocumentsIndex(esClient, config.elasticsearchIndex);

  const repository = new MongoDocumentRepository(db);
  const users = new MongoUserRepository(db);
  const passwordHasher = new BcryptPasswordHasher();
  const tokens = new JwtTokenService(config.jwtSecret, config.jwtExpiresIn);
  const awsClientConfig = {
    region: config.awsRegion,
    ...(config.awsEndpoint ? { endpoint: config.awsEndpoint } : {}),
  };
  const storage = new S3ObjectStorage(createS3Client(awsClientConfig), config.s3Bucket);
  const queue = new SqsDocumentQueue(createSqsClient(awsClientConfig), config.sqsQueueUrl);
  const searchIndex = new ElasticsearchSearchIndex(esClient, config.elasticsearchIndex);

  const app = await buildApp({
    createDocument: new CreateDocumentUseCase(repository),
    getDocument: new GetDocumentUseCase(repository),
    listDocuments: new ListDocumentsUseCase(repository),
    completeUpload: new CompleteUploadUseCase(repository, storage, queue),
    searchDocuments: new SearchDocumentsUseCase(searchIndex),
    updateDocumentMetadata: new UpdateDocumentMetadataUseCase(repository),
    retryDocument: new RetryDocumentUseCase(repository, queue),
    downloadDocumentFile: new DownloadDocumentFileUseCase(repository, storage),
    deleteDocument: new DeleteDocumentUseCase(repository, storage, searchIndex),
    checkHealth: createCheckHealth(db, esClient),
    registerUser: new RegisterUserUseCase(users, passwordHasher),
    loginUser: new LoginUserUseCase(users, passwordHasher, tokens),
    authMiddleware: createAuthMiddleware(tokens),
  });

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
