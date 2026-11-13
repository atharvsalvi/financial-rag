# Phase 7 · Annual-report evaluation

The benchmark ingests the complete Berkshire Hathaway FY2022 and FY2023 reports through the PDF upload endpoint. The case set has 16 numerical questions, including three conversational follow-ups, and two questions about future results that neither report could contain. Questions cover insurance, energy, rail, liabilities, and consolidated cash flow. The two reports include different published values for 2022 cash flow, making report vintage material to the answer. [FY2022 report](https://www.berkshirehathaway.com/2022ar/2022ar.pdf) · [FY2023 report](https://www.berkshirehathaway.com/2023ar/2023ar.pdf)

## Run

The November 13 baseline ingested 144 pages from 2022 and 152 pages from 2023 into 1,603 chunks. With `nomic-embed-text` and `qwen2.5:1.5b`, **0/18 cases passed end to end**. A gold page appeared in the top five for 12/16 numerical cases, or 12/13 executed searches after excluding three blocked follow-ups. The model supplied zero correct numerical answers and zero correct abstentions on the two unanswerable questions.

Twelve requests returned HTTP 502 because a proposed quotation failed the backend's excerpt check. One generation was incomplete and one returned HTTP 503. Three dependent turns could not run. The remaining answer quoted the correct report page but gave $34.6 billion for FY2022 unpaid retroactive reinsurance losses. The keyed figure was $35.4 billion. This is a concrete target for improving period selection alongside quote generation. The archived responses were rescored to ensure that citing a passage containing the correct amount cannot earn citation support for a claim containing a different amount. [Original scorecard](../backend/eval/initial-baseline.json)

After the excerpt fallback was introduced, all 18 requests completed. The reference page appeared for 15/16 numerical questions. Correct numerical answers stayed at 0/16, abstentions at 0/2, and end-to-end passes at 0/18. The dashboard now displays this [rerun](../backend/eval/baseline.json). The original run skipped three dependent follow-ups, so the two page-hit counts cover different numbers of executed searches.

Use the project's Node 22 environment, Docker Desktop, Ollama, and a configured backend `.env`. From `backend`, run the following.

```powershell
npm ci
npm run prisma:generate
ollama pull nomic-embed-text
ollama pull qwen2.5:1.5b
npm run eval
```

The runner downloads the two issuer PDFs on first use and checks their SHA-256 hashes. For offline use, place the original PDFs at `backend/eval/cache/2022.pdf` and `2023.pdf`. The answer key uses physical PDF page numbers. A temporary PostgreSQL 17 container with pgvector holds only the two reports. The runner applies migrations, starts the Nest application on temporary local sockets, exercises the real HTTP endpoints, and removes the container on exit. Local Ollama model settings and chunk sizes come from the backend environment.

Each run writes a JSON scorecard under `backend/eval/results/` with the model names, chunk settings, source hashes, expected values, retrieved pages, answers, citations, and errors. Quality misses remain in the scorecard. Setup and request failures also set a nonzero exit code. A failed conversation opener marks dependent follow-ups as blocked.

## Reading the scores

### Brochure acceptance check

With the local backend running and `DJ Consulting Group Brochure.pdf` indexed, run `npm run eval:brochure` from `backend`. This separate check compares citations with stored passages. Before the overview change, only the skills case passed. Afterward, all three passed: the overview cited pages 1–5, the skills answer cited page 3, and the unspecified membership fee returned insufficient evidence. The skills check tests for a relevant cited skill, not an exhaustive list.

To try the overview, select a report on the dashboard and ask “What is the PDF about?” or pass the same question and document ID to the MCP `ask_report` tool. The answer combines excerpts from opening passages sampled across up to five pages. A long report can contain topics outside that sample.

- **Page hit at five** counts numerical questions where a gold document and physical page occur among the first five passages. Page rank alone cannot establish that the retrieved chunk contains the relevant table row. Scoped questions use their requested report. Other questions search both reports. For follow-ups, the diagnostic search uses the same recent-turn text as the answer service.
- **Numerical correctness** compares reported monetary values after converting to USD millions. An explicit conflicting year, missing scale on a bare number, or another conflicting scaled amount fails the check. The question supplies the period when an answer omits it.
- **Citation support** requires a numerically correct answer and at least one citation on an accepted report page whose quote contains the metric phrase and the expected figure. Tables can express figures in millions through a page heading. For multi-year rows this lexical check can match the wrong column, and a short but adequate paraphrase can miss the phrase. Consult the underlying PDF when reviewing a result. The automatic score approximates support.
- **Abstention** requires an explicit insufficient-evidence response with zero citations. An error or an invented figure fails. A numerical case passes end to end when both its amount and citation pass.

The baseline measures this report pair and model configuration. [Case definitions and keyed pages](../backend/eval/dataset.ts)
