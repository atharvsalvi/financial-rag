import { randomUUID } from 'node:crypto';
import { configuration } from '../src/config/configuration';
import { DatabaseService } from '../src/integrations/database/database.module';
import { PrismaChunkRepository } from '../src/integrations/database/prisma-chunk.repository';
import { EmbeddedChunk } from '../src/modules/processing/chunk-repository';
describe('live PostgreSQL and pgvector persistence', function () {
  const config = configuration();
  const database = new DatabaseService(config);
  const repository = new PrismaChunkRepository(database, config);
  const documentId = `integration-${randomUUID()}`;
  function chunk(index = 0): EmbeddedChunk {
    return {
      documentId,
      chunkIndex: index,
      content: "FY2026 Q2 revenue $12.5m; company's margin 25%",
      pageNumber: 12,
      metadata: { ticker: 'TEST', nested: { quarter: 'Q2' } },
      embedding: Array.from(
        { length: config.embeddingDimensions },
        function value(_, i) {
          return i === 0 ? 1 : 0;
        },
      ),
      embeddingModel: config.embeddingModel,
      startOffset: 0,
      endOffset: 47,
    };
  }
  beforeAll(async function () {
    await database.onModuleInit();
  });
  afterAll(async function () {
    try {
      await database.$executeRaw`DELETE FROM document_chunks WHERE document_id = ${documentId}`;
    } finally {
      await database.$disconnect();
    }
  });
  it('connects with pgvector and stores/retrieves vectors and metadata', async function () {
    await database.ping();
    await repository.replaceDocument(documentId, [chunk()]);
    expect(await repository.findByDocumentId(documentId)).toEqual([chunk()]);
  });
  it('prevents duplicate insertion at the database level', async function () {
    await repository.replaceDocument(documentId, [chunk()]);
    await expect(database.$executeRaw`
      INSERT INTO document_chunks (id, document_id, chunk_index, content, page_number, metadata, embedding, embedding_model, start_offset, end_offset)
      SELECT ${randomUUID()}::uuid, document_id, chunk_index, content, page_number, metadata, embedding, embedding_model, start_offset, end_offset
      FROM document_chunks WHERE document_id = ${documentId}`).rejects.toThrow();
    expect(await repository.findByDocumentId(documentId)).toHaveLength(1);
  });
  it('replaces atomically, orders chunks and removes stale trailing rows', async function () {
    await repository.replaceDocument(documentId, [chunk(), chunk(1)]);
    expect(
      (await repository.findByDocumentId(documentId)).map(function index(c) {
        return c.chunkIndex;
      }),
    ).toEqual([0, 1]);
    await repository.replaceDocument(documentId, [chunk()]);
    expect(await repository.findByDocumentId(documentId)).toEqual([chunk()]);
  });
  it('rolls back on an insert failure', async function () {
    await repository.replaceDocument(documentId, [chunk()]);
    await expect(
      repository.replaceDocument(documentId, [{ ...chunk(), pageNumber: -1 }]),
    ).rejects.toThrow();
    expect(await repository.findByDocumentId(documentId)).toEqual([chunk()]);
  });
  it('serializes concurrent replacements without mixing documents', async function () {
    await Promise.all([
      repository.replaceDocument(documentId, [chunk(), chunk(1)]),
      repository.replaceDocument(documentId, [chunk()]),
    ]);
    const rows = await repository.findByDocumentId(documentId);
    expect([1, 2]).toContain(rows.length);
    expect(rows).toEqual(rows.length === 1 ? [chunk()] : [chunk(), chunk(1)]);
  });
  it('rejects wrong dimensions and returns no unrelated document rows', async function () {
    await expect(
      repository.replaceDocument(documentId, [{ ...chunk(), embedding: [1] }]),
    ).rejects.toThrow();
    expect(await repository.findByDocumentId("missing' OR 1=1 --")).toEqual([]);
  });
});
