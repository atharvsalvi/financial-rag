import 'dotenv/config';
import { Global, Module } from '@nestjs/common';

export const CONFIG = Symbol('CONFIG');
export interface Configuration {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  ollamaBaseUrl: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingBatchSize: number;
  ollamaTimeoutMs: number;
  chunkSize: number;
  chunkOverlap: number;
}
export function validateEnvironment(env: NodeJS.ProcessEnv): Configuration {
  function required(key: string): string {
    const value = env[key]?.trim();
    if (!value) throw new Error(`Missing environment variable: ${key}`);
    return value;
  }
  function integer(key: string, fallback?: number, minimum = 1): number {
    const raw =
      env[key] ?? (fallback === undefined ? required(key) : String(fallback));
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < minimum)
      throw new Error(`Invalid integer: ${key}`);
    return value;
  }
  function url(key: string, protocols: string[]): string {
    const raw = required(key);
    const parsed = new URL(raw);
    if (!protocols.includes(parsed.protocol))
      throw new Error(`Invalid URL protocol: ${key}`);
    return raw;
  }
  const nodeEnv = required('NODE_ENV');
  if (!['development', 'test', 'production'].includes(nodeEnv))
    throw new Error('Invalid NODE_ENV');
  const config = {
    nodeEnv,
    port: integer('PORT'),
    databaseUrl: url('DATABASE_URL', ['postgres:', 'postgresql:']),
    redisUrl: url('REDIS_URL', ['redis:', 'rediss:']),
    ollamaBaseUrl: url('OLLAMA_BASE_URL', ['http:', 'https:']).replace(
      /\/$/,
      '',
    ),
    embeddingModel: required('OLLAMA_EMBEDDING_MODEL'),
    embeddingDimensions: integer('EMBEDDING_DIMENSIONS'),
    embeddingBatchSize: integer('EMBEDDING_BATCH_SIZE', 16),
    ollamaTimeoutMs: integer('OLLAMA_TIMEOUT_MS', 30000),
    chunkSize: integer('CHUNK_SIZE', 1000),
    chunkOverlap: integer('CHUNK_OVERLAP', 150, 0),
  };
  if (config.port > 65535) throw new Error('PORT exceeds 65535');
  if (config.chunkOverlap >= config.chunkSize)
    throw new Error('CHUNK_OVERLAP must be less than CHUNK_SIZE');
  return config;
}
export function configuration(): Configuration {
  return validateEnvironment(process.env);
}
@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: configuration }],
  exports: [CONFIG],
})
export class ConfigurationModule {}
