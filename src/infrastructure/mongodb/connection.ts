import { MongoClient, type Db } from 'mongodb';

export async function connectMongo(uri: string): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(uri);
  await client.connect();
  return { client, db: client.db() };
}

// Indexes backed by the access patterns documented in section 11 of the
// design doc: lookup by id (via _id), listing by owner + date, and
// filtering by status for operational queries.
export async function ensureDocumentIndexes(db: Db): Promise<void> {
  const collection = db.collection('documents');
  await collection.createIndexes([
    { key: { ownerId: 1, createdAt: -1 }, name: 'ownerId_createdAt' },
    { key: { status: 1 }, name: 'status' },
  ]);
}

// unique: true is the real defense against the race where two registration
// requests for the same email both pass the RegisterUser use case's
// findByEmail check before either has written — the use case check is just
// a fast path for the common (non-racing) case.
export async function ensureUserIndexes(db: Db): Promise<void> {
  const collection = db.collection('users');
  await collection.createIndexes([{ key: { email: 1 }, name: 'email_unique', unique: true }]);
}

// documentId + position: the access pattern is always "give me this
// document's chunks in reading order" (used to rebuild content for search
// today, and for RAG context retrieval in phase 4+).
export async function ensureChunkIndexes(db: Db): Promise<void> {
  const collection = db.collection('chunks');
  await collection.createIndexes([{ key: { documentId: 1, position: 1 }, name: 'documentId_position' }]);
}
