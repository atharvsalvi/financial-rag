# FinancialResearch AI

Phase 7 evaluates retrieval, numerical answers and citations on two complete Berkshire Hathaway annual reports. From the backend directory, run `npm run eval` with Docker and local Ollama running. See the [benchmark, baseline results and scoring rules](docs/phase-7.md).

A Node.js backend for financial research. Upload a financial report as a PDF to extract its text, keep the original page numbers, and store each chunk with its Ollama embedding in PostgreSQL.

## Features

- Configurable, page-aware text chunking with overlap and metadata preservation.
- Batched Ollama embeddings with dimension validation and reuse of unchanged embeddings.
- Transactional vector storage, Prisma migrations, and database uniqueness constraints.
- NestJS health endpoint, environment validation, and centralized error handling.
- PDF uploads with company, ticker, and document type metadata.
- Docker infrastructure, GitHub Actions CI, and Jest tests for uploads, embeddings, and storage.

## Tech stack

Node.js 22 · TypeScript · NestJS · PostgreSQL · pgvector · Prisma · Ollama · Jest · Docker

Phase 3 retrieves relevant passages. Phase 4 uses Qwen through local Ollama to answer questions and cite excerpts from those passages.

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

## Research dashboard

After starting the backend, open [the dashboard](http://localhost:3000/). Upload a PDF on Overview, then use Research to search passages or ask for a cited answer. Conversations saves follow-up questions and Evaluation displays the saved Phase 7 baseline. The dashboard uses the backend port and requires no separate frontend install. For a first upload, use [the example report](backend/test/fixtures/example-report.pdf).

## Verify

### Connect an MCP client

Start the backend as described above. In your MCP client's local server settings, use `node` as the command and the absolute path to `backend/dist/mcp.js` as its argument. Clients that support an `mcpServers` JSON configuration can use this example for the current checkout:

```json
{
  "mcpServers": {
    "financial-research": {
      "command": "node",
      "args": ["C:/personal-main/RAG/backend/dist/mcp.js"]
    }
  }
}
```

Reconnect the client and ask it to list the indexed reports. Use a returned report ID with `search_reports` to retrieve passages or `ask_report` to get a cited answer. Both tools take a `query`, an optional `documentId`, and an optional `topK` (1–20). The client launches the MCP server over stdio. It calls the existing backend at `http://localhost:3000/api/v1`; set `FINANCIAL_RESEARCH_API_URL` in the MCP server's environment if that address differs.

### Check the backend

Open another terminal in `backend`:

```powershell
Invoke-RestMethod http://localhost:3000/api/v1/health
npm test
curl.exe -f -F "file=@test/fixtures/example-report.pdf" -F "ticker=EXM" http://localhost:3000/api/v1/documents/ingest
```

The upload returns HTTP 201 after PostgreSQL stores the chunks. With the default settings the fixture returns three pages, two pages with text, and two chunks. Replace the file path with a text-based report to process your own PDF. [Phase 1 upload details](docs/phase-1.md)

## Search an uploaded report

Run this in PowerShell after uploading the sample.

```powershell
$body = @{ query = 'What was operating cash flow?'; topK = 3 } | ConvertTo-Json
$matchesFound = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/v1/retrieval/search -ContentType 'application/json' -Body $body
$matchesFound.results | Select-Object documentId, pageNumber, content, score
```

Add `documentId` from the upload response to the request to restrict the search to that report. Search returns up to `topK` passages (default 5, range 1–20). Each includes the source text, document and chunk identifiers, page number when available, offsets, metadata, and cosine similarity. Higher scores indicate closer matches. Search returns an empty list when the selected scope has no chunks embedded with the configured model.

## Ask a question with citations

Install the generation model once with `ollama pull qwen2.5:1.5b`. With the backend running and the sample report uploaded, run the following in PowerShell.

```powershell
$body = @{ query = 'What was operating cash flow?' } | ConvertTo-Json
$result = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/v1/answers -ContentType 'application/json' -Body $body
$result.answer
$result.citations | Format-Table id, filename, pageNumber, quote
```

Supply the upload's `documentId` to ask about a specific report. Each numbered reference identifies an excerpt, document, chunk and page. If the retrieved text supplies insufficient evidence, the API can return `insufficient_evidence` with an empty citation list. The backend checks that quoted words appear in the cited passage. Review the quote to assess whether it supports the generated interpretation.

Set `OLLAMA_CHAT_MODEL` to use another installed chat model and `OLLAMA_CHAT_TIMEOUT_MS` to change the default two-minute generation timeout. Restart the backend after changing configuration. The existing embedding model is used for retrieval.

## Ask a question using web sources

Phase 5 adds an explicit web-search endpoint. Set `TAVILY_API_KEY` in the backend environment (`backend/.env` for local development or the root `.env` for Compose) and restart the backend. Each web request sends your question to Tavily and uses your provider account. Uploaded reports continue to use the local document endpoint.

```powershell
$body = @{ query = 'What did the company report in its most recent NVIDIA earnings release?'; topK = 3 } | ConvertTo-Json
$result = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/v1/answers/web -ContentType 'application/json' -Body $body
$result.answer
$result.citations | Format-List id, title, url, quote
```

Web questions accept up to 400 characters and one to five search results. Qwen answers from the returned excerpts. Each web citation contains the provider's source URL, title, and a quotation checked against the supplied excerpt. Open the source to verify dates and financial figures. An empty search returns `insufficient_evidence`. A missing key or unavailable search provider returns HTTP 503. [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)

## Continue a report conversation

Phase 6 saves document research conversations in PostgreSQL. From the backend folder, run `npm run prisma:generate`, `npm run migrate:deploy`, and `npm run build`, then restart the backend. Create a conversation using the document ID returned by your PDF upload. An empty JSON object selects all uploaded reports.

```powershell
$api = 'http://localhost:3000/api/v1/conversations'
$scope = @{ documentId = 'paste-your-document-id-here' } | ConvertTo-Json
$chat = Invoke-RestMethod -Method Post -Uri $api -ContentType 'application/json' -Body $scope
$turns = "$api/$($chat.id)/turns"
$first = Invoke-RestMethod -Method Post -Uri $turns -ContentType 'application/json' -Body (@{ query = 'What was operating cash flow?'; version = $chat.version } | ConvertTo-Json)
$next = Invoke-RestMethod -Method Post -Uri $turns -ContentType 'application/json' -Body (@{ query = 'What was the amount of that item?'; version = $first.sequence } | ConvertTo-Json)
$next.answer
$next.citations | Format-Table filename, pageNumber, quote
Invoke-RestMethod -Uri "$api/$($chat.id)"
```

Each successful turn stores the question, answer, status and citation excerpts together. Follow-ups use up to three recent exchanges as context and retrieve evidence again. History returns up to 50 turns in sequence order. Use `?after=50` to continue after turn 50. Save the conversation ID to reopen it after restarting the backend. HTTP 409 means another request already advanced the conversation. Read the latest turns before deciding whether to submit another question.

See [setup instructions](docs/setup.md), [architecture](docs/architecture.md), and [verification status](docs/verification.md) for integration tests, limitations, and outstanding dependency advisories.
