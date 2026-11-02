import { validateEnvironment } from '../src/config/configuration';
export const config = validateEnvironment({
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  REDIS_URL: 'redis://localhost',
  OLLAMA_BASE_URL: 'http://localhost:11434',
  OLLAMA_EMBEDDING_MODEL: 'test-model',
  EMBEDDING_DIMENSIONS: '3',
  EMBEDDING_BATCH_SIZE: '2',
});
