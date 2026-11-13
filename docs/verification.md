# Implementation verification

## November 9, 2026 · External research

All 95 offline tests passed. The new endpoint tests cover search requests, URL deduplication, citation attribution, empty searches, provider failures, and missing credentials. A smoke test of the compiled HTTP endpoint used local Qwen with a fixture search excerpt and returned the source URL and matching quotation. Live Tavily search remains unverified because the environment has no configured API key.

## November 9, 2026 · Cited answers

All 86 offline tests and 8 integration tests passed. The live test uploaded the sample PDF to an isolated PostgreSQL 17 database, retrieved passages with `nomic-embed-text`, and generated an answer with local `qwen2.5:1.5b`. The answer to “What was operating cash flow?” included 4.2 million and a matching excerpt from page 3 of the uploaded report. Formatting, linting, application compilation, and the full TypeScript check passed.

To repeat the live integration test against a migrated test database, set both `TEST_LIVE_OLLAMA=1` and `TEST_LIVE_CHAT=1`, then run `npm run test:integration` from the backend folder. The offline suite covers abstention, invalid references, fabricated excerpts, truncated output, and chat service failures.

## November 9, 2026 · Passage retrieval

All 74 offline tests and 8 integration tests passed. An upload and search against a temporary PostgreSQL 17 database and local Ollama returned the operating cash flow passage on page 3 as the first result for “What was operating cash flow?”. A separate database test verified cosine order, deterministic ties, top-K limits, model compatibility, and document filtering using known vectors. This verifies the sample case. Retrieval quality across real financial reports still requires evaluation.

## November 9, 2026 · PDF ingestion

On Windows with Node.js 22.16.0, all 63 offline tests and all 7 integration tests passed. Formatting, ESLint, the application build and the full TypeScript check passed. Both Prisma migrations applied to an isolated PostgreSQL 17 container with pgvector.

The live test uploaded the bundled three-page synthetic financial report over HTTP, embedded its two text pages with local Ollama using `nomic-embed-text:latest`, and read both 768-dimensional vectors back from PostgreSQL. The stored chunks retained physical page numbers 1 and 3 and the supplied report metadata. The temporary test container was removed afterward. This exercise covers the sample PDF. Extraction quality on issuer reports with complex layouts still needs evaluation.

## Original Phase 0 and 2 checks

Implementation environment: Windows, Node.js 22.16.0, npm 10.9.2, October 31, 2026.

- Prisma client generation: passed.
- TypeScript application compilation and full source/test/script type check: passed.
- ESLint and Prettier checks: passed.
- Jest offline suite: 58 tests across 6 suites passed. This includes a real in-process Nest HTTP server with mocked external dependencies. The first HTTP run failed because the sandbox denied localhost sockets; the approved run passed.
- PostgreSQL integration suite: implemented, not executed against a live server here. Docker is unavailable. Six tests cover vector/metadata round trip, database uniqueness, ordered replacement, rollback, concurrent replacement and dimension validation.
- Docker Compose startup, migrations against PostgreSQL, Redis connectivity and full live backend startup: unverified because Docker is unavailable.
- Ollama generation: unverified because Ollama is unavailable. No model was tested live. The sample configuration uses nomic-embed-text; run README's live commands to verify.
- GitHub Actions: configured, not remotely executed from this workspace.

Dependency audit after compatible Multer and Effect fixes still reports 34 advisories (4 low, 27 moderate, 3 high). The high-severity chain is deepmerge-ts through Prisma's configuration/CLI packages; the remaining findings include lint/test tooling. `npm audit fix` does not resolve these within the selected dependency ranges. Do not treat this as production security sign-off. Update the Node/Prisma toolchain (Prisma 6 security support ends November 19, 2026) and audit the resolved lockfile before deployment. Blind `npm audit fix --force` was not applied because its proposed changes include incompatible tooling downgrades and major upgrades.

Reproduce offline checks from backend:

```powershell
npm ci
npm run prisma:generate
npm run format:check
npm run lint
npm run build
npx tsc --noEmit
npm test
```

Reproduce infrastructure checks from the repository root after configuring `.env` and installing Docker:

```powershell
docker compose up --build -d
docker compose ps -a
docker compose logs migrate backend
docker compose exec redis redis-cli ping
cd backend
npm run test:integration
```

The integration command requires backend/.env with the host DATABASE_URL and a migrated database. Use a dedicated test database. The live model instructions and sample persistence command are in README.
