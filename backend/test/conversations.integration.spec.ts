import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/integrations/database/database.module';
import { AnswerService } from '../src/modules/answers/answer.service';
import { setup } from '../src/setup';

describe('persisted conversations', function () {
  let app: INestApplication;
  const answer = jest.fn();
  const idList: string[] = [];
  beforeAll(async function () {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AnswerService)
      .useValue({ answer })
      .compile();
    app = module.createNestApplication();
    setup(app);
    await app.init();
  });
  afterAll(async function () {
    try {
      await app
        .get(DatabaseService)
        .conversation.deleteMany({ where: { id: { in: idList } } });
    } finally {
      await app.close();
    }
  });
  beforeEach(function () {
    answer.mockReset().mockResolvedValue({
      status: 'answered',
      answer: 'Revenue grew. [1]',
      citations: [{ id: 1, pageNumber: 2, quote: 'Revenue grew.' }],
    });
  });
  async function create() {
    const res = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .send({ documentId: 'report' })
      .expect(201);
    idList.push(res.body.id);
    return '/api/v1/conversations/' + res.body.id;
  }
  it('retains the document scope, orders turns and preserves citation snapshots', async function () {
    const path = await create();
    const initial = await request(app.getHttpServer())
      .post(path + '/turns')
      .send({ query: 'How was revenue?', version: 0 })
      .expect(201);
    const next = await request(app.getHttpServer())
      .post(path + '/turns')
      .send({ query: 'By how much?', version: 1 })
      .expect(201);
    expect(answer).toHaveBeenLastCalledWith(
      { query: 'By how much?', documentId: 'report', topK: 5 },
      [{ question: 'How was revenue?', answer: 'Revenue grew. [1]' }],
    );
    const history = await request(app.getHttpServer()).get(path).expect(200);
    expect(history.body).toMatchObject({
      version: 2,
      documentId: 'report',
      turns: [initial.body, next.body],
    });
    const page = await request(app.getHttpServer())
      .get(path + '?after=1')
      .expect(200);
    expect(page.body.turns).toEqual([next.body]);
  });
  it('commits one concurrent turn and rejects a stale retry', async function () {
    const path = await create();
    function post() {
      return request(app.getHttpServer())
        .post(path + '/turns')
        .send({ query: 'Cash flow?', version: 0 });
    }
    const responses = await Promise.all([post(), post()]);
    expect(
      responses
        .map(function status(r) {
          return r.status;
        })
        .sort(),
    ).toEqual([201, 409]);
    await post().expect(409);
    const history = await request(app.getHttpServer()).get(path).expect(200);
    expect(history.body.version).toBe(1);
    expect(history.body.turns).toHaveLength(1);
  });
  it('can retry after a generation failure without a partial turn', async function () {
    const path = await create();
    answer.mockRejectedValueOnce(new Error('temporary failure'));
    const body = { query: 'Revenue?', version: 0 };
    await request(app.getHttpServer())
      .post(path + '/turns')
      .send(body)
      .expect(500);
    await request(app.getHttpServer())
      .post(path + '/turns')
      .send(body)
      .expect(201);
    const history = await request(app.getHttpServer()).get(path).expect(200);
    expect(history.body.turns).toHaveLength(1);
  });
  it('validates input and reports unknown conversations', async function () {
    const path = await create();
    await request(app.getHttpServer())
      .post(path + '/turns')
      .send({ query: '  ', version: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .get(path + '?after=-1')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/conversations/' + randomUUID())
      .expect(404);
    expect(answer).not.toHaveBeenCalled();
  });
});
