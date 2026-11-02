import { Inject, Injectable, Module } from '@nestjs/common';
import { CONFIG, Configuration } from '../../config/configuration';
import { ChunkOptions, ExtractedDocument, TextChunk } from './chunk.types';

export function normalizeText(text: string): string {
  // Keep tabs, indentation, financial symbols and meaningful newlines.
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Recursively fall back from section to paragraph to sentence to character. */
function boundary(
  points: string[],
  start: number,
  limit: number,
  overlap: number,
  level = 0,
): number {
  if (level === 3) return limit;
  const window = points.slice(start, limit).join('');
  const patterns = [
    /\n(?=#{1,6}\s|[A-Z][A-Z\d &():/-]{3,}\n)/g,
    /\n\n/g,
    /[.!?。！？](?:["'”’)]*)\s+/gu,
  ];
  const pattern = patterns[level]!;
  let selected = 0;
  for (const match of window.matchAll(pattern)) {
    const offset = Array.from(
      window.slice(0, match.index + match[0].length),
    ).length;
    if (offset > overlap) selected = start + offset;
  }
  return selected || boundary(points, start, limit, overlap, level + 1);
}

@Injectable()
export class ChunkingService {
  constructor(@Inject(CONFIG) private readonly config: Configuration) {}
  chunk(
    document: ExtractedDocument,
    options?: Partial<ChunkOptions>,
  ): TextChunk[] {
    if (!document.documentId.trim()) throw new Error('documentId is required');
    const size = options?.chunkSize ?? this.config.chunkSize;
    const overlap = options?.chunkOverlap ?? this.config.chunkOverlap;
    if (
      !Number.isSafeInteger(size) ||
      size < 1 ||
      !Number.isSafeInteger(overlap) ||
      overlap < 0 ||
      overlap >= size
    )
      throw new Error('Require integer chunkSize > chunkOverlap >= 0');
    if (document.pages !== undefined && document.text !== undefined)
      throw new Error('Provide text or pages, not both');
    const pages = document.pages ?? [{ text: document.text, pageNumber: null }];
    const chunks: TextChunk[] = [];
    for (const page of pages) {
      if (typeof page.text !== 'string')
        throw new Error('Extracted text must be a string');
      if (
        page.pageNumber !== null &&
        (!Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1)
      )
        throw new Error('pageNumber must be a positive integer');
      const points = Array.from(normalizeText(page.text));
      let start = 0;
      while (start < points.length) {
        const limit = Math.min(start + size, points.length);
        const end =
          limit === points.length
            ? limit
            : boundary(points, start, limit, overlap);
        const content = points.slice(start, end).join('');
        if (content.trim())
          chunks.push({
            documentId: document.documentId,
            chunkIndex: chunks.length,
            content,
            pageNumber: page.pageNumber,
            metadata: structuredClone({
              ...document.metadata,
              ...('metadata' in page ? page.metadata : {}),
            }),
            startOffset: start,
            endOffset: end,
          });
        if (end === points.length) break;
        start = end - overlap;
      }
    }
    return chunks;
  }
}
@Module({ providers: [ChunkingService], exports: [ChunkingService] })
export class ChunkingModule {}
