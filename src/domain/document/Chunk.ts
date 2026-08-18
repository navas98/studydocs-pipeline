import { randomUUID } from 'node:crypto';

export interface CreateChunkInput {
  documentId: string;
  ownerId: string;
  page: number;
  position: number;
  content: string;
}

export interface ChunkProps {
  id: string;
  documentId: string;
  ownerId: string;
  page: number;
  position: number;
  content: string;
  createdAt: Date;
}

// A fragment of a document's extracted text (v2 phase 2), scoped to a page
// and an ordinal position within that page. Deliberately not a stateful
// aggregate like Document — a chunk is derived data: it's fully
// regenerated (deleted and re-inserted) every time its document is
// (re)processed, never edited in place.
export class Chunk {
  private constructor(private props: ChunkProps) {}

  static create(input: CreateChunkInput): Chunk {
    return new Chunk({
      id: randomUUID(),
      documentId: input.documentId,
      ownerId: input.ownerId,
      page: input.page,
      position: input.position,
      content: input.content,
      createdAt: new Date(),
    });
  }

  static fromProps(props: ChunkProps): Chunk {
    return new Chunk({ ...props });
  }

  toProps(): ChunkProps {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }

  get documentId(): string {
    return this.props.documentId;
  }

  get content(): string {
    return this.props.content;
  }
}
