import { randomUUID } from 'node:crypto';
import { configuration } from '../src/config/configuration';
import { DatabaseService } from '../src/integrations/database/database.module';
import { PassageSearchRepository } from '../src/integrations/database/passage-search.repository';
import { PrismaChunkRepository } from '../src/integrations/database/prisma-chunk.repository';

it('ranks pgvector matches by cosine, breaks ties, and scopes by document and embedding model', async function () {
  const config = configuration();
  const db = new DatabaseService(config);
  const chunks = new PrismaChunkRepository(db, config);
  const passages = new PassageSearchRepository(db);
  const model = randomUUID();
  const ids = ['a', 'b', 'c'].map(function unique(suffix) {
    return model + suffix;
  });
  function vector(x: number, y: number) {
    const values = Array<number>(config.embeddingDimensions).fill(0);
    values[0] = x;
    values[1] = y;
    return values;
  }
  try {
    await db.onModuleInit();
    for (const [i, id] of ids.entries()) {
      await chunks.replaceDocument(
        id,
        [vector(0, 1), vector(2, 0)].map(function row(embedding, chunkIndex) {
          return {
            documentId: id,
            chunkIndex,
            content: 'sample',
            pageNumber: chunkIndex + 1,
            metadata: { ticker: 'TEST' },
            startOffset: 0,
            endOffset: 6,
            embedding,
            embeddingModel: i === 2 ? model + '-other' : model,
          };
        }),
      );
    }
    const hits = await passages.search(vector(1, 0), model, 3);
    expect(
      hits.map(function identity(hit) {
        return [hit.documentId, hit.chunkIndex, hit.score];
      }),
    ).toEqual([
      [ids[0], 1, 1],
      [ids[1], 1, 1],
      [ids[0], 0, 0],
    ]);
    const scoped = await passages.search(vector(1, 0), model, 1, ids[1]);
    expect(scoped).toEqual([
      {
        documentId: ids[1],
        chunkIndex: 1,
        content: 'sample',
        pageNumber: 2,
        metadata: { ticker: 'TEST' },
        startOffset: 0,
        endOffset: 6,
        score: 1,
      },
    ]);
    expect(await passages.search(vector(1, 0), model, 5, ids[2])).toEqual([]);
  } finally {
    try {
      await db.documentChunk.deleteMany({ where: { documentId: { in: ids } } });
    } finally {
      await db.$disconnect();
    }
  }
});
