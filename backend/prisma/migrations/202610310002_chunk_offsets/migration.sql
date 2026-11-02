ALTER TABLE document_chunks ADD COLUMN start_offset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE document_chunks ADD COLUMN end_offset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE document_chunks ADD CONSTRAINT valid_offsets CHECK (start_offset >= 0 AND end_offset >= start_offset);
ALTER TABLE document_chunks ALTER COLUMN start_offset DROP DEFAULT;
ALTER TABLE document_chunks ALTER COLUMN end_offset DROP DEFAULT;
