import { TextChunk } from '../chunking/chunk.types';

export function wantsOverview(query: string) {
  const normalized = query
    .toLowerCase()
    .trim()
    .replace(/^(?:(?:can|could) you |please )+/u, '')
    .replace(
      /\b(?:(?:this|that|my|the|selected|uploaded|attached)\s+)*(?:pdf|report|document|brochure|filing)\b/gu,
      'document',
    )
    .replace(/[?.!]+$/u, '')
    .trim();
  return /^(?:what(?: is|'s|’s) document (?:mainly )?about|what does document (?:cover|discuss)|summari[sz]e (?:document|it)|(?:give me |provide )?(?:a |an )?(?:brief )?(?:summary|overview) of document|(?:document )?(?:summary|overview))$/u.test(
    normalized,
  );
}
// Extract an introduction and representative section openings. Keep original
// spans for citations while removing PDF line wrapping from the displayed prose.
export function documentOverview(passages: TextChunk[]) {
  const citations = [];
  const lines = [];
  const seen = new Set<string>();
  for (const hit of passages) {
    const sentences = hit.content.match(/[^.!?]+[.!?](?=\s|$)/gu) || [
      hit.content,
    ];
    for (const sentence of sentences) {
      const quote = sentence
        .trim()
        .replace(/^(?:[^\na-z]+\n)+/u, '')
        .trim();
      const text = quote.replace(/-\s*\n\s*/g, '-').replace(/\s+/gu, ' ');
      if (text.length < 32 || text.length > 440 || seen.has(text)) continue;
      seen.add(text);
      const id: number = citations.length + 1;
      citations.push({
        id,
        documentId: hit.documentId,
        chunkIndex: hit.chunkIndex,
        pageNumber: hit.pageNumber,
        filename:
          typeof hit.metadata.sourceFilename === 'string'
            ? hit.metadata.sourceFilename
            : null,
        quote,
      });
      lines.push(text + ' [' + id + ']');
      break;
    }
  }
  return lines.length
    ? { status: 'answered', answer: lines.join(' '), citations }
    : undefined;
}
