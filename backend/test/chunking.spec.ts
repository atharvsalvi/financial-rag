import {
  ChunkingService,
  normalizeText,
} from '../src/modules/chunking/chunking.service';
import { config } from './support';
const service = new ChunkingService(config);
describe('chunking', function () {
  it.each(['', ' \t\r\n '])('ignores empty text %p', function (text) {
    expect(service.chunk({ documentId: 'd', text })).toEqual([]);
  });
  it.each(['short', '1234567890'])(
    'handles short or exact-size text',
    function (text) {
      const chunks = service.chunk(
        { documentId: 'd', text },
        { chunkSize: 10, chunkOverlap: 2 },
      );
      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.content).toBe(text);
    },
  );
  it('has exact overlap with no boundary loss or accidental duplication', function () {
    const text = 'abcdefghijklmnopqrstuvwxyz';
    const chunks = service.chunk(
      { documentId: 'd', text },
      { chunkSize: 10, chunkOverlap: 3 },
    );
    expect(
      chunks.map(function content(chunk) {
        return chunk.content;
      }),
    ).toEqual(['abcdefghij', 'hijklmnopq', 'opqrstuvwx', 'vwxyz']);
    let reconstructed = '';
    let end = 0;
    for (const chunk of chunks) {
      reconstructed += Array.from(chunk.content)
        .slice(Math.max(0, end - chunk.startOffset))
        .join('');
      end = chunk.endOffset;
    }
    expect(reconstructed).toBe(text);
  });
  it('prefers paragraph over sentence boundaries', function () {
    const chunks = service.chunk(
      {
        documentId: 'd',
        text: 'First para.\n\nSecond sentence. More text follows here.',
      },
      { chunkSize: 35, chunkOverlap: 0 },
    );
    expect(chunks[0]?.content).toBe('First para.\n\n');
  });
  it('prefers section boundaries', function () {
    const chunks = service.chunk(
      {
        documentId: 'd',
        text: '# Revenue\n$10.\n\n# Costs\n$5.\n\nDetails continue for many more characters.',
      },
      { chunkSize: 40, chunkOverlap: 0 },
    );
    expect(chunks[0]?.content).toBe('# Revenue\n$10.\n\n');
  });
  it('prefers sentence boundaries in a long paragraph', function () {
    const chunks = service.chunk(
      {
        documentId: 'd',
        text: 'Revenue rose. Costs fell. More details continue.',
      },
      { chunkSize: 30, chunkOverlap: 0 },
    );
    expect(chunks[0]?.content).toBe('Revenue rose. Costs fell. ');
  });
  it('normalizes whitespace and preserves financial formatting', function () {
    const text =
      '  FY2026 Q2\r\nRevenue\t$12,000  15%  \r\n\r\n\r\nProfit €2.5m / ₹400\r\n  Units: millions  ';
    const content = service.chunk({ documentId: 'd', text })[0]?.content;
    expect(content).toBe(
      'FY2026 Q2\nRevenue\t$12,000  15%\n\nProfit €2.5m / ₹400\n  Units: millions',
    );
  });
  it('preserves pages, order and extensible metadata without mutation', function () {
    const metadata = { ticker: 'NVDA', extra: { currency: 'USD' } };
    const chunks = service.chunk({
      documentId: 'd',
      metadata,
      pages: [
        { pageNumber: 12, text: 'Q2 revenue $10', metadata: { quarter: 'Q2' } },
        { pageNumber: 13, text: 'Q3 revenue $12' },
      ],
    });
    expect(
      chunks.map(function page(c) {
        return [c.chunkIndex, c.pageNumber];
      }),
    ).toEqual([
      [0, 12],
      [1, 13],
    ]);
    expect(chunks[0]?.metadata).toEqual({ ...metadata, quarter: 'Q2' });
    expect(chunks[0]?.metadata.extra).not.toBe(metadata.extra);
  });
  it('handles long Unicode text without splitting surrogate pairs and reconstructs exactly', function () {
    const text = '收益 📈 $123.45 20%。\n\n'.repeat(4000).trim();
    const chunks = service.chunk(
      { documentId: 'd', text },
      { chunkSize: 101, chunkOverlap: 17 },
    );
    let reconstructed = '';
    let end = 0;
    for (const [index, chunk] of chunks.entries()) {
      expect(chunk.chunkIndex).toBe(index);
      expect(Array.from(chunk.content).length).toBeLessThanOrEqual(101);
      expect(
        Array.from(chunk.content).some(function unpaired(point) {
          return point.length === 1 && /[\uD800-\uDFFF]/u.test(point);
        }),
      ).toBe(false);
      expect(chunk.content.trim()).not.toBe('');
      expect(chunk.startOffset).toBeLessThanOrEqual(end);
      reconstructed += Array.from(chunk.content)
        .slice(end - chunk.startOffset)
        .join('');
      end = chunk.endOffset;
    }
    expect(reconstructed).toBe(normalizeText(text));
  });
  it.each([
    { chunkSize: 0 },
    { chunkSize: 10, chunkOverlap: 10 },
    { chunkOverlap: -1 },
    { chunkSize: 1.5 },
  ])('rejects invalid options %p', function (options) {
    expect(function () {
      service.chunk({ documentId: 'd', text: 'text' }, options);
    }).toThrow();
  });
  it('rejects invalid document or page identity', function () {
    expect(function () {
      service.chunk({ documentId: '', text: 'text' });
    }).toThrow();
    expect(function () {
      service.chunk({
        documentId: 'd',
        pages: [{ pageNumber: 0, text: 'text' }],
      });
    }).toThrow();
  });
});
