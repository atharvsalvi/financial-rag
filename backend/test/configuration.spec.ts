import { validateEnvironment } from '../src/config/configuration';
export const testEnvironment = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  OLLAMA_BASE_URL: 'http://localhost:11434',
  OLLAMA_EMBEDDING_MODEL: 'test-model',
  EMBEDDING_DIMENSIONS: '768',
};
describe('configuration', function () {
  it('validates defaults', function () {
    expect(validateEnvironment(testEnvironment).chunkSize).toBe(1000);
  });
  it.each(Object.keys(testEnvironment))('requires %s', function (key) {
    expect(function () {
      validateEnvironment({ ...testEnvironment, [key]: '' });
    }).toThrow();
  });
  it.each([
    { PORT: '0' },
    { PORT: '65536' },
    { EMBEDDING_DIMENSIONS: 'x' },
    { CHUNK_OVERLAP: '1000' },
    { DATABASE_URL: 'http://example.com' },
    { NODE_ENV: 'invalid' },
  ])('rejects %p', function (override) {
    expect(function () {
      validateEnvironment({ ...testEnvironment, ...override });
    }).toThrow();
  });
});
