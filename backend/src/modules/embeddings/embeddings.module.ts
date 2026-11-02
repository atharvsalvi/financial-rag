import { Module } from '@nestjs/common';
import { OllamaEmbeddingProvider } from '../../integrations/ollama/ollama-embedding.provider';
import { EMBEDDING_PROVIDER } from './embedding-provider';
@Module({
  providers: [
    { provide: EMBEDDING_PROVIDER, useClass: OllamaEmbeddingProvider },
  ],
  exports: [EMBEDDING_PROVIDER],
})
export class EmbeddingsModule {}
