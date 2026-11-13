# Research API examples

Start the backend and upload a report before running these PowerShell examples. The default API address is listed in the [quick start](../README.md#quick-start).

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
