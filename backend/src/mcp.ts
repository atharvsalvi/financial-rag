import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const apiBase =
  process.env.FINANCIAL_RESEARCH_API_URL || 'http://localhost:3000/api/v1';
const server = new McpServer({ name: 'financial-research', version: '0.1.0' });
const inputSchema = {
  query: z.string().trim().min(1).max(4000),
  documentId: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .optional()
    .describe(
      'Report ID from list_reports. Omit to search all indexed reports.',
    ),
  topK: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Number of passages to retrieve. Defaults to 5.'),
};
const annotations = { readOnlyHint: true, openWorldHint: false };

async function request(path: string, signal: AbortSignal, body?: object) {
  let response: Response;
  try {
    response = await fetch(apiBase.replace(/\/$/, '') + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.any([signal, AbortSignal.timeout(300000)]),
    });
  } catch (cause) {
    throw new Error(
      'Could not complete the request to FinancialResearch. Check the running backend and FINANCIAL_RESEARCH_API_URL.',
      { cause },
    );
  }
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message ?? data?.error;
    throw new Error(
      'FinancialResearch HTTP ' +
        response.status +
        (typeof message === 'string' ? ': ' + message : ''),
    );
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

server.registerTool(
  'list_reports',
  {
    description:
      'List indexed reports with their IDs, filenames and indexed page counts.',
    inputSchema: {},
    annotations,
  },
  (_args, context) => request('/dashboard/reports', context.signal),
);

server.registerTool(
  'search_reports',
  {
    description:
      'Retrieve matching report passages with source text, page numbers and similarity scores.',
    inputSchema,
    annotations,
  },
  (args, context) => request('/retrieval/search', context.signal, args),
);

server.registerTool(
  'ask_report',
  {
    description:
      'Ask a question using indexed reports. Returns an answer with source citations or an insufficient-evidence result.',
    inputSchema,
    annotations,
  },
  (args, context) => request('/answers', context.signal, args),
);

server.connect(new StdioServerTransport()).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
