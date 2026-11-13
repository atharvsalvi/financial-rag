import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { createHash } from 'node:crypto';
import { win32 } from 'node:path';
import { DocumentProcessingService } from '../processing/document-processing.service';
import { PdfExtractionService } from './pdf-extraction.service';

class ReportFields {
  @IsOptional() @IsString() @MaxLength(200) company?: string;
  @IsOptional() @IsString() @MaxLength(24) ticker?: string;
  @IsOptional() @IsString() @MaxLength(80) documentType?: string;
}

@Controller('documents')
export class IngestionController {
  constructor(
    private readonly extractor: PdfExtractionService,
    private readonly processing: DocumentProcessingService,
  ) {}

  @Post('ingest')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        files: 1,
        fields: 3,
        fileSize: 20 * 1024 * 1024,
        fieldSize: 1024,
      },
    }),
  )
  async ingest(
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Body() fields: ReportFields,
  ) {
    if (!file?.buffer.length)
      throw new BadRequestException('Upload a PDF in the file field.');
    const pages = await this.extractor.extract(file.buffer);
    const documentId =
      'pdf-' + createHash('sha256').update(file.buffer).digest('hex');
    const metadata = {
      sourceFilename: win32.basename(file.originalname),
      ...Object.fromEntries(
        Object.entries(fields).filter(function provided(entry) {
          return typeof entry[1] === 'string';
        }),
      ),
    };
    const chunks = await this.processing.process({
      documentId,
      pages,
      metadata,
    });
    return {
      documentId,
      pageCount: pages.length,
      pagesWithText: pages.filter(function hasText(page) {
        return page.text.trim().length > 0;
      }).length,
      chunkCount: chunks.length,
    };
  }
}
