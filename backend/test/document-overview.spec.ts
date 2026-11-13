import {
  documentOverview,
  wantsOverview,
} from '../src/modules/answers/document-overview';

describe('document overview', () => {
  it('distinguishes a document summary from a question about one topic', () => {
    expect(wantsOverview('What is the PDF about?')).toBe(true);
    expect(wantsOverview('Could you summarize this report?')).toBe(true);
    expect(
      wantsOverview('What is the report about to spend on marketing?'),
    ).toBe(false);
    expect(wantsOverview('What skills will I gain?')).toBe(false);
  });
  it('preserves original quotes and page coordinates when unwrapping PDF lines', () => {
    const first = {
      documentId: 'doc',
      chunkIndex: 0,
      pageNumber: 1,
      startOffset: 0,
      endOffset: 52,
      metadata: {},
      content:
        'INTRODUCTION\nMembers learn through hands-on\nconsulting projects.',
    };
    const second = {
      ...first,
      chunkIndex: 2,
      pageNumber: 3,
      content: 'Members attend workshops and enter competitions.',
    };
    const result = documentOverview([first, second]);
    expect(result?.answer).toContain('hands-on consulting projects. [1]');
    expect(result?.citations.map((c) => c.pageNumber)).toEqual([1, 3]);
    expect(first.content).toContain(result!.citations[0]!.quote);
    expect(documentOverview([])).toBeUndefined();
  });
});
