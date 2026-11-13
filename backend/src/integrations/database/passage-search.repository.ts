import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from './database.module';
import { TextChunk } from '../../modules/chunking/chunk.types';

export interface PassageMatch extends TextChunk {
  score: number;
}

@Injectable()
export class PassageSearchRepository {
  constructor(private readonly db: DatabaseService) {}

  overview(documentId: string): Promise<TextChunk[]> {
    // Keep the opening passage and sample across the document in reading order.
    // For page-less text, sample its ordered chunks instead.
    return this.db.$queryRaw<TextChunk[]>`
      WITH openings AS (
        SELECT DISTINCT ON (page_number, CASE WHEN page_number IS NULL THEN chunk_index END)
               document_id, chunk_index, page_number, content, metadata, start_offset, end_offset
        FROM document_chunks WHERE document_id = ${documentId}
        ORDER BY page_number, CASE WHEN page_number IS NULL THEN chunk_index END, chunk_index
      ), bands AS (
        SELECT *, ntile(5) OVER (ORDER BY chunk_index) AS band FROM openings
      )
      SELECT DISTINCT ON (band) document_id AS "documentId", chunk_index AS "chunkIndex",
        page_number AS "pageNumber", content, metadata, start_offset AS "startOffset",
        end_offset AS "endOffset" FROM bands ORDER BY band, chunk_index`;
  }

  search(
    vector: number[],
    model: string,
    topK: number,
    documentId?: string,
  ): Promise<PassageMatch[]> {
    const scope =
      documentId === undefined
        ? Prisma.empty
        : Prisma.sql`AND document_id = ${documentId}`;
    return this.db.$queryRaw<PassageMatch[]>`
      SELECT document_id AS "documentId", chunk_index AS "chunkIndex",
             page_number AS "pageNumber", start_offset AS "startOffset",
             end_offset AS "endOffset", content, metadata,
             1 - (embedding <=> ${JSON.stringify(vector)}::vector) AS score
      FROM document_chunks
      WHERE embedding_model = ${model} ${scope}
      ORDER BY score DESC, document_id, chunk_index
      LIMIT ${topK}`;
  }
}
