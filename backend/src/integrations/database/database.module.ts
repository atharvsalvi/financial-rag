import {
  Inject,
  Injectable,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CONFIG, Configuration } from '../../config/configuration';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(@Inject(CONFIG) private readonly config: Configuration) {
    super({ datasources: { db: { url: config.databaseUrl } } });
  }
  async onModuleInit(): Promise<void> {
    await this.$connect();
    const columns = await this.$queryRaw<{ type: string }[]>`
      SELECT format_type(a.atttypid, a.atttypmod) AS type
      FROM pg_attribute a WHERE a.attrelid = 'document_chunks'::regclass AND a.attname = 'embedding'`;
    if (columns[0]?.type !== `vector(${this.config.embeddingDimensions})`) {
      throw new Error(
        'EMBEDDING_DIMENSIONS does not match migrated document_chunks.embedding',
      );
    }
  }
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
@Module({ providers: [DatabaseService], exports: [DatabaseService] })
export class DatabaseModule {}
