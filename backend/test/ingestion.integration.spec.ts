import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configuration } from '../src/config/configuration';
import { DatabaseService } from '../src/integrations/database/database.module';
import {
  OllamaAnswerService,
  PromptSource,
} from '../src/integrations/ollama/ollama-answer.service';
import { EMBEDDING_PROVIDER } from '../src/modules/embeddings/embedding-provider';
import {
  CHUNK_REPOSITORY,
  ChunkRepository,
} from '../src/modules/processing/chunk-repository';
import { setup } from '../src/setup';

it('uploads a PDF and reads its page numbers, metadata and vectors back from pgvector', async function () {
  const config = configuration();
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (process.env.TEST_LIVE_CHAT !== '1') {
    builder.overrideProvider(OllamaAnswerService).useValue({
      async generate(_question: string, sources: PromptSource[]) {
        const source = sources.find(function cashFlow(item) {
          return item.text.includes('$4.2 million');
        });
        return {
          claims: source
            ? [
                {
                  text: 'Operating cash flow was $4.2 million.',
                  source: source.id,
                  quote: '$4.2 million',
                },
              ]
            : [],
        };
      },
    });
  }
  if (process.env.TEST_LIVE_OLLAMA !== '1') {
    builder.overrideProvider(EMBEDDING_PROVIDER).useValue({
      async embed() {
        return Array(config.embeddingDimensions).fill(0.5);
      },
      async embedMany(texts: string[]) {
        return texts.map(function vector() {
          return Array(config.embeddingDimensions).fill(0.5);
        });
      },
    });
  }
  // A unique trailing PDF comment isolates this suite from real uploads.
  const pdf = Buffer.concat([
    readFileSync(join(__dirname, 'fixtures/example-report.pdf')),
    Buffer.from('\n% ' + randomUUID() + '\n'),
  ]);
  const documentId = 'pdf-' + createHash('sha256').update(pdf).digest('hex');
  const module = await builder.compile();
  const app: INestApplication = module.createNestApplication();
  setup(app);
  try {
    await app.init();
    const result = await request(app.getHttpServer())
      .post('/api/v1/documents/ingest')
      .field('documentType', 'annual_report')
      .attach('file', pdf, 'example-report.pdf')
      .expect(201);
    expect(result.body).toEqual({
      documentId,
      pageCount: 3,
      pagesWithText: 2,
      chunkCount: 2,
    });
    const rows = await app
      .get<ChunkRepository>(CHUNK_REPOSITORY)
      .findByDocumentId(documentId);
    expect(
      rows.map(function page(row) {
        return row.pageNumber;
      }),
    ).toEqual([1, 3]);
    for (const row of rows) {
      expect(row.metadata).toEqual({
        documentType: 'annual_report',
        sourceFilename: 'example-report.pdf',
      });
      expect(row.embeddingModel).toBe(config.embeddingModel);
      expect(row.embedding).toHaveLength(config.embeddingDimensions);
    }
    const response = await request(app.getHttpServer())
      .post('/api/v1/retrieval/search')
      .send({ query: 'What was operating cash flow?', documentId, topK: 2 })
      .expect(200);
    expect(response.body.results).toHaveLength(2);
    const cashFlow = expect.objectContaining({
      documentId,
      pageNumber: 3,
      content: expect.stringContaining('$4.2 million'),
    });
    expect(response.body.results).toContainEqual(cashFlow);
    if (process.env.TEST_LIVE_OLLAMA === '1')
      expect(response.body.results[0]).toEqual(cashFlow);
    const chat = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .send({ documentId })
      .expect(201);
    let answer;
    try {
      const path = '/api/v1/conversations/' + chat.body.id + '/turns';
      await request(app.getHttpServer())
        .post(path)
        .send({ query: 'What was operating cash flow?', version: 0 })
        .expect(201);
      answer = await request(app.getHttpServer())
        .post(path)
        .send({ query: 'What was the amount of that item?', version: 1 })
        .expect(201);
    } finally {
      await app
        .get(DatabaseService)
        .conversation.delete({ where: { id: chat.body.id } });
    }
    expect(answer.body.status).toBe('answered');
    expect(answer.body.answer).toContain('4.2 million');
    expect(answer.body.citations).toContainEqual(
      expect.objectContaining({
        documentId,
        pageNumber: 3,
        filename: 'example-report.pdf',
        quote: expect.stringContaining('4.2 million'),
      }),
    );
  } finally {
    try {
      await app
        .get(DatabaseService)
        .documentChunk.deleteMany({ where: { documentId } });
    } finally {
      await app.close();
    }
  }
}, 120000);
