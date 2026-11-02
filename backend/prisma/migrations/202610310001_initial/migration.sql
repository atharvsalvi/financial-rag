CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE "document_chunks" (
  "id" UUID PRIMARY KEY,
  "document_id" TEXT NOT NULL,
  "chunk_index" INTEGER NOT NULL CHECK (chunk_index >= 0),
  "content" TEXT NOT NULL CHECK (length(content) > 0),
  "page_number" INTEGER CHECK (page_number > 0),
  "metadata" JSONB NOT NULL,
  "embedding" vector(768) NOT NULL,
  "embedding_model" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "document_chunks_document_id_chunk_index_key" ON "document_chunks" ("document_id", "chunk_index");
CREATE INDEX "document_chunks_metadata_idx" ON "document_chunks" USING GIN ("metadata");
