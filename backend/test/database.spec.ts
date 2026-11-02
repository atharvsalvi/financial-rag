import { DatabaseService } from '../src/integrations/database/database.module';
import { validateEnvironment } from '../src/config/configuration';
const config = validateEnvironment({
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  REDIS_URL: 'redis://localhost',
  OLLAMA_BASE_URL: 'http://localhost:11434',
  OLLAMA_EMBEDDING_MODEL: 'test',
  EMBEDDING_DIMENSIONS: '768',
});
describe('database startup', function () {
  it('connects and verifies vector dimensions', async function () {
    const db = new DatabaseService(config);
    const connect = jest.spyOn(db, '$connect').mockResolvedValue();
    jest.spyOn(db, '$queryRaw').mockResolvedValue([{ type: 'vector(768)' }]);
    await db.onModuleInit();
    expect(connect).toHaveBeenCalled();
    await db.ping();
  });
  it('rejects mismatching schema', async function () {
    const db = new DatabaseService(config);
    jest.spyOn(db, '$connect').mockResolvedValue();
    jest.spyOn(db, '$queryRaw').mockResolvedValue([{ type: 'vector(384)' }]);
    await expect(db.onModuleInit()).rejects.toThrow('EMBEDDING_DIMENSIONS');
  });
  it('propagates connectivity failure', async function () {
    const db = new DatabaseService(config);
    jest.spyOn(db, '$connect').mockRejectedValue(new Error('offline'));
    await expect(db.onModuleInit()).rejects.toThrow('offline');
  });
});
