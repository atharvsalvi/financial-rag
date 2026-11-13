import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG } from '../src/config/configuration';
import { DatabaseService } from '../src/integrations/database/database.module';
import { EMBEDDING_PROVIDER } from '../src/modules/embeddings/embedding-provider';
import {
  CHUNK_REPOSITORY,
  EmbeddedChunk,
} from '../src/modules/processing/chunk-repository';
import { setup } from '../src/setup';
import { config } from './support';

describe('PDF ingestion through HTTP', function () {
  const pdf = readFileSync(join(__dirname, 'fixtures/example-report.pdf'));
  const embedMany = jest.fn(async function vectors(texts: string[]) {
    return texts.map(function vector() {
      return [1, 2, 3];
    });
  });
  let stored: EmbeddedChunk[] = [];
  const repository = {
    findByDocumentId: async function find() {
      return stored;
    },
    replaceDocument: jest.fn(async function replace(
      _id: string,
      chunks: EmbeddedChunk[],
    ) {
      stored = chunks;
    }),
  };
  let app: INestApplication;
  beforeAll(async function () {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue(config)
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue({ embedMany })
      .overrideProvider(CHUNK_REPOSITORY)
      .useValue(repository)
      .compile();
    app = module.createNestApplication();
    setup(app);
    await app.init();
  });
  beforeEach(function () {
    stored = [];
    jest.clearAllMocks();
  });
  afterAll(async function () {
    await app.close();
  });
  function upload() {
    return request(app.getHttpServer()).post('/api/v1/documents/ingest');
  }

  it('extracts physical pages, persists metadata and reuses embeddings on retry', async function () {
    const first = await upload()
      .field('ticker', 'EXM')
      .attach('file', pdf, 'annual.pdf')
      .expect(201);
    expect(first.body).toEqual({
      documentId: expect.stringMatching(/^pdf-[0-9a-f]{64}$/),
      pageCount: 3,
      pagesWithText: 2,
      chunkCount: 2,
    });
    expect(
      stored.map(function page(c) {
        return c.pageNumber;
      }),
    ).toEqual([1, 3]);
    expect(stored[0]?.content).toContain('Revenue: $12.5 million, up 15%.');
    expect(stored[1]?.content).toContain('Operating cash flow: $4.2 million.');
    expect(stored[0]?.metadata).toEqual({
      sourceFilename: 'annual.pdf',
      ticker: 'EXM',
    });
    const again = await upload().attach('file', pdf, 'renamed.pdf').expect(201);
    expect(again.body).toEqual(first.body);
    expect(embedMany).toHaveBeenCalledTimes(1);
    expect(stored).toHaveLength(2);
  });
  it('rejects missing files and invalid metadata', async function () {
    await upload().expect(400);
    await upload()
      .field('unknown', 'x')
      .attach('file', pdf, 'report.pdf')
      .expect(400);
    expect(repository.replaceDocument).not.toHaveBeenCalled();
  });
  it('rejects disguised and damaged PDFs before embedding', async function () {
    await upload()
      .attach('file', Buffer.from('plain text'), 'report.pdf')
      .expect(415);
    await upload()
      .attach('file', Buffer.from('%PDF-1.4\nbroken'), 'broken.pdf')
      .expect(422);
    expect(embedMany).not.toHaveBeenCalled();
  });
  it('rejects a PDF with no text without writing chunks', async function () {
    // Replace each PDF text operand with spaces, retaining the original byte offsets.
    const blank = pdf
      .toString('ascii')
      .replace(/\([^)]*\) Tj/g, function spaces(operand) {
        return '(' + ' '.repeat(operand.length - 5) + ') Tj';
      });
    await upload().attach('file', Buffer.from(blank), 'blank.pdf').expect(422);
    expect(repository.replaceDocument).not.toHaveBeenCalled();
  });
  it('reports processing failures without claiming a successful upload', async function () {
    embedMany.mockRejectedValueOnce(new Error('Ollama unavailable'));
    await upload().attach('file', pdf, 'annual.pdf').expect(500);
    expect(repository.replaceDocument).not.toHaveBeenCalled();
  });
});
