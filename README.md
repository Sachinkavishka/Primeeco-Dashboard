# Detail FM — PrimeEco Jobs Dashboard

A live, auto-refreshing wall-display dashboard for restoration jobs, sourced from the
**PrimeEco v2 API**. Built with Next.js 16 (App Router) + TypeScript + Tailwind, with
Supabase auth. Runs on **sample data** until PrimeEco credentials are supplied, then
switches to **live** automatically — no code change.

## Architecture

```
lib/primeeco/
  config.ts      env + isPrimeecoConfigured()
  client.ts      OAuth token cache/refresh + rate-limit-aware fetch (server-only)
  jobs.ts        paginated GET /jobs repository
  normalize.ts   anti-corruption layer: raw PrimeEco fields -> clean DashboardJob
  aggregate.ts   pure functions -> KPIs, status/persona/aging breakdowns
  mock.ts        deterministic sample data (used when not configured)
  index.ts       getDashboardData() facade (degrades to mock on API failure)
app/api/dashboard/route.ts   auth-guarded polling endpoint
app/(app)/dashboard/page.tsx + components/dashboard/*   the UI (auto-refresh 60s)
```

If PrimeEco field names differ from the defaults, **the only file to change is
`lib/primeeco/normalize.ts`** — the UI is decoupled from the upstream schema.

## Environment variables

Copy `.env.local.example` to `.env.local` (local) or set these in Vercel → Settings →
Environment Variables (production). All PrimeEco vars are **server-only** — never prefix
them with `NEXT_PUBLIC_`.

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (auth) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key |
| `PRIMEECO_API_URL` | no | Defaults to `https://www.primeeco.tech/api.prime/v2` |
| `PRIMEECO_CLIENT_ID` | live | OAuth client id |
| `PRIMEECO_CLIENT_SECRET` | live | OAuth client secret |
| `PRIMEECO_USERNAME` | live | OAuth password-grant username |
| `PRIMEECO_PASSWORD` | live | OAuth password-grant password |
| `PRIMEECO_ACCESS_TOKEN` | no | Skip the grant with a pre-issued token (testing) |

Leave the `PRIMEECO_*` credential vars blank to run on sample data.

## Local development

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

## Deploy to Vercel

1. Push this folder to a GitHub repo (see below).
2. On vercel.com → **Add New → Project → Import** the repo.
3. Framework preset: **Next.js** (auto-detected). Root directory: `./`.
4. Add the environment variables above, then **Deploy**.
5. Every future `git push` auto-deploys.

## Notes

- Node.js 20.9+ required. Uses pnpm (`pnpm-lock.yaml` committed).
- `pnpm-workspace.yaml` only carries the `allowBuilds` approval for `sharp`/`unrs-resolver`
  so `pnpm install` exits 0 in CI.
