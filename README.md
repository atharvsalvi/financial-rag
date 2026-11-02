# FinancialResearch AI

A financial research RAG backend in development, building toward evidence-backed analysis of financial documents. The current implementation transforms extracted text into metadata-rich chunks and stores Ollama embeddings in PostgreSQL with pgvector.

## Features

- Configurable, page-aware text chunking with overlap and metadata preservation.
- Batched Ollama embeddings with dimension validation and reuse of unchanged embeddings.
- Transactional vector storage, Prisma migrations, and database uniqueness constraints.
- NestJS health endpoint, environment validation, and centralized error handling.
- Docker infrastructure, GitHub Actions CI, and 58 passing offline tests at implementation time.

## Tech stack

Node.js 22 · TypeScript · NestJS · PostgreSQL · pgvector · Prisma · Ollama · Jest · Docker

Redis is provisioned for future use. PDF ingestion, retrieval, and cited question answering are planned.

## Quick start

Requires Node.js 22.12+ within the 22 release line, Docker Desktop running, and Ollama running. From the repository root in PowerShell:

```powershell
# Skip this copy if you already have a configured .env file.
Copy-Item .env.example .env
# Edit .env: set POSTGRES_PASSWORD and the matching DATABASE_URL.
Copy-Item .env backend/.env
docker compose up -d postgres redis
ollama pull nomic-embed-text

cd backend
npm ci
npm run prisma:generate
npm run migrate:deploy
npm run build
npm start
```

## Verify

Open another terminal in `backend`:

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health
npm test
npm run embed:sample
```

Health returns `ok` when PostgreSQL and Ollama are reachable. The sample command processes financial text and persists embeddings; it requires the migrated database and configured Ollama model. Live infrastructure and embedding generation were not verified in the implementation environment.

See [setup instructions](docs/setup.md), [architecture](docs/architecture.md), and [verification status](docs/verification.md) for integration tests, limitations, and outstanding dependency advisories.
