import { OllamaEmbeddingProvider } from '../src/integrations/ollama/ollama-embedding.provider';
import { config } from './support';
const vector = [0.1, 0.2, 0.3];
describe('Ollama embedding provider', function () {
  const provider = new OllamaEmbeddingProvider(config);
  beforeEach(function () {
    jest.spyOn(global, 'fetch');
  });
  afterEach(function () {
    jest.restoreAllMocks();
  });
  it('generates a single embedding using configured model without truncation', async function () {
    jest
      .mocked(fetch)
      .mockResolvedValue(Response.json({ embeddings: [vector] }));
    expect(await provider.embed('revenue')).toEqual(vector);
    expect(
      JSON.parse(String(jest.mocked(fetch).mock.calls[0]?.[1]?.body)),
    ).toEqual({ model: 'test-model', input: ['revenue'], truncate: false });
  });
  it('bounds batches and preserves result order', async function () {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(Response.json({ embeddings: [vector, [1, 2, 3]] }))
      .mockResolvedValueOnce(Response.json({ embeddings: [[4, 5, 6]] }));
    expect(await provider.embedMany(['one', 'two', 'three'])).toEqual([
      vector,
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('returns empty results without network calls', async function () {
    expect(await provider.embedMany([])).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects whitespace-only input', async function () {
    await expect(provider.embed(' ')).rejects.toThrow('empty');
  });
  it.each([
    { embeddings: [[]] },
    { embeddings: [[1, 2]] },
    { embeddings: [[0, 0, 0]] },
    { embeddings: [[1, null, 3]] },
    { embeddings: [[1e100, 2, 3]] },
    { embeddings: [] },
  ])('rejects malformed vectors %p', async function ({ embeddings }) {
    jest.mocked(fetch).mockResolvedValue(Response.json({ embeddings }));
    await expect(provider.embed('text')).rejects.toThrow('batch at input 0');
  });
  it('rejects provider HTTP errors', async function () {
    jest
      .mocked(fetch)
      .mockResolvedValue(new Response('private error body', { status: 500 }));
    await expect(provider.embed('text')).rejects.toMatchObject({
      cause: { message: 'Ollama HTTP 500' },
    });
  });
  it('enforces a timeout through AbortSignal', async function () {
    const fast = new OllamaEmbeddingProvider({
      ...config,
      ollamaTimeoutMs: 10,
    });
    jest.mocked(fetch).mockImplementation(function timeout(_url, init) {
      return new Promise(function pending(_resolve, reject) {
        init?.signal?.addEventListener('abort', function aborted() {
          reject(init.signal?.reason);
        });
      });
    });
    await expect(fast.embed('text')).rejects.toMatchObject({
      cause: { name: 'TimeoutError' },
    });
  });
  it('fails the entire operation on a later batch error', async function () {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(Response.json({ embeddings: [vector, vector] }))
      .mockRejectedValueOnce(new Error('offline'));
    await expect(provider.embedMany(['one', 'two', 'three'])).rejects.toThrow(
      'input 2',
    );
  });
});
