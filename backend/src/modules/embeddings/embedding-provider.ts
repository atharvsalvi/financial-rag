export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedMany(texts: string[]): Promise<number[][]>;
}
export function validateVectors(
  value: unknown,
  count: number,
  dimensions: number,
): asserts value is number[][] {
  if (!Array.isArray(value) || value.length !== count)
    throw new Error(`Embedding response count must be ${count}`);
  for (const vector of value) {
    if (
      !Array.isArray(vector) ||
      vector.length !== dimensions ||
      !vector.every(function finite(item: unknown) {
        return (
          typeof item === 'number' &&
          Number.isFinite(item) &&
          Math.abs(item) <= 3.4028234663852886e38
        );
      })
    ) {
      throw new Error(
        `Embedding vectors must contain ${dimensions} finite float32-compatible numbers`,
      );
    }
    if (
      vector.every(function zero(item: number) {
        return item === 0;
      })
    )
      throw new Error('Embedding vector must be nonzero');
  }
}
