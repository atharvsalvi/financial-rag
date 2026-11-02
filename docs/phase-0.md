# Phase 0: backend foundation

The initially empty workspace now contains a NestJS REST backend with strict TypeScript, centralized Nest logging, validated environment configuration, a global exception filter, and a global ValidationPipe. No public text-processing endpoint is exposed yet; future ingestion will call a service directly.

`GET /api/v1/health` checks PostgreSQL and Ollama `/api/tags`. Both must succeed for HTTP 200. Failures return HTTP 503 with the failed dependency marked `down`. Ollama reachability does not establish that the configured embedding model is installed. Redis is infrastructure only; its Compose health check uses `redis-cli ping`.

Startup requires a reachable migrated database and checks the actual pgvector column dimension. Missing or invalid configuration fails early. Health tests substitute database connectivity and HTTP responses. Integration tests require a real migrated pgvector database.

The initial migration enables pgvector, creates document_chunks, and creates unique document/order and JSONB GIN indexes. The unique composite index also supports document ID lookups. No approximate vector index is justified before retrieval, distance metric evaluation, and dataset sizing.

Compose persists PostgreSQL and Redis, runs a one-shot migration before backend startup, and binds exposed ports to loopback. Set credentials in the untracked root `.env`. Use URL-safe password characters or percent-encode credentials consistently when constructing DATABASE_URL. This is local development infrastructure, not an internet-facing production deployment.

Node 22 is a supported Maintenance LTS line ([Node release schedule](https://github.com/nodejs/Release#release-schedule)). Prisma 6 is pinned for compatibility with installed Node 22.16; its security support ends November 19, 2026 ([Prisma release status](https://www.prisma.io/docs/orm/release-status)). Upgrade Node and Prisma before production deployment.

Docker and Ollama executables were unavailable in the implementation environment. Live infrastructure verification is pending; use the commands in README. The GitHub Actions workflow provisions pgvector and runs integration checks, but has not been executed on GitHub from this workspace.
