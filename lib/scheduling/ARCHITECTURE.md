# Scheduling board — architecture

The `/scheduling` page answers four questions for a coordinator:

1. What work was approved recently?
2. Which of it still has nobody booked?
3. What is on the calendar this week?
4. Who is free to do it?

It reads two systems and joins them. Nothing is written back to either.

---

## Layers

Dependencies point in one direction only: **UI → facade → repositories → domain**.
No layer reaches around another, and no lower layer knows about a layer above it.

```
app/(app)/scheduling/page.tsx        route  — server component, fetches once
app/api/scheduling/route.ts          route  — same data for client polling
        │
components/scheduling/…              UI     — presentation only, no data rules
        │
lib/scheduling/index.ts              FACADE — joins the two systems, applies
        │                                     the board's business rules
        ├── lib/scheduling/approvals.ts       orchestrates the approvals feed
        │
        ├── lib/primeeco/…                    PrimeEco repositories
        └── lib/connecteam/…                  Connecteam repositories
```

### Domain (pure, no I/O)

| Module | Owns |
| --- | --- |
| `lib/primeeco/estimate-labour.ts` | What counts as labour time, whose time it is, and how to total it. No imports, no API — unit-testable in isolation. |

### Repositories (I/O, one upstream concept each)

| Module | Owns |
| --- | --- |
| `lib/primeeco/estimate-changes.ts` | **Discovery only.** Which estimates changed recently. |
| `lib/primeeco/estimate-snapshot.ts` | **Authority.** The full content of one estimate. |
| `lib/primeeco/receivables.ts` | AR invoices (shared with `/receivables`). |
| `lib/primeeco/index.ts` | Jobs + lookups (shared with `/dashboard`). |
| `lib/connecteam/*` | Roster: shifts, users, staff classification. |

Each repository exposes clean domain types and keeps all knowledge of upstream
field names inside itself (`normalize.ts` in Connecteam's case). UI code never
sees a raw API shape.

### Facade

`lib/scheduling/index.ts` is the only place the two systems meet. It owns the
board's business rules — which approvals qualify, what "available" means — and
returns one `SchedulingData` object.

---

## The two-phase approvals read

This is the most important design decision in the module, and the one most
likely to be "simplified" by mistake.

```
estimate-changes.ts        estimate-snapshot.ts
   (WHICH changed)   ───►     (WHAT it contains)
   ids + timestamps          values, lines, labour
```

PrimeEco has no "estimates changed since X" endpoint and ignores query filters,
so recency is discovered by paging the line-item feed newest-first. **That feed
must never be used to total an estimate**, because:

- an estimate's lines do **not** share one version number — each line has its own,
  so "keep the highest version" silently discards real lines;
- a page window contains an arbitrary subset of any one estimate's lines.

Totalling from the feed under-reported job **DFM-0861** as **$333.50** (the 8
lines that happened to be in the window) against its true **$8,128.00** across
55 lines. Phase 2 exists to make that class of bug impossible: every figure
comes from `GET /estimates-snapshot/{id}`, which returns the whole aggregate.

---

## Business rules (all in the facade)

An approval reaches the board only if **all** of these hold:

| Rule | Why |
| --- | --- |
| Estimate status is Authorised | Line-level `authorised` flags are unreliable — an estimate can be Authorised with every line flagged 0. Status is the authority. |
| Type is not Direct Allocation | Those go straight to suppliers; they are not works our crews schedule. |
| Job is not Closed | Finished jobs need no scheduling. |
| Not equipment-hire-only | Rental periods are not works to crew. |
| Changed within the window | The board plans the near term. |

Two further rules affect presentation rather than inclusion:

- **Fully invoiced ⇒ works completed**, so it drops out of *Needs Scheduling*
  (progress invoices stay — part of the works may remain).
- **Availability covers field staff only** (technician / estimator / project
  manager, from the Connecteam Title), because coordinators and admin are never
  rostered to jobs.

---

## Freshness and cost

PrimeEco allows 60 requests/minute and 5,000/day, and Vercel's Hobby plan caps a
function at 10 seconds. Both constraints are respected by the same technique:
**cache per unit, and budget per request.**

| Cache | Key | TTL |
| --- | --- | --- |
| Change-feed page | page number | 15 min |
| Estimate snapshot | estimate id **+ version** | 1 h |
| Roster | — | 5 min |
| AR invoices | — | 30 min (shared) |

Including the snapshot **version** in the cache key means re-authorising an
estimate produces a new key, so the change is picked up immediately while
untouched estimates keep serving from cache.

Requests that cannot finish within their time budget return a partial result
flagged `complete: false`; the client then polls every 15 s instead of every
5 min until coverage is built up. A previously complete result is always
preferred over a fresh partial one, so the board never appears to lose rows.

Enrichment failures are contained: jobs and invoices are fetched with
`.catch(() => null)`, so losing either degrades one column instead of emptying
the board.

---

## Conventions

- Upstream field knowledge lives in the repository that owns it, never in UI.
- Comments explain **why**, especially where behaviour is driven by a quirk of
  the upstream data — those are the decisions a future reader cannot re-derive.
- Money is ex-GST throughout, and gated: job values are stripped server-side
  unless the management passcode is unlocked.
- Sample data mirrors the live shape so the board renders end-to-end without
  credentials.
