import { describe, expect, it } from 'vitest';
import { chunkPages, cleanText } from '../../src/application/documents/chunking.js';

describe('cleanText', () => {
  it('collapses duplicated whitespace within a line', () => {
    expect(cleanText('hola     mundo')).toBe('hola mundo');
  });

  it('normalizes Windows line endings and drops empty lines', () => {
    expect(cleanText('linea 1\r\n\r\n\r\nlinea 2\r\n')).toBe('linea 1\nlinea 2');
  });

  it('trims leading and trailing whitespace on each line and the whole text', () => {
    expect(cleanText('  hola  \n  mundo  \n')).toBe('hola\nmundo');
  });

  it('returns an empty string for a page with only whitespace', () => {
    expect(cleanText('   \n\t\n  ')).toBe('');
  });
});

describe('chunkPages', () => {
  it('skips pages that clean down to nothing', () => {
    const chunks = chunkPages([
      { page: 1, text: '   ' },
      { page: 2, text: 'contenido real' },
    ]);

    expect(chunks).toEqual([{ page: 2, position: 0, content: 'contenido real' }]);
  });

  it('produces one chunk for a short page', () => {
    const chunks = chunkPages([{ page: 1, text: 'una frase corta' }]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ page: 1, position: 0, content: 'una frase corta' });
  });

  it('splits a long page into multiple overlapping chunks', () => {
    const words = Array.from({ length: 1500 }, (_, i) => `palabra${i}`);
    const chunks = chunkPages([{ page: 1, text: words.join(' ') }]);

    expect(chunks.length).toBeGreaterThan(1);
    // Consecutive chunks overlap: the tail of one reappears at the head of the next.
    const firstWords = chunks[0]!.content.split(' ');
    const secondWords = chunks[1]!.content.split(' ');
    expect(secondWords[0]).toBe(firstWords[firstWords.length - 50]);
  });

  it('assigns globally sequential positions across pages', () => {
    const chunks = chunkPages([
      { page: 1, text: 'pagina uno' },
      { page: 2, text: 'pagina dos' },
    ]);

    expect(chunks.map((c) => c.position)).toEqual([0, 1]);
    expect(chunks.map((c) => c.page)).toEqual([1, 2]);
  });
});
