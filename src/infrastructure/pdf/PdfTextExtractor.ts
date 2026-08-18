import { PDFParse } from 'pdf-parse';
import type { DocumentTextExtractor, ExtractedDocument } from '../../application/documents/DocumentTextExtractor.js';

export class PdfTextExtractor implements DocumentTextExtractor {
  async extract(file: Buffer): Promise<ExtractedDocument> {
    const parser = new PDFParse({ data: file });
    try {
      const result = await parser.getText();
      return {
        pages: result.pages.map((page) => ({ page: page.num, text: page.text })),
      };
    } finally {
      await parser.destroy();
    }
  }
}
