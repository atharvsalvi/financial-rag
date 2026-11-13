# FinancialResearch AI

Search financial reports, ask questions, and inspect the PDF passages behind each answer. The Node.js application serves a browser dashboard, a REST API, and a local MCP integration. Ollama runs report search and answer generation locally. Optional web research sends the question to Tavily.

## Quick start

You need Node.js 22.12 or later in the 22.x series, Docker Desktop with Compose, and Ollama running. The commands below use PowerShell from the repository root.

1. **Configure PostgreSQL.** For a new installation, copy the example configuration. If you already have a configured environment file, use it.

   ~~~powershell
   if (!(Test-Path .env)) { Copy-Item .env.example .env }
   ~~~

   Edit the root `.env`. Choose a local password and put the same value in `POSTGRES_PASSWORD` and the password portion of `DATABASE_URL`. If a PostgreSQL volume already exists, use the password it was initialized with. For local Node commands, keep `backend/.env` in sync with those settings.

2. **Start the database and install the models.** PostgreSQL includes pgvector. Compose also starts Redis, which is provisioned for infrastructure. The application currently stores reports and conversations in PostgreSQL.

   ~~~powershell
   if (!(Test-Path backend/.env)) { Copy-Item .env backend/.env }
   docker compose up -d --wait postgres redis
   ollama pull nomic-embed-text
   ollama pull qwen2.5:1.5b
   ~~~

3. **Build and start the backend.** Prisma applies the project's database migrations before the server starts.

   ~~~powershell
   cd backend
   npm ci
   npm run prisma:generate
   npm run migrate:deploy
   npm run build
   npm start
   ~~~

Open the [dashboard](http://localhost:3000/). It uses the same server as the API. To check connectivity, open the [health endpoint](http://localhost:3000/api/v1/health) and look for `postgres: up` and `ollama: up`. See the [setup guide](docs/setup.md) to run the backend itself in Docker.

## Try the sample report

1. On **Overview**, upload the [sample PDF](backend/test/fixtures/example-report.pdf). It contains three pages, two with text.
2. On **Research**, select that report, choose **Search passages**, and ask “What was operating cash flow?” Look for **$4.2 million** on page **3**. Switch to **Answer from reports** to see the generated answer and its citations.
3. Ask “What is the PDF about?” with a report selected for a cited overview drawn from up to five representative page or chunk openings. Use **Conversations** to save follow-up questions.

For web research, set `TAVILY_API_KEY` in the backend environment and restart the server. For programmatic access, see the [REST API examples](docs/api.md) and [PDF upload contract](docs/phase-1.md).

## Connect an MCP client

Keep the backend running. Configure your MCP client to launch `node` over stdio with the absolute path to the compiled `backend/dist/mcp.js`. Replace the example path with your checkout.

~~~json
{
  "mcpServers": {
    "financial-research": {
      "command": "node",
      "args": ["C:/path/to/financial-rag/backend/dist/mcp.js"]
    }
  }
}
~~~

Use `list_reports` to get a report ID, `search_reports` to retrieve passages, and `ask_report` to request a cited answer. The latter two accept a `query`, optional `documentId`, and optional `topK` (1–20). Set `FINANCIAL_RESEARCH_API_URL` for the MCP process if the backend uses a different address from `http://localhost:3000/api/v1`.

## Tests and answer quality

From `backend`, run `npm test` for unit and HTTP tests, or `npm run eval` for the two-report benchmark using Docker and Ollama. The **Evaluation** tab displays the saved benchmark.

In the saved run, the correct source page appeared among the first five passages for **15 of 16** numerical questions, but **0 of 16** answers passed the numerical correctness check. Verify financial figures against the row, year, and units in the cited PDF. [Benchmark and scoring rules](docs/phase-7.md)
