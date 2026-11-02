import { ChunkingService } from '../src/modules/chunking/chunking.service';
import { DocumentProcessingService } from '../src/modules/processing/document-processing.service';
import { EmbeddedChunk } from '../src/modules/processing/chunk-repository';
import { config } from './support';
describe('document processing', function () {
  const repository = {
    findByDocumentId: jest.fn<Promise<EmbeddedChunk[]>, [string]>(),
    replaceDocument: jest.fn().mockResolvedValue(undefined),
  };
  const provider = { embed: jest.fn(), embedMany: jest.fn() };
  const service = new DocumentProcessingService(
    new ChunkingService({ ...config, chunkSize: 4, chunkOverlap: 0 }),
    provider,
    repository,
    config,
  );
  beforeEach(function () {
    jest.clearAllMocks();
    repository.findByDocumentId.mockResolvedValue([]);
    provider.embedMany.mockImplementation(async function vectors(
      texts: string[],
    ) {
      return texts.map(function vector() {
        return [1, 2, 3];
      });
    });
  });
  it('chunks, batches, validates and saves after network work', async function () {
    const chunks = await service.process({
      documentId: 'd',
      text: 'abcdefghijkl',
      metadata: { ticker: 'TEST' },
    });
    expect(provider.embedMany.mock.calls).toEqual([
      [['abcd', 'efgh']],
      [['ijkl']],
    ]);
    expect(repository.replaceDocument).toHaveBeenCalledWith('d', chunks);
    expect(
      repository.replaceDocument.mock.invocationCallOrder[0],
    ).toBeGreaterThan(provider.embedMany.mock.invocationCallOrder[1]!);
    expect(chunks[0]?.metadata).toEqual({ ticker: 'TEST' });
  });
  it('deduplicates identical content and reuses stored model-matched embeddings', async function () {
    const first = await service.process({ documentId: 'd', text: 'abcdabcd' });
    expect(provider.embedMany).toHaveBeenCalledWith(['abcd']);
    repository.findByDocumentId.mockResolvedValue(first);
    provider.embedMany.mockClear();
    await service.process({
      documentId: 'd',
      text: 'abcdabcd',
      metadata: { updated: true },
    });
    expect(provider.embedMany).not.toHaveBeenCalled();
  });
  it('regenerates embeddings when model changes', async function () {
    const first = await service.process({ documentId: 'd', text: 'abcd' });
    repository.findByDocumentId.mockResolvedValue(
      first.map(function old(c) {
        return { ...c, embeddingModel: 'old' };
      }),
    );
    provider.embedMany.mockClear();
    await service.process({ documentId: 'd', text: 'abcd' });
    expect(provider.embedMany).toHaveBeenCalledTimes(1);
  });
  it('does not persist partial results after a batch failure and identifies batch/document', async function () {
    provider.embedMany
      .mockResolvedValueOnce([
        [1, 2, 3],
        [1, 2, 3],
      ])
      .mockRejectedValueOnce(new Error('offline'));
    await expect(
      service.process({ documentId: 'd', text: 'abcdefghijkl' }),
    ).rejects.toMatchObject({
      message: 'Processing document d failed',
      cause: { message: 'Embedding batch 1 failed for document d' },
    });
    expect(repository.replaceDocument).not.toHaveBeenCalled();
  });
  it.each([
    { response: [] },
    { response: [[1, 2]] },
    {
      response: [
        [1, 2, 3],
        [1, 2, 3],
      ],
    },
  ])('validates arbitrary provider responses', async function ({ response }) {
    provider.embedMany.mockResolvedValueOnce(response);
    await expect(
      service.process({ documentId: 'd', text: 'abcd' }),
    ).rejects.toThrow();
    expect(repository.replaceDocument).not.toHaveBeenCalled();
  });
  it('does not erase existing data on empty extraction', async function () {
    expect(await service.process({ documentId: 'd', text: ' ' })).toEqual([]);
    expect(repository.replaceDocument).not.toHaveBeenCalled();
    expect(provider.embedMany).not.toHaveBeenCalled();
  });
  it('propagates persistence errors', async function () {
    repository.replaceDocument.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(
      service.process({ documentId: 'd', text: 'abcd' }),
    ).rejects.toMatchObject({ cause: { message: 'database unavailable' } });
  });
});
