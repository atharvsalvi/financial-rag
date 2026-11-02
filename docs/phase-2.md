# Phase 2: chunking and embeddings

## Input and output

`DocumentProcessingService.process(document)` accepts either `text` or ordered `pages`, a nonempty document ID, and optional extensible JSON metadata. Page numbers must be positive integers. Input page order is preserved; page metadata overrides document metadata for matching keys. The input objects are not mutated.

```typescript
await processing.process({
  documentId: 'company-report-2026-q2',
  metadata: { ticker: 'NVDA', financialYear: 2026, quarter: 'Q2' },
  pages: [{ pageNumber: 12, text: 'Revenue was $12.5 million, up 15%.' }],
});
```

Inject the service from ProcessingModule in future ingestion code. For standalone chunking, inject ChunkingService and call `chunk(document, { chunkSize: 1000, chunkOverlap: 150 })`.

## Chunking behavior

Size and overlap use **Unicode code points**, not bytes, UTF-16 units, or model tokens. Defaults are 1,000 and 150 code points, respectively; these are evaluation starting points, not optimal financial-report settings. Overlap must be smaller than size.

Normalization converts CRLF, strips trailing line whitespace, reduces three or more newlines to two, and trims outer whitespace. Internal tabs, indentation, line breaks, currency symbols, values, percentages, and reporting periods remain. Each page is processed separately, so a chunk has one page number or null for plain text.

Within the maximum window, recursive fallback prefers a recognized section boundary (Markdown heading or an uppercase heading), then paragraph breaks, then sentence endings followed by whitespace, then a code-point boundary. A boundary must advance past the overlap to guarantee progress. Offset fields refer to normalized page text, with end exclusive. Exact overlap is intentional; reconstruct by adding only content after the previous end offset. Chunks are stably numbered across pages and whitespace-only chunks are excluded.

Limitations: heading detection is heuristic; arbitrary mixed-case headings, abbreviations and financial table structure are not semantically understood. Pages are never joined, and recognized section boundaries are preferred, but exact overlap can include trailing text from the previous section. Callers should supply unrelated statements as separate page/segment inputs to prevent mixing them. Table rows can split when no suitable boundary fits; this is not table extraction. Unicode code points preserve surrogate pairs but not necessarily multi-code-point grapheme clusters. Everything is processed in memory; streaming and durable jobs are future work.

## Embedding and persistence behavior

The EmbeddingProvider interface supports single and multiple input strings. Ollama uses [POST /api/embed](https://docs.ollama.com/api/embed) with model from configuration and `truncate: false`, so context overflow fails rather than silently dropping input. Requests are sequential and bounded by EMBEDDING_BATCH_SIZE. HTTP failures, malformed bodies, response-count mismatch, dimension mismatch, invalid float32 values, zero vectors and timeout all fail explicitly. Error causes identify the document, batch and provider offset without logging extracted text.

DocumentProcessingService validates vectors again so replacing the provider does not bypass persistence safeguards. Repeated identical text is embedded once per call. Stored vectors are reused only for exact content and model-name matches; use immutable/versioned model names and reprocess if model weights change behind a tag. Failed batches return no partial result and do not modify database rows. No automatic retries are hidden in this phase.

Persistence replaces a document atomically and removes stale trailing chunks, with a unique document/index constraint preventing duplicates. Metadata and offsets are stored alongside vectors and model provenance. Empty extraction returns no chunks and leaves existing stored rows intact. There is no implicit document deletion API.

The initial database column is `vector(768)`, matching the example `nomic-embed-text` configuration. Startup reads the actual column type and rejects a mismatched EMBEDDING_DIMENSIONS. To change dimensions, create a new reviewed Prisma SQL migration changing the vector column and update schema.prisma. Existing vectors cannot be converted into another model's embedding space by padding or truncation; regenerate them from source text. For nonempty databases use a staging column/table and a deliberate re-embedding migration. Do not edit migrations already deployed.

No vector similarity index is created before choosing and evaluating a retrieval metric. The current unique document/index and JSONB GIN indexes support the implemented access paths.

## Live verification status

Ollama was not installed in the implementation environment. **No live model has been tested.** `nomic-embed-text` is the example model, not a claimed successful local test. Unit tests validate mocked provider behavior. README gives the exact pull, run and sample-processing commands for real verification. PostgreSQL integration tests are implemented separately and require a migrated pgvector server.
