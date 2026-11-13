import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../integrations/database/database.module';
import { PassageSearchRepository } from '../../integrations/database/passage-search.repository';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { RetrievalController } from './retrieval.controller';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [DatabaseModule, EmbeddingsModule],
  controllers: [RetrievalController],
  providers: [RetrievalService, PassageSearchRepository],
  exports: [RetrievalService],
})
export class RetrievalModule {}
