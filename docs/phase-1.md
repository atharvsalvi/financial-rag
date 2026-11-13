# Phase 1 · PDF ingestion

With the backend running, upload a report from PowerShell. The file field is required. The optional company, ticker, and documentType fields are stored with every chunk.

```powershell
curl.exe --fail-with-body -F "file=@C:/reports/annual-report.pdf" -F "company=Example Corp" -F "ticker=EXM" -F "documentType=annual_report" http://localhost:3000/api/v1/documents/ingest
```

HTTP 201 returns the documentId, pageCount, pagesWithText and chunkCount after the database transaction succeeds. Processing runs during the request. The parser preserves physical PDF page numbers starting at 1. Blank pages count toward pageCount and produce zero chunks. The original uploaded bytes are held temporarily in memory.

The document ID is derived from the SHA-256 hash of the PDF bytes. Uploading identical bytes again reuses that document's matching embeddings and replaces its chunk metadata with the latest form fields and filename. A revised PDF gets a new ID. Use the returned ID to inspect a report in PostgreSQL.

```sql
SELECT chunk_index, page_number, metadata, vector_dims(embedding) AS dimensions
FROM document_chunks
WHERE document_id = 'paste-returned-document-id-here'
ORDER BY chunk_index;
```

Extraction supports PDFs with selectable text. Scans require an OCR pass before upload. Mixed reports ingest the pages that contain text. Multi-column layouts and complex financial tables can require review for reading order and cell alignment.

The endpoint accepts one file up to 20 MiB. The parser runs in a separate Node.js process with a 30-second extraction deadline, a 600-page limit and a two-million UTF-16 code-unit text budget including separators. HTTP 400 indicates missing or invalid form fields, 413 indicates a size limit, 415 indicates an unrecognized file type, and 422 indicates an unreadable, locked, timed-out or textless report.

Run the HTTP tests from the backend folder with `npm test -- ingestion.spec.ts`. The integration suite reads the saved chunks back from pgvector. To exercise the configured Ollama model as well, run the following against a migrated test database.

```powershell
$env:TEST_LIVE_OLLAMA = '1'
npm run test:integration -- ingestion.integration.spec.ts
Remove-Item Env:TEST_LIVE_OLLAMA
```
