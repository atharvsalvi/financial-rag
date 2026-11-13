import { cases } from '../eval/dataset';
import { grade } from '../eval/grade';
const item = cases.find((c) => c.id === 'cash22')!;
const source = {
  documentId: 'original',
  pageNumber: 90,
  quote: 'Net cash flows from operating activities 37,224 39,421 39,773',
};
function answer(text: string) {
  return { status: 'answered', answer: text, citations: [source] };
}
describe('annual report benchmark grading', function () {
  it('fails support when the quote contains the gold figure but the claim gives a different amount', function () {
    expect(
      grade(item, 'original', [source], answer('$39.421 billion')).supported,
    ).toBe(false);
  });
  it('converts dollars and billions to millions, independently of citation markers', function () {
    for (const text of [
      'FY2022: $37.224 billion [1]',
      '[1] $37,224,000,000',
      '37,224 million dollars',
    ]) {
      expect(grade(item, 'original', [source], answer(text))).toMatchObject({
        correct: true,
        supported: true,
        rank: 1,
        pass: true,
      });
    }
  });
  it.each([
    'In 2023 it was $37.224 billion',
    '37,224 billion dollars',
    '37,224',
    '-37,224 million',
    '37,224 million or 39,421 million',
  ])('rejects wrong years, units or conflicting amounts: %s', function (text) {
    expect(grade(item, 'original', [source], answer(text)).correct).toBe(false);
  });
  it('requires the document, page, metric and value in an evidence match', function () {
    for (const citation of [
      { ...source, documentId: 'later' },
      { ...source, pageNumber: 91 },
      { ...source, quote: 'Net cash flows from operating activities 37,350' },
      { ...source, quote: '37,224' },
    ]) {
      expect(
        grade(item, 'original', [source], {
          ...answer('$37.224 billion'),
          citations: [citation],
        }).supported,
      ).toBe(false);
    }
  });
  it('requires an explicit abstention with no citations for unanswerables', function () {
    const missing = cases.find((c) => c.id === 'absent25')!;
    expect(grade(missing, 'original', []).pass).toBe(false);
    expect(
      grade(missing, 'original', [], {
        status: 'insufficient_evidence',
        answer: 'Insufficient evidence',
        citations: [],
      }).pass,
    ).toBe(true);
  });
});
