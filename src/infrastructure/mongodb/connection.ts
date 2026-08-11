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
