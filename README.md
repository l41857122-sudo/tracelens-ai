# TraceLens

TraceLens turns messy application logs into an incident timeline, recurring-error clusters, an evidence-backed root-cause chain, prioritized fixes, and an exportable postmortem. Its premium dark developer-tool interface includes a realistic end-to-end demo that works without an API key.

## Quick start

Requirements: Node.js 20.9+ and npm. PostgreSQL is optional; the demo does not need a database.

```bash
cd tracelens-ai
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and choose **Try the live demo** or **Open the workspace**. The dashboard loads realistic sample logs and deterministic incident analysis immediately: database connection exhaustion → slow queries → request timeouts → retry amplification → worker saturation → 5xx errors. Paste logs or upload `.log`, `.txt`, `.json`, or `.ndjson` files (up to 500 KB), then choose **Analyze logs**. Files are read in the browser, and the analysis runs on the server; no API key or database is required. Analyses are not saved unless `DATABASE_URL` is configured. Postmortems can be copied as Markdown or exported to a `.md` file.

## Optional AI analysis

In `.env.local`, configure an OpenAI-compatible Chat Completions endpoint:

```dotenv
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

Restart the dev server after changing environment variables. The API key stays server-side. When configured, analysis requests are sent to that provider for a structured JSON response validated with Zod. Provider failures are surfaced explicitly rather than silently replaced with demo results. **AI inference and observations quoted from logs are displayed separately.**

## PostgreSQL / Prisma

The demo does not require PostgreSQL. To retain analysis history, set `DATABASE_URL` in `.env.local`, then initialize the schema:

```bash
npx prisma migrate dev --name init
```

When configured, completed analyses are saved in PostgreSQL and can be reopened from the dashboard. Stored records include submitted logs and their structured analysis. Protect database-backed deployments with authentication and review log-retention/privacy requirements before storing production logs; this MVP does not include user authentication or log redaction.

## Commands

```bash
npm run dev         # local development server
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm test            # parsing and deterministic analysis tests
npm run build       # optimized production build
```

## Stack

Next.js App Router, React, TypeScript, Tailwind CSS, shadcn-inspired accessible components, Lucide icons, Zod-validated API and AI responses, Prisma with PostgreSQL, and any OpenAI-compatible chat-completions provider. Without an API key, the deterministic demo works offline.

## Privacy and scope

The deterministic analyzer does not retain logs unless PostgreSQL persistence is enabled. Only configure an AI provider if it is acceptable for that provider to receive submitted logs. Protect the analysis API and incident-history endpoint with authentication before deploying a database-backed instance to a public network; the demo workspace has no account system or user isolation.
