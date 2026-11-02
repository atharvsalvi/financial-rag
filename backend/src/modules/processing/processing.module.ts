import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../integrations/database/database.module';
import { PrismaChunkRepository } from '../../integrations/database/prisma-chunk.repository';
import { ChunkingModule } from '../chunking/chunking.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { CHUNK_REPOSITORY } from './chunk-repository';
import { DocumentProcessingService } from './document-processing.service';
@Module({
  imports: [DatabaseModule, ChunkingModule, EmbeddingsModule],
  providers: [
    { provide: CHUNK_REPOSITORY, useClass: PrismaChunkRepository },
    DocumentProcessingService,
  ],
  exports: [DocumentProcessingService, CHUNK_REPOSITORY],
})
export class ProcessingModule {}
