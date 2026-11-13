import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG } from '../src/config/configuration';
import { DatabaseService } from '../src/integrations/database/database.module';
import { RetrievalService } from '../src/modules/retrieval/retrieval.service';
import { setup } from '../src/setup';
import { config } from './support';

const passage = {
  documentId: 'report',
  chunkIndex: 1,
  pageNumber: 3,
  content: 'Operating cash flow: $4.2 million.',
  metadata: { sourceFilename: 'annual.pdf' },
};
const claim = {
  text: 'Operating cash flow was $4.2 million.',
  source: 1,
  quote: passage.content,
};
const search = jest.fn();
describe('answers endpoint', function () {
  let app: INestApplication;
  beforeAll(async function () {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue(config)
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(RetrievalService)
      .useValue({ search })
      .compile();
    app = module.createNestApplication();
    setup(app);
    await app.init();
  });
  beforeEach(function () {
    search.mockReset().mockResolvedValue({ results: [passage] });
    jest.spyOn(global, 'fetch');
  });
  afterEach(function () {
    jest.restoreAllMocks();
  });
  afterAll(async function () {
    await app.close();
  });
  function completion(claims: unknown) {
    jest.mocked(fetch).mockImplementation(async () =>
      Response.json({
        done: true,
        message: { content: JSON.stringify({ claims }) },
      }),
    );
  }
  function post(
    body: object = {
      query: 'What was operating cash flow?',
      documentId: 'report',
    },
  ) {
    return request(app.getHttpServer()).post('/api/v1/answers').send(body);
  }
  it('links generated statements to verified excerpts and server-owned source coordinates', async function () {
    completion([claim]);
    const res = await post().expect(200);
    expect(res.body).toEqual({
      status: 'answered',
      answer: claim.text + ' [1]',
      citations: [
        {
          id: 1,
          documentId: 'report',
          chunkIndex: 1,
          pageNumber: 3,
          filename: 'annual.pdf',
          quote: passage.content,
        },
      ],
    });
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'report', topK: 5 }),
    );
    const call = jest.mocked(fetch).mock.calls[0]!;
    expect(call[0]).toBe(config.ollamaBaseUrl + '/api/chat');
    const payload = JSON.parse(String(call[1]?.body));
    expect(payload.model).toBe(config.chatModel);
    expect(payload.messages[0].role).toBe('system');
    expect(JSON.parse(payload.messages[1].content).sources[0].text).toBe(
      passage.content,
    );
  });
  it('skips generation for an empty document scope', async function () {
    search.mockResolvedValue({ results: [] });
    const res = await post().expect(200);
    expect(res.body).toMatchObject({
      status: 'insufficient_evidence',
      citations: [],
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('abstains when the model finds no supporting evidence', async function () {
    completion([]);
    const res = await post().expect(200);
    expect(res.body.status).toBe('insufficient_evidence');
  });
  it.each([
    { ...claim, source: 0 },
    { ...claim, source: 3 },
    { ...claim, quote: '$6 million' },
    { ...claim, text: 'wrong [999]' },
    { ...claim, quote: ' ' },
  ])(
    'rejects an invalid claim %# without returning a partial answer',
    async function (bad) {
      completion([claim, bad]);
      await post().expect(502);
    },
  );
  it('checks excerpts against the bounded context actually shown to the model', async function () {
    search.mockResolvedValue({
      results: [{ ...passage, content: 'a'.repeat(8000) + 'hidden' }],
    });
    completion([{ ...claim, quote: 'hidden' }]);
    await post().expect(502);
  });
  it('rejects invalid questions before retrieval', async function () {
    await post({ query: ' ' }).expect(400);
    expect(search).not.toHaveBeenCalled();
  });
  it('reports chat service outages', async function () {
    jest.mocked(fetch).mockRejectedValue(new Error('offline'));
    await post().expect(503);
  });
  it('recovers from truncation using an exact source excerpt', async function () {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          done: true,
          done_reason: 'length',
          message: { content: '{"claims":[]}' },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ done: true, message: { content: '{"index":1}' } }),
      );
    const res = await post().expect(200);
    expect(res.body.answer).toBe(passage.content + ' [1]');
    expect(res.body.citations[0].quote).toBe(passage.content);
  });
});
