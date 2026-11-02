# FinancialResearch AI

A financial research RAG foundation in TypeScript/NestJS. This implementation covers **Phase 0: backend foundation** and **Phase 2: chunking and embeddings**. It accepts already-extracted text; PDF ingestion, retrieval, LLM answers and external search are future phases. It is not an autonomous agent or trading system.

Stack: Node.js 22 LTS, NestJS 11, strict TypeScript, Prisma 6, PostgreSQL 17 with pgvector, Ollama embeddings, Redis infrastructure, Jest, Docker Compose and GitHub Actions. See [architecture](architecture.md), [Phase 0](phase-0.md), and [Phase 2](phase-2.md).

See [verification results and outstanding checks](verification.md), including unresolved dependency advisories and the live infrastructure checks that could not run here.

## Setup

Prerequisites: Node.js 22.12+ within the 22 LTS line, npm, Docker Engine/Desktop with Compose v2, and Ollama for live embeddings. The implementation machine has Node 22.16.0 but no Docker or Ollama executables.

Run from the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
# Edit .env: choose local PostgreSQL credentials and matching DATABASE_URL.
# Keep all .env files untracked. Use URL-safe local credentials.
Copy-Item .env backend/.env
docker compose up -d postgres redis
cd backend
npm ci
npm run prisma:generate
npm run migrate:deploy
npm run build
npm start
```

The backend reads `backend/.env` when commands run from backend. Compose reads root `.env`. Keep these in sync for local use. DATABASE_URL uses `localhost` for host commands; Compose overrides database and Redis hosts to service names. The schema must be migrated before application startup. Ollama need not be online to start the backend, but health will report degraded.

To create a future database migration during development:

```powershell
cd backend
npm run migrate:dev -- --name describe_change
```

Use `migrate:deploy` for existing migrations and deployments. Migration 001 enables pgvector and creates document_chunks; migration 002 adds normalized-text offsets. The vector column is 768-dimensional. Changing only EMBEDDING_DIMENSIONS does not migrate the schema: startup intentionally rejects a mismatch.

## Docker

After configuring root `.env`:

```powershell
docker compose up --build -d
docker compose ps -a
docker compose logs migrate backend
docker compose exec redis redis-cli ping
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dx"'
Invoke-RestMethod http://localhost:3000/api/v1/health
```

For simpler pgvector inspection without shell quoting, open `docker compose exec postgres sh`, then run `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"` and `SELECT extname FROM pg_extension;`.

Compose waits for PostgreSQL and Redis health, applies migrations in a one-shot container, then starts the backend as a non-root user. Volumes persist database and Redis data. The backend health check returns unhealthy while Ollama is unreachable. Ollama is accessed at `host.docker.internal:11434` from Docker; ensure your host Ollama listener is reachable from the container (configure OLLAMA_HOST as appropriate for your local environment).

## Health API

`GET /api/v1/health` returns HTTP 200 when both dependencies are reachable:

```json
{ "status": "ok", "dependencies": { "postgres": "up", "ollama": "up" } }
```

Failure returns HTTP 503 with dependency status inside the global error envelope's `error` property. Ollama health checks connectivity, not model installation. Redis is checked by Compose; the application does not consume Redis yet.

## Ollama and live sample processing

The example configuration is `OLLAMA_EMBEDDING_MODEL=nomic-embed-text` and `EMBEDDING_DIMENSIONS=768`. **No live Ollama model was tested here.** Ordinary tests use mocks.

```powershell
# In a separate terminal, if Ollama is not already running:
ollama serve
# In another terminal:
ollama pull nomic-embed-text
Invoke-RestMethod -Method Post -Uri http://localhost:11434/api/embed -ContentType 'application/json' -Body '{"model":"nomic-embed-text","input":["FY2026 revenue increased 15%."],"truncate":false}'
cd C:\personal-main\RAG\backend
npm run embed:sample
```

The CLI uses the configured model, processes a page-aware financial fixture and persists native vectors under document ID `sample-annual-report`. Repeating it reuses unchanged content embeddings. It requires the migrated PostgreSQL database and backend/.env. It reports success only after persistence succeeds. Read results through the injected `CHUNK_REPOSITORY.findByDocumentId('sample-annual-report')` service or inspect the table with psql. No public processing endpoint or PDF extraction is included.

## Verification

From backend:

```powershell
npm run format:check
npm run lint
npm run build
npm test
npm test -- chunking.spec.ts
npm test -- embeddings.spec.ts processing.spec.ts
# Requires a migrated PostgreSQL/pgvector instance; does not require Ollama:
npm run migrate:deploy
npm run test:integration
```

The integration suite creates isolated random document IDs and cleans up its own rows. Use a dedicated test database. It verifies persistence, pgvector round trips, metadata, uniqueness, replacement, rollback and concurrent writes. Missing database/configuration makes this suite fail explicitly; tests are not silently skipped. CI provisions PostgreSQL/pgvector and runs formatting, lint, compilation, unit/HTTP tests, migrations and integration tests.

## Layout

```text
backend/
  src/
    config/                 validated environment and DI configuration
    common/filters/         global HTTP exception filter
    integrations/database/ Prisma lifecycle and chunk repository
    integrations/ollama/   HTTP embedding provider
    modules/health/        REST health endpoint
    modules/chunking/      text contracts and recursive chunking
    modules/embeddings/    provider abstraction and DI binding
    modules/processing/    orchestration and repository contract
  prisma/migrations/       pgvector table and offset migrations
  scripts/embed-sample.ts  live verification CLI
  test/                    offline and live integration suites
  Dockerfile
docs/                      architecture and phase notes
.github/workflows/         CI
compose.yaml               PostgreSQL, Redis, migrations and backend
.env.example
```

The document_chunks table stores UUID ID, external document ID, chunk index, text, nullable page number, JSONB metadata, native embedding vector, embedding model, normalized-text offsets and creation time. Uniqueness is enforced on document/index and metadata has a GIN index. A vector search index is deferred until retrieval metric and dataset evaluation.

Next step: **Phase 1 document ingestion**, producing the existing ExtractedDocument contract. Table-aware extraction, durable jobs, retrieval and RAG generation remain outside this implementation.

