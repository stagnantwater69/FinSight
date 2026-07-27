# FinSight backend tests

## Running the suite

```bash
npm run test:db:up     # start the throwaway Postgres container (once)
npm test               # run everything
```

Other commands:

```bash
npm run test:watch        # re-run on change
npm run test:unit         # pure logic only, no database needed
npm run test:integration  # database-backed tests only
npm run test:db:down      # remove the test database container
npm run test:db:reset     # recreate it from scratch
```

## The test database

Tests run against a **local, throwaway Postgres container** on port `55432`, never
against the Supabase project. `.env.test` points there, and `tests/setup/globalSetup.ts`
**refuses to run** unless `DATABASE_URL` is a local database named `finsight_test`:

```
Error: Refusing to run tests against postgresql://user:****@db.…supabase.co:5432/postgres
The test suite truncates all tables. DATABASE_URL must point at a local database named finsight_test.
```

That guard matters because the integration tests `TRUNCATE` every table between
test files. Pointing them at the real project would destroy development data.

The schema is applied with `prisma migrate deploy`, so tests run against the real
migration history rather than a `db push` approximation of it.

`.env.test` is committed on purpose. Every value in it is fake — Supabase Storage
and the Auth admin API are mocked, and the AI providers are never called. If a
test ever does reach Supabase it fails loudly on the dummy credentials, which is
the intended behaviour: that is a test that needs mocking, not real keys.

### Supabase branching

The alternative was a Supabase branch via MCP. Not used: branching requires paid
cost confirmation, and a local container is free, faster, works offline, and can
be destroyed and recreated at will. MCP is currently pointed at the correct
project (`dgppgxtdzamxpufrcuqn`), but nothing in this suite depends on it.

## Layout

```
tests/
  setup/
    globalSetup.ts   migrations + the safety guard
    testDb.ts        truncation, factories, UTC date helpers
  unit/              pure functions — no database, milliseconds
  integration/       real services against real Postgres
  ocr-accuracy/      OCR accuracy assessment (NOT part of npm test)
  ai-quality/        AI response-quality rubric (NOT part of npm test)
```

## What is covered

| Area | Where |
|---|---|
| Recovery-target maths, month boundaries, degenerate inputs | `unit/recoveryTarget.test.ts` |
| Z-score outlier detection, leave-one-out baseline | `unit/zScoreOutlier.test.ts` |
| Large-expense threshold (both bases) and impact banding | `unit/thresholdAndBanding.test.ts` |
| Scenario amount extraction | `unit/scenario.test.ts` |
| UTC date boundaries | `unit/dates.test.ts` |
| Receipt field parsing | `unit/ocrParsing.test.ts` |
| Record lifecycle: create → flag → resolve | `integration/recordLifecycle.test.ts` |
| CSV import, valid and invalid rows | `integration/csvImport.test.ts` |
| Receipt scan → confirm → expense record | `integration/receiptScan.test.ts` |
| Ownership isolation across every resource | `integration/ownershipIsolation.test.ts` |
| Dashboard and insights against real rows | `integration/dashboardInsights.test.ts` |

## What is NOT covered, and why

- **HTTP layer, middleware and Supabase Auth.** Auth needs real Supabase tokens,
  so route wiring, zod validation and the auth middleware are exercised by the
  scripted end-to-end regression pass instead. Ownership rules are asserted at
  the service layer, which is where they are enforced.
- **Supabase Storage.** Mocked. Real uploads are covered by the end-to-end pass.
- **Real OCR on images.** Mocked in the integration tests so they stay
  deterministic; accuracy is measured separately in `ocr-accuracy/`.
- **Live AI calls.** Never made from `npm test` — no keys, and model output is
  not a pass/fail assertion. See `ai-quality/`.
- **The web frontend.** No component tests. Covered by typecheck, build and
  manual verification.

## Tests that pin known defects

Some tests assert current behaviour that is **wrong for the user** but not
silently changeable, so a future fix shows up as a deliberate, visible change:

- `unit/zScoreOutlier.test.ts` — "KNOWN DEFECT: false positives at the minimum
  history size". At exactly 5 records, both extremes of an ordinary category get
  reported as unusual.
- `unit/ocrParsing.test.ts` — "KNOWN LIMITATION: reads the wrong vendor when the
  name is in the footer".

## The two assessments outside `npm test`

Both make real external calls, cost money or minutes, and produce reports for
humans rather than assertions.

```bash
npx tsx tests/ocr-accuracy/run-assessment.ts   # ~5 min, no network
npx tsx tests/ai-quality/run-rubric.ts         # ~3 min, needs the backend running + AI keys
```

To rebuild the OCR corpus (needs Chrome and the source photos on disk):

```bash
python3 tests/ocr-accuracy/generate-corpus.py
```

Corpus images are not committed — one is a real receipt photograph. `ground-truth.json`
and the generated reports are.
