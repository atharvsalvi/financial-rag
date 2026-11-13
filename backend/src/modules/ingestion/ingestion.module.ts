import { Module } from '@nestjs/common';
import { ProcessingModule } from '../processing/processing.module';
import { IngestionController } from './ingestion.controller';
import { PdfExtractionService } from './pdf-extraction.service';

@Module({
  imports: [ProcessingModule],
  controllers: [IngestionController],
  providers: [PdfExtractionService],
})
export class IngestionModule {}
