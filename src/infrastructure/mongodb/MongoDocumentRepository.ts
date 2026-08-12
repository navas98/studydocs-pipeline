import type { Collection, Db } from 'mongodb';
import type { DocumentRepository } from '../../application/documents/DocumentRepository.js';
import { Document, type DocumentProps } from '../../domain/document/Document.js';

// Mongo storage shape: same fields as DocumentProps but keyed by _id
// instead of id, which is the idiomatic Mongo primary key field.
type DocumentDbRecord = Omit<DocumentProps, 'id'> & { _id: string };

function toDbRecord(props: DocumentProps): DocumentDbRecord {
  const { id, ...rest } = props;
  return { _id: id, ...rest };
}

function toDomain(record: DocumentDbRecord): Document {
  const { _id, ...rest } = record;
  return Document.fromProps({ id: _id, ...rest });
}

export class MongoDocumentRepository implements DocumentRepository {
  private readonly collection: Collection<DocumentDbRecord>;

  constructor(db: Db) {
    this.collection = db.collection<DocumentDbRecord>('documents');
  }

  async save(document: Document): Promise<void> {
    const record = toDbRecord(document.toProps());
    await this.collection.replaceOne({ _id: record._id }, record, { upsert: true });
  }

  async findById(id: string): Promise<Document | null> {
    const record = await this.collection.findOne({ _id: id });
    return record ? toDomain(record) : null;
  }

  async findByOwner(
    ownerId: string,
    options: { limit: number; offset: number },
  ): Promise<Document[]> {
    const records = await this.collection
      .find({ ownerId })
      .sort({ createdAt: -1 })
      .skip(options.offset)
      .limit(options.limit)
      .toArray();
    return records.map(toDomain);
  }

  async updateWithVersionCheck(document: Document, expectedVersion: number): Promise<boolean> {
    const { _id, ...rest } = toDbRecord(document.toProps());
    const result = await this.collection.updateOne(
      { _id, version: expectedVersion },
      { $set: rest },
    );
    return result.matchedCount === 1;
  }

  async delete(id: string): Promise<void> {
    await this.collection.deleteOne({ _id: id });
  }
}
