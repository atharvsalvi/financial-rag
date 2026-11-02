import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, validateEnvironment } from '../src/config/configuration';
import { DatabaseService } from '../src/integrations/database/database.module';
import { setup } from '../src/setup';

export const config = validateEnvironment({
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  REDIS_URL: 'redis://localhost',
  OLLAMA_BASE_URL: 'http://localhost:11434',
  OLLAMA_EMBEDDING_MODEL: 'test-model',
  EMBEDDING_DIMENSIONS: '768',
});
describe('application startup and health', function () {
  let app: INestApplication;
  const database = { ping: jest.fn().mockResolvedValue(undefined) };
  beforeEach(async function () {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CONFIG)
      .useValue(config)
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();
    app = module.createNestApplication();
    setup(app);
    await app.init();
  });
  afterEach(async function () {
    await app.close();
    jest.restoreAllMocks();
    database.ping.mockReset().mockResolvedValue(undefined);
  });
  it('starts and reports healthy dependencies', async function () {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(response.body).toEqual({
      status: 'ok',
      dependencies: { postgres: 'up', ollama: 'up' },
    });
  });
  it('reports failed PostgreSQL', async function () {
    database.ping.mockRejectedValue(new Error('offline'));
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503);
    expect(response.body.error.dependencies.postgres).toBe('down');
  });
  it('reports failed Ollama', async function () {
    jest.mocked(fetch).mockRejectedValue(new Error('offline'));
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(503);
    expect(response.body.error.dependencies.ollama).toBe('down');
  });
});
