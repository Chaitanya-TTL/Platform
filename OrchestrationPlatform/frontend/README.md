This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Lattice Investigation Copilot

The investigation copilot is an internal, read-only Stage 1 feature. Local server configuration uses these variables from `.env` (start from `.env.example`):

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY` (server only; never use a `NEXT_PUBLIC_` name)
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION`
- `AZURE_OPENAI_LIVE_CALLS_ENABLED` (defaults to disabled; enable only after explicit request approval and company network-policy clearance)
- Optional `AZURE_OPENAI_INPUT_COST_PER_1M_USD` and `AZURE_OPENAI_OUTPUT_COST_PER_1M_USD` for estimated ledger cost, populated only with company-approved rates
- Optional `LATTICE_COPILOT_USAGE_LOG_PATH`; defaults to `.lattice-data/copilot-usage.csv`

The Excel-readable usage CSV records provider attempts, response token counts when returned, and optional rate-based cost estimates. It does not record prompts, model responses, or credentials. Keep the ledger local or apply the organization's approved storage/access controls. See `features/lattice-next/copilot/USAGE-LEDGER.md` for its schema and estimation formula.

### Release gates

Do not expose the Azure-backed route publicly or enable shared/multi-user production use until both gates are met:

1. Add authentication and per-investigation authorization to every investigation, conversation, and copilot route.
2. Replace the process-local file-backed investigation and conversation stores with shared durable storage that provides cross-instance concurrency control, backup, and access controls.

The current implementation is suitable only for a trusted, single-instance internal environment. Recommendations are not executed; all connected-system write-back remains out of scope.

The configured deployment/API version must be verified through a company-approved network path before release. A previous minimal check reported HTTP 200 for `2025-01-01-preview`, but a Zscaler block was subsequently reported; treat that verification as inconclusive until confirmed through the approved corporate network.

The offline synthetic evaluation suite can be run without contacting Azure:

```powershell
npm test -- features/lattice-next/copilot/evals/copilot-evaluation.test.ts
```

It covers native-ID lookup, cross-source traversal, refreshed values, partial/stale/conflicting evidence, unsupported identifiers, investigation isolation, injection-like evidence text, and bounded contexts. Live model baseline runs are not part of ordinary tests; obtain explicit approval for each paid endpoint run and record Azure token usage in the ignored ledger.

See `features/lattice-next/copilot/RELEASE-GATES.md` for the full privacy, evaluation, network-verification, and internal-deployment checklist. Authentication/authorization and shared durable storage remain blockers for shared or public deployment.
