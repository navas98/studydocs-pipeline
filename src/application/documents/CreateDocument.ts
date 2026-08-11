import { Document } from '../../domain/document/Document.js';
import type { DocumentRepository } from './DocumentRepository.js';

export interface CreateDocumentCommand {
  ownerId: string;
  title: string;
  subject: string;
  university: string;
  tags: string[];
}

export class CreateDocumentUseCase {
  constructor(private readonly documents: DocumentRepository) {}

  async execute(command: CreateDocumentCommand): Promise<Document> {
    const document = Document.create(command);
    await this.documents.save(document);
    return document;
  }
}
