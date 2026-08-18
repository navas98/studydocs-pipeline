import type { Collection, Db } from 'mongodb';
import type { ChunkRepository } from '../../application/documents/ChunkRepository.js';
import { Chunk, type ChunkProps } from '../../domain/document/Chunk.js';

type ChunkDbRecord = Omit<ChunkProps, 'id'> & { _id: string };

function toDbRecord(props: ChunkProps): ChunkDbRecord {
  const { id, ...rest } = props;
  return { _id: id, ...rest };
}

function toDomain(record: ChunkDbRecord): Chunk {
  const { _id, ...rest } = record;
  return Chunk.fromProps({ id: _id, ...rest });
}

export class MongoChunkRepository implements ChunkRepository {
  private readonly collection: Collection<ChunkDbRecord>;

  constructor(db: Db) {
    this.collection = db.collection<ChunkDbRecord>('chunks');
  }

  async saveMany(chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) return;
    await this.collection.insertMany(chunks.map((chunk) => toDbRecord(chunk.toProps())));
  }

  async findByDocumentId(documentId: string): Promise<Chunk[]> {
    const records = await this.collection.find({ documentId }).sort({ position: 1 }).toArray();
    return records.map(toDomain);
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    await this.collection.deleteMany({ documentId });
  }
}
