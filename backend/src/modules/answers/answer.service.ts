import { BadGatewayException, Injectable } from '@nestjs/common';
import {
  OllamaAnswerService,
  PriorTurn,
  PromptSource,
} from '../../integrations/ollama/ollama-answer.service';
import { RetrievalService } from '../retrieval/retrieval.service';
import { SearchDto } from '../retrieval/search.dto';
import { TavilySearchService } from '../../integrations/tavily/tavily-search.service';
import { WebQuestionDto } from './web-question.dto';
import { documentOverview, wantsOverview } from './document-overview';

interface DocumentOrigin {
  documentId: string;
  chunkIndex: number;
  pageNumber: number | null;
  filename: string | null;
}
interface WebOrigin {
  type: 'web';
  url: string;
  title: string;
}
type Origin = DocumentOrigin | WebOrigin;
type Citation = Origin & { id: number; quote: string };
type Evidence = Omit<PromptSource, 'id'> & { origin: Origin };
function metadataText(value: unknown) {
  return typeof value === 'string' ? value.slice(0, 200) : undefined;
}
function insufficient() {
  return {
    status: 'insufficient_evidence',
    answer:
      'The retrieved passages do not contain enough evidence to answer this question.',
    citations: [],
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class AnswerService {
  constructor(
    private readonly retrieval: RetrievalService,
    private readonly chat: OllamaAnswerService,
    private readonly webSearch: TavilySearchService,
  ) {}

  async answer(request: SearchDto, history?: PriorTurn[]) {
    if (request.documentId && wantsOverview(request.query)) {
      return (
        documentOverview(await this.retrieval.overview(request.documentId)) ??
        insufficient()
      );
    }
    const previous = history?.at(-1);
    const { results } = await this.retrieval.search(
      previous
        ? {
            ...request,
            query: [request.query, previous.question, previous.answer]
              .join('\n')
              .slice(0, 4000),
          }
        : request,
    );
    const evidence = results.map(function documentEvidence(hit): Evidence {
      const filename = metadataText(hit.metadata.sourceFilename);
      return {
        text: hit.content,
        page: hit.pageNumber,
        filename,
        company: metadataText(hit.metadata.company),
        ticker: metadataText(hit.metadata.ticker),
        origin: {
          documentId: hit.documentId,
          chunkIndex: hit.chunkIndex,
          pageNumber: hit.pageNumber,
          filename: filename ?? null,
        },
      };
    });
    const result = await this.generate(request.query.trim(), evidence, history);
    // A monetary answer needs a value in its cited evidence. Headings and
    // descriptions alone cannot establish a price, even if retrieved first.
    if (
      /\b(?:how much|what (?:is|was|are|were))\b/i.test(request.query) &&
      /\b(?:fees?|prices?|costs?|tuition)\b/i.test(request.query) &&
      !result.citations.some((c) =>
        /\d|\b(?:free|waived|no (?:fee|charge)|zero)\b/i.test(c.quote),
      )
    )
      return insufficient();
    return result;
  }

  async answerWeb(request: WebQuestionDto) {
    const question = request.query.trim();
    const results = await this.webSearch.search(question, request.topK);
    const evidence = results.map(function webEvidence(hit): Evidence {
      return {
        text: hit.text,
        page: null,
        title: hit.title,
        origin: { type: 'web', url: hit.url, title: hit.title },
      };
    });
    return this.generate(question, evidence);
  }

  private async generate(
    question: string,
    evidence: Evidence[],
    history?: PriorTurn[],
  ) {
    const sources: PromptSource[] = [];
    let budget = 8000;
    for (const item of evidence) {
      if (budget <= 0) break;
      const text = item.text.slice(0, budget);
      sources.push({
        id: sources.length + 1,
        text,
        page: item.page,
        filename: item.filename,
        company: item.company,
        ticker: item.ticker,
        title: item.title,
      });
      budget -= text.length;
    }
    if (!sources.length) return insufficient();
    let draft;
    try {
      draft = await this.chat.generate(question, sources, history);
    } catch (error) {
      if (
        !(error instanceof BadGatewayException) ||
        (evidence[0]?.origin && 'url' in evidence[0].origin)
      )
        throw error;
      return this.extractAnswer(question, sources, evidence, history);
    }
    if (
      !isRecord(draft) ||
      !Array.isArray(draft.claims) ||
      draft.claims.length > 6
    )
      throw new BadGatewayException('Invalid answer structure.');
    if (!draft.claims.length) return insufficient();

    const sentences: string[] = [];
    const citations: Citation[] = [];
    for (const claim of draft.claims as unknown[]) {
      if (
        !isRecord(claim) ||
        typeof claim.text !== 'string' ||
        !claim.text.trim() ||
        /\[\d+\]/.test(claim.text) ||
        typeof claim.source !== 'number' ||
        !Number.isInteger(claim.source) ||
        typeof claim.quote !== 'string' ||
        !claim.quote.trim()
      )
        throw new BadGatewayException(
          'Answer contains an incomplete citation.',
        );
      const index = claim.source - 1;
      const source = sources[index];
      const hit = evidence[index];
      const quote = claim.quote.trim();
      if (
        !source ||
        !hit ||
        ('url' in hit.origin && !source.text.includes(quote))
      )
        throw new BadGatewayException(
          'Answer cites evidence outside the supplied passage.',
        );
      if (!source.text.includes(quote))
        return this.extractAnswer(question, sources, evidence, history);
      const id = citations.length + 1;
      citations.push({
        id,
        ...hit.origin,
        quote,
      });
      sentences.push(claim.text.trim() + ' [' + id + ']');
    }
    return { status: 'answered', answer: sentences.join(' '), citations };
  }

  private async extractAnswer(
    question: string,
    sources: PromptSource[],
    evidence: Evidence[],
    history?: PriorTurn[],
  ) {
    const excerpts = sources.flatMap((source) =>
      source.text
        .split(/(?<=[.!?])\s+|\n+/u)
        .map((text) => text.trim())
        .filter(Boolean)
        .map((quote) => ({ quote, source: source.id })),
    );
    if (!excerpts.length) return insufficient();
    const choice = await this.chat.selectExcerpt(
      question,
      excerpts.map((item) => item.quote),
      history,
    );
    if (
      !isRecord(choice) ||
      typeof choice.index !== 'number' ||
      !Number.isInteger(choice.index)
    )
      throw new BadGatewayException(
        'Ollama could not select a supporting excerpt.',
      );
    if (choice.index === 0) return insufficient();
    const selected = excerpts[choice.index - 1];
    if (!selected) throw new BadGatewayException('Invalid excerpt selection.');
    return {
      status: 'answered',
      answer: selected.quote + ' [1]',
      citations: [
        {
          id: 1,
          ...evidence[selected.source - 1]!.origin,
          quote: selected.quote,
        },
      ],
    };
  }
}
