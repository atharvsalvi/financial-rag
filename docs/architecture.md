# Architecture

Scope: Phase 0 (backend foundation) and Phase 2 (chunking and embeddings). No PDF extraction, retrieval, RAG answers, search, trading, financial calculation, or autonomous-agent functionality is implemented.

```text
Future ingestion / sample CLI
           |
DocumentProcessingService
   |       |                    |
Chunking  EmbeddingProvider     ChunkRepository
service      |                    |
         Ollama /api/embed     Prisma + parameterized SQL
                                   |
                             PostgreSQL / pgvector
```

ConfigurationModule validates environment once at startup. DatabaseModule owns Prisma connectivity and schema dimension validation. HealthModule exposes the only REST endpoint. ChunkingModule has no provider or database dependency. EmbeddingsModule binds the provider token to Ollama. ProcessingModule binds the repository token to Prisma and exports the orchestration service for future ingestion.

The orchestration service chunks extracted text, fetches previously stored embeddings, reuses identical content for the same model, batches missing content, validates the provider output, and replaces the document's stored chunks. Network calls occur before database transactions. An embedding failure leaves existing persisted chunks untouched. The repository uses a transaction and a PostgreSQL advisory lock keyed by document ID to serialize replacements. Concurrent processing may duplicate network work; the last successful replacement wins. There is no queue or distributed ingestion version control in this phase.

Embedding storage is native `vector(768)`. Metadata is JSONB. Prisma models the vector with `Unsupported("vector(768)")`; vector casts and reads are parameterized raw SQL behind the repository. Chunk uniqueness is enforced by `(document_id, chunk_index)`. Document IDs are supplied externally; there is no premature documents table or foreign key into an unimplemented ingestion phase.

Redis runs as infrastructure only. BullMQ is deferred until asynchronous ingestion requires it. No unused modules or placeholder controllers are created.

Tests are split between offline Jest tests (mocked HTTP and database boundaries) and an explicit live PostgreSQL suite. CI runs both using pgvector; Ollama is not needed for CI.
