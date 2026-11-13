# Architecture

Phase 0 provides the backend, Phase 1 extracts pages from uploaded PDFs, and Phase 2 chunks and embeds those pages.

Phase 3 exposes `POST /api/v1/retrieval/search`. RetrievalService embeds the question with the configured Ollama provider. PassageSearchRepository runs an exact cosine search in pgvector over rows with the same embedding model, optionally filtered by document ID. PostgreSQL resolves equal scores by document ID and chunk index. The score ranks the closest available passages. Relevance thresholds and approximate vector indexes can be evaluated as the corpus grows.

Phase 4 exposes `POST /api/v1/answers` with the same query, document scope and top-K options. AnswerService selects up to 8,000 UTF-16 code units of passage text in retrieval order. Question and source records are serialized as data for Ollama's structured chat API. Qwen returns statements with source IDs and verbatim excerpts or an empty claim list. The backend verifies each quoted excerpt against the supplied context and constructs citation metadata from the retrieved rows. Invalid citations or incomplete generations return HTTP 502. An unavailable chat service returns HTTP 503.

```text
PDF upload → page extraction / sample text CLI
           |
DocumentProcessingService
   |       |                    |
Chunking  EmbeddingProvider     ChunkRepository
service      |                    |
         Ollama /api/embed     Prisma + parameterized SQL
                                   |
                             PostgreSQL / pgvector
```

ConfigurationModule validates the environment at startup. DatabaseModule owns Prisma connectivity and schema dimension validation. HealthModule exposes the health check. IngestionModule accepts multipart uploads and runs the PDF text parser in a child process. Pages pass to the processing service, which uses ChunkingModule, EmbeddingsModule and the Prisma repository.

The orchestration service chunks extracted text, fetches previously stored embeddings, reuses identical content for the same model, batches missing content, validates the provider output, and replaces the document's stored chunks. Network calls occur before database transactions. An embedding failure leaves existing persisted chunks untouched. The repository uses a transaction and a PostgreSQL advisory lock keyed by document ID to serialize replacements. Concurrent processing may duplicate network work; the last successful replacement wins. There is no queue or distributed ingestion version control in this phase.

Embedding storage uses native `vector(768)` and JSONB metadata. Prisma models the vector with `Unsupported("vector(768)")`. The repository uses parameterized SQL for vector casts and reads. A unique index covers `(document_id, chunk_index)`. The upload endpoint derives document IDs from file content.

Redis runs as infrastructure only. BullMQ is deferred until asynchronous ingestion requires it. No unused modules or placeholder controllers are created.

Tests are split between offline Jest tests (mocked HTTP and database boundaries) and an explicit live PostgreSQL suite. CI runs both using pgvector; Ollama is not needed for CI.
