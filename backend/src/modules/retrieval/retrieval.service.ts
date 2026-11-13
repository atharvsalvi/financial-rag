import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CONFIG, Configuration } from '../../config/configuration';
import { PassageSearchRepository } from '../../integrations/database/passage-search.repository';
import {
  EMBEDDING_PROVIDER,
  EmbeddingProvider,
  validateVectors,
} from '../embeddings/embedding-provider';
import { SearchDto } from './search.dto';

@Injectable()
export class RetrievalService {
  constructor(
    @Inject(CONFIG) private readonly config: Configuration,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
    private readonly passages: PassageSearchRepository,
  ) {}

  overview(documentId: string) {
    return this.passages.overview(documentId);
  }

  async search({ query, topK, documentId }: SearchDto) {
    let vector: number[];
    try {
      vector = await this.embeddings.embed(query.trim());
      validateVectors([vector], 1, this.config.embeddingDimensions);
    } catch (cause) {
      throw new ServiceUnavailableException(
        'Could not embed the search query.',
        { cause },
      );
    }
    const results = await this.passages.search(
      vector,
      this.config.embeddingModel,
      topK,
      documentId,
    );
    return { results };
  }
}
