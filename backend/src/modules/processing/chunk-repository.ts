import { TextChunk } from '../chunking/chunk.types';
export interface EmbeddedChunk extends TextChunk {
  embedding: number[];
  embeddingModel: string;
}
export const CHUNK_REPOSITORY = Symbol('CHUNK_REPOSITORY');
export interface ChunkRepository {
  findByDocumentId(documentId: string): Promise<EmbeddedChunk[]>;
  replaceDocument(documentId: string, chunks: EmbeddedChunk[]): Promise<void>;
}
