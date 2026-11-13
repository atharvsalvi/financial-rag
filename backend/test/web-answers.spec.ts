import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG } from '../src/config/configuration';
import { DatabaseService } from '../src/integrations/database/database.module';
import { TavilySearchService } from '../src/integrations/tavily/tavily-search.service';
import { RetrievalService } from '../src/modules/retrieval/retrieval.service';
import { setup } from '../src/setup';
import { config } from './support';

describe('external research endpoint', function () {
  let app: INestApplication;
  const docSearch = jest.fn();
  const question = 'What was operating cash flow?';
  const result = {
    title: 'Example Corp annual results',
    url: 'https://example.org/results',
    content: 'Operating cash flow was $4.2 million.',
  };
  beforeAll(async function () {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue({ ...config, tavilyApiKey: 'fixture-key' })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(RetrievalService)
      .useValue({ search: docSearch })
      .compile();
    app = module.createNestApplication();
    setup(app);
    await app.init();
  });
  beforeEach(function () {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('Unexpected request'));
  });
  afterEach(function () {
    jest.restoreAllMocks();
  });
  afterAll(async function () {
    await app.close();
  });
  function post(body: object = { query: question }) {
    return request(app.getHttpServer()).post('/api/v1/answers/web').send(body);
  }
  function searchResponse(results: unknown[]) {
    jest.mocked(fetch).mockResolvedValueOnce(Response.json({ results }));
  }
  function answerResponse(quote: string) {
    jest.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        done: true,
        message: {
          content: JSON.stringify({
            claims: [{ text: result.content, source: 1, quote }],
          }),
        },
      }),
    );
  }
  it('searches externally on explicit request and attributes the exact excerpt to the returned URL', async function () {
    searchResponse([
      { ...result, url: 'file:///tmp/test' },
      result,
      { ...result, url: result.url + '#section' },
      null,
    ]);
    answerResponse('$4.2 million');
    const res = await post().expect(200);
    expect(res.body.citations).toEqual([
      {
        id: 1,
        type: 'web',
        title: result.title,
        url: result.url,
        quote: '$4.2 million',
      },
    ]);
    const [search, chat] = jest.mocked(fetch).mock.calls;
    expect(search?.[0]).toBe('https://api.tavily.com/search');
    expect(search?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer fixture-key',
    });
    expect(JSON.parse(String(search?.[1]?.body))).toMatchObject({
      query: question,
      max_results: 3,
    });
    const messages = JSON.parse(String(chat?.[1]?.body)).messages;
    expect(JSON.parse(messages[1].content).sources).toHaveLength(1);
    expect(JSON.stringify(messages)).not.toContain('fixture-key');
    expect(docSearch).not.toHaveBeenCalled();
  });
  it('abstains if no usable results remain', async function () {
    searchResponse([
      { ...result, content: ' ' },
      { ...result, url: 'javascript:alert(1)' },
    ]);
    const res = await post().expect(200);
    expect(res.body.status).toBe('insufficient_evidence');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects an invented quotation', async function () {
    searchResponse([result]);
    answerResponse('$90 million');
    await post().expect(502);
  });
  it('surfaces provider outages separately from an empty search', async function () {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    await post().expect(503);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed provider envelopes', async function () {
    jest.mocked(fetch).mockResolvedValueOnce(Response.json({ results: {} }));
    await post().expect(502);
  });
  it('requires a configured key before contacting the provider', async function () {
    const service = new TavilySearchService({
      ...config,
      tavilyApiKey: undefined,
    });
    await expect(service.search(question, 3)).rejects.toMatchObject({
      status: 503,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { query: ' ' },
    { query: question, topK: 6 },
    { query: question, documentId: 'private-pdf' },
  ])(
    'rejects invalid request %# before external search',
    async function (body) {
      await post(body).expect(400);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
