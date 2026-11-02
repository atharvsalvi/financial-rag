import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, Configuration } from '../../config/configuration';
import {
  EmbeddingProvider,
  validateVectors,
} from '../../modules/embeddings/embedding-provider';

@Injectable()
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  constructor(@Inject(CONFIG) private readonly config: Configuration) {}
  async embed(text: string): Promise<number[]> {
    return (await this.embedMany([text]))[0]!;
  }
  async embedMany(texts: string[]): Promise<number[][]> {
    const result: number[][] = [];
    if (
      texts.some(function empty(text) {
        return !text.trim();
      })
    )
      throw new Error('Cannot embed empty text');
    for (
      let offset = 0;
      offset < texts.length;
      offset += this.config.embeddingBatchSize
    ) {
      const input = texts.slice(
        offset,
        offset + this.config.embeddingBatchSize,
      );
      try {
        const response = await fetch(`${this.config.ollamaBaseUrl}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.config.embeddingModel,
            input,
            truncate: false,
          }),
          signal: AbortSignal.timeout(this.config.ollamaTimeoutMs),
        });
        if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
        const body: unknown = await response.json();
        const embeddings =
          typeof body === 'object' && body !== null && 'embeddings' in body
            ? body.embeddings
            : undefined;
        validateVectors(
          embeddings,
          input.length,
          this.config.embeddingDimensions,
        );
        result.push(...embeddings);
      } catch (error) {
        throw new Error(`Ollama embedding batch at input ${offset} failed`, {
          cause: error,
        });
      }
    }
    return result;
  }
}
