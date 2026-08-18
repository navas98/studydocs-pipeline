import type { ExtractedPage } from './DocumentTextExtractor.js';

export interface ChunkInput {
  page: number;
  position: number;
  content: string;
}

const CHUNK_WORDS = 700; // ~500-1000 tokens for Spanish/English prose
const CHUNK_OVERLAP_WORDS = 50;

// Collapses whitespace/line-break noise from PDF text extraction (hyphenation
// artifacts aside — that's a further-refinement problem, not this pass's).
// Pure function: no I/O, easy to unit test without a real PDF.
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}

// Splits cleaned page text into overlapping word-count chunks. Global
// `position` (not per-page) so chunks from the same document sort in
// reading order regardless of page, which is what a RAG context window
// wants later.
export function chunkPages(pages: ExtractedPage[]): ChunkInput[] {
  const chunks: ChunkInput[] = [];
  let position = 0;

  for (const { page, text } of pages) {
    const cleaned = cleanText(text);
    if (!cleaned) continue;

    const words = cleaned.split(/\s+/);
    let start = 0;
    while (start < words.length) {
      const end = Math.min(start + CHUNK_WORDS, words.length);
      chunks.push({ page, position, content: words.slice(start, end).join(' ') });
      position += 1;

      if (end >= words.length) break;
      start = end - CHUNK_OVERLAP_WORDS;
    }
  }

  return chunks;
}
