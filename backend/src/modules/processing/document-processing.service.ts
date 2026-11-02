import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIG, Configuration } from '../../config/configuration';
import { ChunkingService } from '../chunking/chunking.service';
import { ExtractedDocument } from '../chunking/chunk.types';
import {
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
  validateVectors,
} from '../embeddings/embedding-provider';
import {
  CHUNK_REPOSITORY,
  ChunkRepository,
  EmbeddedChunk,
} from './chunk-repository';

@Injectable()
export class DocumentProcessingService {
  private readonly logger = new Logger(DocumentProcessingService.name);
  constructor(
    private readonly chunking: ChunkingService,
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
    @Inject(CHUNK_REPOSITORY) private readonly repository: ChunkRepository,
    @Inject(CONFIG) private readonly config: Configuration,
  ) {}
  async process(document: ExtractedDocument): Promise<EmbeddedChunk[]> {
    try {
      const chunks = this.chunking.chunk(document);
      // An empty extraction should not accidentally erase a previously processed document.
      if (chunks.length === 0) return [];
      const previous = await this.repository.findByDocumentId(
        document.documentId,
      );
      const cache = new Map<string, number[]>();
      for (const chunk of previous) {
        if (chunk.embeddingModel === this.config.embeddingModel) {
          validateVectors(
            [chunk.embedding],
            1,
            this.config.embeddingDimensions,
          );
          cache.set(chunk.content, chunk.embedding);
        }
      }
      const missing = [
        ...new Set(
          chunks.map(function content(chunk) {
            return chunk.content;
          }),
        ),
      ].filter(function uncached(content) {
        return !cache.has(content);
      });
      for (
        let offset = 0;
        offset < missing.length;
        offset += this.config.embeddingBatchSize
      ) {
        const texts = missing.slice(
          offset,
          offset + this.config.embeddingBatchSize,
        );
        try {
          const vectors = await this.provider.embedMany(texts);
          validateVectors(
            vectors,
            texts.length,
            this.config.embeddingDimensions,
          );
          texts.forEach(function cacheVector(text, index) {
            cache.set(text, vectors[index]!);
          });
        } catch (error) {
          throw new Error(
            `Embedding batch ${Math.floor(offset / this.config.embeddingBatchSize)} failed for document ${document.documentId}`,
            { cause: error },
          );
        }
      }
      const model = this.config.embeddingModel;
      const embedded = chunks.map(function attach(chunk) {
        return {
          ...chunk,
          embedding: cache.get(chunk.content)!,
          embeddingModel: model,
        };
      });
      // All network work is complete before the repository opens its transaction.
      await this.repository.replaceDocument(document.documentId, embedded);
      this.logger.log(
        `Processed document ${document.documentId}: ${embedded.length} chunks`,
      );
      return embedded;
    } catch (error) {
      throw new Error(`Processing document ${document.documentId} failed`, {
        cause: error,
      });
    }
  }
}
