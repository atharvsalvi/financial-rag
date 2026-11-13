import { Answer, Source } from './grade';

// Run against the user's existing indexed copy; no private PDF is distributed.
async function run() {
  const base =
    process.env.FINANCIAL_RESEARCH_API_URL || 'http://localhost:3000/api/v1';
  async function api(path: string, body?: object) {
    const response = await fetch(
      base + path,
      body && {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw new Error(path + ' HTTP ' + response.status);
    return response.json();
  }
  const reports: { id: string; name: string; chunks: number }[] =
    await api('/dashboard/reports');
  const report = reports.find(
    (r) => r.name === 'DJ Consulting Group Brochure.pdf',
  );
  if (!report || report.chunks > 20)
    throw new Error(
      'This check needs the indexed five-page DJ Consulting Group brochure.',
    );
  const { results }: { results: Source[] } = await api('/retrieval/search', {
    query: 'Consulting group',
    topK: 20,
    documentId: report.id,
  });
  for (const [kind, query] of [
    ['overview', 'What is the PDF about?'],
    ['skills', 'What skills will I gain?'],
    ['absent', 'What is the annual membership fee in rupees?'],
  ] as const) {
    const a: Answer = await api('/answers', { query, documentId: report.id });
    const cited =
      a.citations.length > 0 &&
      a.citations.every((c) =>
        results.some(
          (r) =>
            r.documentId === c.documentId &&
            r.pageNumber === c.pageNumber &&
            c.quote &&
            r.content?.includes(c.quote),
        ),
      );
    const pages = new Set(a.citations.map((c) => c.pageNumber));
    const pass =
      kind === 'absent'
        ? a.status === 'insufficient_evidence' && !a.citations.length
        : a.status === 'answered' &&
          cited &&
          (kind === 'overview'
            ? pages.has(1) &&
              pages.size >= 2 &&
              /consulting group/i.test(a.answer) &&
              /competition|workshop|mentorship/i.test(a.answer)
            : /reasoning|analysis|analytical|research|communication|teamwork|problem.solving/i.test(
                a.answer,
              ));
    console.log(
      JSON.stringify({
        kind,
        pass,
        status: a.status,
        pages: [...pages],
        answer: a.answer,
      }),
    );
    if (!pass) process.exitCode = 1;
  }
}
void run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
