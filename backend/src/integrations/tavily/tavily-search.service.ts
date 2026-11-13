import {
  BadGatewayException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CONFIG, Configuration } from '../../config/configuration';

export interface WebPassage {
  title: string;
  url: string;
  text: string;
}

function sourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !URL.canParse(value)) return;
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return;
  url.hash = '';
  return url.href;
}

@Injectable()
export class TavilySearchService {
  constructor(@Inject(CONFIG) private readonly config: Configuration) {}

  async search(query: string, topK: number): Promise<WebPassage[]> {
    if (!this.config.tavilyApiKey)
      throw new ServiceUnavailableException(
        'Configure TAVILY_API_KEY to enable web search.',
      );
    let response: Response;
    try {
      response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: 'Bearer ' + this.config.tavilyApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          max_results: topK,
          search_depth: 'basic',
          include_answer: false,
          include_raw_content: false,
        }),
      });
      if (!response.ok)
        throw new Error('Search provider HTTP ' + response.status);
    } catch (cause) {
      throw new ServiceUnavailableException('Web search is unavailable.', {
        cause,
      });
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new BadGatewayException('Invalid web search response.');
    }
    if (
      typeof body !== 'object' ||
      body === null ||
      !('results' in body) ||
      !Array.isArray(body.results)
    )
      throw new BadGatewayException('Invalid web search response.');
    const results: WebPassage[] = [];
    const seen = new Set<string>();
    for (const row of body.results) {
      const url = sourceUrl(row?.url);
      if (
        !url ||
        seen.has(url) ||
        typeof row.content !== 'string' ||
        !row.content.trim()
      )
        continue;
      seen.add(url);
      results.push({
        url,
        title:
          typeof row.title === 'string' && row.title.trim()
            ? row.title.trim().slice(0, 300)
            : new URL(url).hostname,
        text: row.content.trim().slice(0, 2000),
      });
      if (results.length === topK) break;
    }
    return results;
  }
}
