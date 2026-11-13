import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG } from '../src/config/configuration';
import { DatabaseService } from '../src/integrations/database/database.module';
import { PassageSearchRepository } from '../src/integrations/database/passage-search.repository';
import { EMBEDDING_PROVIDER } from '../src/modules/embeddings/embedding-provider';
import { setup } from '../src/setup';
import { config } from './support';

describe('passage search endpoint', function () {
  let app: INestApplication;
  const embed = jest.fn();
  const search = jest.fn();
  beforeAll(async function () {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue(config)
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue({ embed })
      .overrideProvider(PassageSearchRepository)
      .useValue({ search })
      .compile();
    app = module.createNestApplication();
    setup(app);
    await app.init();
  });
  beforeEach(function () {
    embed.mockReset().mockResolvedValue([1, 0, 0]);
    search.mockReset().mockResolvedValue([]);
  });
  afterAll(async function () {
    await app.close();
  });
  function post(body: object) {
    return request(app.getHttpServer())
      .post('/api/v1/retrieval/search')
      .send(body);
  }

  it('embeds a trimmed query and defaults to five results across documents', async function () {
    await post({ query: '  operating cash flow? ' }).expect(200, {
      results: [],
    });
    expect(embed).toHaveBeenCalledWith('operating cash flow?');
    expect(search).toHaveBeenCalledWith(
      [1, 0, 0],
      config.embeddingModel,
      5,
      undefined,
    );
  });
  it.each([
    {},
    { query: '  ' },
    { query: 'x'.repeat(4001) },
    { query: 'q', topK: 0 },
    { query: 'q', topK: 21 },
    { query: 'q', topK: 1.5 },
    { query: 'q', documentId: '' },
    { query: 'q', other: true },
  ])('rejects invalid request %# before embedding', async function (body) {
    await post(body).expect(400);
    expect(embed).not.toHaveBeenCalled();
  });
  it('reports an embedding outage without executing a search', async function () {
    embed.mockRejectedValueOnce(new Error('offline'));
    await post({ query: 'cash flow' }).expect(503);
    expect(search).not.toHaveBeenCalled();
  });
  it('rejects mismatched query dimensions', async function () {
    embed.mockResolvedValueOnce([1]);
    await post({ query: 'cash flow' }).expect(503);
    expect(search).not.toHaveBeenCalled();
  });
});
