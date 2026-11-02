import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, Configuration } from '../../config/configuration';
import { Metadata } from '../../modules/chunking/chunk.types';
import {
  ChunkRepository,
  EmbeddedChunk,
} from '../../modules/processing/chunk-repository';
import { validateVectors } from '../../modules/embeddings/embedding-provider';
import { DatabaseService } from './database.module';

interface ChunkRow {
  documentId: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  metadata: Metadata;
  embedding: string;
  embeddingModel: string;
  startOffset: number;
  endOffset: number;
}
@Injectable()
export class PrismaChunkRepository implements ChunkRepository {
  constructor(
    private readonly database: DatabaseService,
    @Inject(CONFIG) private readonly config: Configuration,
  ) {}
  async findByDocumentId(documentId: string): Promise<EmbeddedChunk[]> {
    const rows = await this.database.$queryRaw<ChunkRow[]>`
      SELECT document_id AS "documentId", chunk_index AS "chunkIndex", content,
        page_number AS "pageNumber", metadata, embedding::text AS embedding,
        embedding_model AS "embeddingModel", start_offset AS "startOffset", end_offset AS "endOffset"
      FROM document_chunks WHERE document_id = ${documentId} ORDER BY chunk_index`;
    return rows.map(function parse(row) {
      const embedding: unknown = JSON.parse(row.embedding);
      if (
        !Array.isArray(embedding) ||
        !embedding.every(function number(item) {
          return typeof item === 'number';
        })
      )
        throw new Error('Invalid stored vector');
      return { ...row, embedding: embedding as number[] };
    });
  }
  async replaceDocument(
    documentId: string,
    chunks: EmbeddedChunk[],
  ): Promise<void> {
    if (!documentId.trim()) throw new Error('documentId is required');
    for (const [index, chunk] of chunks.entries()) {
      if (
        chunk.documentId !== documentId ||
        chunk.chunkIndex !== index ||
        !chunk.content.trim()
      )
        throw new Error('Invalid chunk identity/order/content');
      validateVectors([chunk.embedding], 1, this.config.embeddingDimensions);
    }
    await this.database.$transaction(
      async function replace(tx) {
        // Serialize document replacements, including documents that do not exist yet.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${documentId}, 0))`;
        await tx.$executeRaw`DELETE FROM document_chunks WHERE document_id = ${documentId}`;
        for (const chunk of chunks) {
          await tx.$executeRaw`
          INSERT INTO document_chunks (id, document_id, chunk_index, content, page_number, metadata, embedding, embedding_model, start_offset, end_offset)
          VALUES (${randomUUID()}::uuid, ${documentId}, ${chunk.chunkIndex}, ${chunk.content}, ${chunk.pageNumber},
            ${JSON.stringify(chunk.metadata)}::jsonb, ${JSON.stringify(chunk.embedding)}::vector,
            ${chunk.embeddingModel}, ${chunk.startOffset}, ${chunk.endOffset})`;
        }
      },
      { timeout: 30000 },
    );
  }
}
