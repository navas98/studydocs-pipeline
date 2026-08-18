export interface ExtractedPage {
  page: number;
  text: string;
}

export interface ExtractedDocument {
  pages: ExtractedPage[];
}

export interface DocumentTextExtractor {
  extract(file: Buffer): Promise<ExtractedDocument>;
}
