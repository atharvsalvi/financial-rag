import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CONFIG, Configuration } from '../src/config/configuration';
import { setup } from '../src/setup';
import { reports, cases } from './dataset';
import { Answer, Source, grade } from './grade';

const cache = join(__dirname, 'cache');
const resultsDir = join(__dirname, 'results');
async function loadPdf(report: (typeof reports)[number]) {
  const path = join(cache, report.year + '.pdf');
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const res = await fetch(report.url, { signal: AbortSignal.timeout(90000) });
    if (!res.ok) throw new Error('PDF download failed: HTTP ' + res.status);
    bytes = Buffer.from(await res.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== report.hash)
    throw new Error('PDF checksum mismatch: ' + report.year);
  await writeFile(path, bytes);
  return bytes;
}

async function evaluate(app: INestApplication) {
  const http = request(app.getHttpServer());
  const ids = new Map<number, string>();
  for (const report of reports) {
    console.log('Ingesting complete annual report', report.year);
    const pdf = await loadPdf(report);
    const res = await http
      .post('/api/v1/documents/ingest')
      .field('company', 'Berkshire Hathaway')
      .field('ticker', 'BRK')
      .attach('file', pdf, 'Berkshire-' + report.year + '.pdf')
      .expect(201);
    ids.set(report.year, res.body.documentId);
    console.log(
      report.year,
      res.body.pageCount,
      'pages,',
      res.body.chunkCount,
      'chunks',
    );
  }
  const threads = new Map<
    string,
    {
      id: string;
      version: number;
      previous?: { question: string; answer: string };
    }
  >();
  const rows = [];
  for (const c of cases) {
    const expectedId = ids.get(c.report)!;
    const scope = c.scoped ? { documentId: expectedId } : {};
    let hits: Source[] = [];
    let answer: Answer | undefined;
    let error: string | undefined;
    let stage = 'retrieval';
    try {
      let thread = c.thread ? threads.get(c.thread) : undefined;
      if (thread && !thread.previous) {
        stage = 'follow-up prerequisite';
        throw new Error('Prior conversation turn did not complete');
      }
      const prev = thread?.previous;
      const query = prev
        ? [c.question, prev.question.slice(0, 500), prev.answer.slice(0, 500)]
            .join('\n')
            .slice(0, 4000)
        : c.question;
      const found = await http
        .post('/api/v1/retrieval/search')
        .send({ query, topK: 5, ...scope })
        .expect(200);
      hits = found.body.results;
      stage = 'generation';
      let response;
      if (c.thread) {
        if (!thread) {
          const created = await http
            .post('/api/v1/conversations')
            .send(scope)
            .expect(201);
          thread = { id: created.body.id, version: 0 };
          threads.set(c.thread, thread);
        }
        response = await http
          .post('/api/v1/conversations/' + thread.id + '/turns')
          .send({ query: c.question, version: thread.version });
        checkAnswer(response, 201);
        thread.version = response.body.sequence;
        thread.previous = {
          question: c.question,
          answer: response.body.answer,
        };
      } else
        response = await http
          .post('/api/v1/answers')
          .send({ query: c.question, topK: 5, ...scope });
      checkAnswer(response, c.thread ? 201 : 200);
      answer = {
        answer: response.body.answer,
        status: response.body.status,
        citations: response.body.citations,
      };
    } catch (e) {
      error = stage + ': ' + (e instanceof Error ? e.message : String(e));
    }
    const scores = grade(c, expectedId, hits, answer);
    rows.push({
      id: c.id,
      question: c.question,
      expected: {
        report: c.report,
        year: c.year,
        pages: c.pages,
        alternate: c.alternate,
        amountMillions: c.amountMillions,
      },
      ...scores,
      error,
      retrieved: hits.map((h) => ({
        documentId: h.documentId,
        page: h.pageNumber,
      })),
      answer,
    });
    console.log(c.id, scores.pass ? 'PASS' : 'MISS', error ?? '');
  }
  const numeric = rows.filter((r) => r.correct !== null);
  const absent = rows.filter((r) => r.abstained !== null);
  const summary = {
    cases: rows.length,
    numeric: numeric.length,
    top5: numeric.filter((r) => r.rank).length,
    correct: numeric.filter((r) => r.correct).length,
    supported: numeric.filter((r) => r.supported).length,
    absent: absent.length,
    abstained: absent.filter((r) => r.abstained).length,
    passed: rows.filter((r) => r.pass).length,
    errors: rows.filter((r) => r.error).length,
  };
  const cfg = app.get<Configuration>(CONFIG);
  const card = {
    date: new Date().toISOString(),
    models: { embedding: cfg.embeddingModel, chat: cfg.chatModel },
    chunkSize: cfg.chunkSize,
    overlap: cfg.chunkOverlap,
    reports,
    summary,
    rows,
  };
  const path = join(resultsDir, 'scorecard-' + Date.now() + '.json');
  await writeFile(path, JSON.stringify(card, null, 2));
  console.log(summary, path);
  if (summary.errors) process.exitCode = 1;
}

function checkAnswer(res: request.Response, status: number) {
  if (res.status !== status) {
    const detail = res.body?.error;
    throw new Error(
      'HTTP ' +
        res.status +
        ' ' +
        (detail?.message ??
          (typeof detail === 'string' ? detail : res.statusCode)),
    );
  }
}

async function main() {
  await mkdir(cache, { recursive: true });
  await mkdir(resultsDir, { recursive: true });
  const name = 'rag-eval-' + randomUUID();
  const password = randomUUID();
  function docker(...args: string[]) {
    return execFileSync('docker', args, { encoding: 'utf8' }).trim();
  }
  docker(
    'run',
    '--rm',
    '-d',
    '--name',
    name,
    '-e',
    'POSTGRES_PASSWORD=' + password,
    '-p',
    '127.0.0.1::5432',
    'pgvector/pgvector:pg17',
  );
  let app: INestApplication | undefined;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        docker(
          'exec',
          name,
          'pg_isready',
          '-q',
          '-h',
          '127.0.0.1',
          '-U',
          'postgres',
        );
        ready = true;
        break;
      } catch {
        await delay(1000);
      }
    }
    if (!ready) throw new Error('Temporary database did not become ready');
    const port = docker('port', name, '5432/tcp').split(':').pop();
    process.env.DATABASE_URL =
      'postgresql://postgres:' +
      password +
      '@127.0.0.1:' +
      port +
      '/postgres?schema=public';
    execFileSync(
      process.execPath,
      [
        join(__dirname, '../node_modules/prisma/build/index.js'),
        'migrate',
        'deploy',
      ],
      { stdio: 'inherit' },
    );
    app = await NestFactory.create(AppModule, {
      logger: ['error'],
      abortOnError: false,
    });
    setup(app);
    await app.init();
    await evaluate(app);
  } finally {
    try {
      await app?.close();
    } finally {
      docker('stop', name);
    }
  }
}
void main().catch(function failed(error: unknown) {
  console.error(error);
  process.exitCode = 1;
});
