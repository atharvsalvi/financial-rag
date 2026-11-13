import { Controller, Get, Module, Res } from '@nestjs/common';
import { Response } from 'express';
import { resolve } from 'node:path';
import {
  DatabaseModule,
  DatabaseService,
} from './integrations/database/database.module';

@Controller('dashboard')
class DashboardController {
  constructor(private readonly db: DatabaseService) {}

  @Get('reports')
  reports() {
    return this.db.$queryRaw`
      SELECT document_id AS id, coalesce(max(metadata->>'sourceFilename'), document_id) AS name,
             count(*)::int AS chunks, count(distinct page_number)::int AS "indexedPages"
      FROM document_chunks GROUP BY document_id ORDER BY max(created_at) DESC, document_id`;
  }

  @Get('conversations')
  conversations() {
    return this.db.conversation.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        documentId: true,
        createdAt: true,
        turns: {
          orderBy: { sequence: 'asc' },
          take: 1,
          select: { question: true },
        },
      },
    });
  }

  @Get('baseline')
  baseline(@Res() response: Response) {
    response.sendFile(resolve(__dirname, '../eval/baseline.json'));
  }
}

@Module({ imports: [DatabaseModule], controllers: [DashboardController] })
export class DashboardModule {}
