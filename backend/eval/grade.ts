import { Case, reports } from './dataset';
export interface Source {
  documentId: string;
  pageNumber: number | null;
  content?: string;
  quote?: string;
}
export interface Answer {
  status: string;
  answer: string;
  citations: Source[];
}

function values(text: string, table: boolean): number[] {
  const found: number[] = [];
  const clean = text.replace(/\[\d+\]/g, '');
  const tokens = clean.matchAll(
    /(?<![\w.])(-?\d[\d,]*(?:\.\d+)?)\s*(billion|million|trillion|thousand|bn\b|mn\b)?/gi,
  );
  for (const m of tokens) {
    const unit = m[2]?.toLowerCase();
    const scale =
      unit === 'billion' || unit === 'bn'
        ? 1000
        : unit === 'trillion'
          ? 1000000
          : unit === 'thousand'
            ? 0.001
            : 1;
    if (unit || table) found.push(Number(m[1]!.replaceAll(',', '')) * scale);
    else if (clean[m.index! - 1] === '$')
      found.push(Number(m[1]!.replaceAll(',', '')) / 1000000);
  }
  return found;
}
export function grade(
  c: Case,
  expectedId: string,
  hits: Source[],
  answer?: Answer,
) {
  function gold(source: Source) {
    if (
      c.alternate &&
      source.documentId ===
        'pdf-' + reports.find((r) => r.year === c.alternate?.report)?.hash &&
      c.alternate.pages.includes(source.pageNumber ?? 0)
    )
      return true;
    return (
      source.documentId === expectedId &&
      c.pages.includes(source.pageNumber ?? 0)
    );
  }
  const rank = hits.findIndex(gold) + 1;
  if (c.amountMillions === undefined) {
    const abstained =
      answer?.status === 'insufficient_evidence' &&
      answer.citations.length === 0;
    return {
      rank: null,
      correct: null,
      supported: null,
      abstained,
      pass: abstained,
    };
  }
  const text = answer?.answer ?? '';
  const amounts = values(text, false);
  const correct =
    answer?.status === 'answered' &&
    amounts.length > 0 &&
    amounts.every((v) => Math.abs(v - c.amountMillions!) < 0.000001) &&
    !Array.from(text.matchAll(/\b(?:FY\s*)?(20\d\d)\b/gi)).some(
      (m) => Number(m[1]) !== c.year,
    );
  const supported =
    correct &&
    !!answer?.citations.some((source) => {
      const quote = source.quote ?? '';
      return (
        gold(source) &&
        quote.toLowerCase().includes(c.metric!.toLowerCase()) &&
        values(quote, true).some(
          (v) => Math.abs(v - c.amountMillions!) < 0.000001,
        )
      );
    });
  return {
    rank,
    correct,
    supported,
    abstained: null,
    pass: correct && supported,
  };
}
