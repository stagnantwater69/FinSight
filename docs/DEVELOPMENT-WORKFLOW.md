# FinSight development workflow

This document describes the current path from the working beta candidate to a
production pilot. It replaces the original scaffold-era phase plan, whose
functional phases have now been substantially implemented. Read the
[progress report](PROGRESS-REPORT.md) for the supporting evidence and the
[implementation brief](CLAUDE-CODE-PROMPT.md) for product constraints.

## Current status

FinSight is feature-complete for a controlled beta and is entering
stabilization and structured UAT. It is not production-ready yet. New broad
feature work should wait until the candidate is reviewed, reproducible, and
validated with users and representative devices.

## Stage 0 — stabilize the candidate

1. Review the full working tree, including migrations, tests, documentation,
   generated assets, and intentional file moves.
2. Keep changes in coherent commits by concern; do not mix unrelated feature,
   migration, content, and release-operation changes when they can be reviewed
   independently.
3. Run the complete backend, web, and mobile verification gate.
4. Apply the full Prisma migration chain to a clean dedicated database.
5. Smoke-test registration, business creation, record entry, dashboard output,
   receipt upload, owner confirmation, and source-file access.

Exit criteria:

- the working tree contains no accidental files or unreviewed generated output;
- all migrations and required assets are committed;
- all automated checks pass from the committed state;
- the clean-database smoke flow completes or any external dependency blocker
  is recorded explicitly.

## Stage 1 — conduct UAT

1. Provision an isolated Supabase branch or project; do not use development or
   production data.
2. Apply migrations with both the pooled `DATABASE_URL` and direct
   `DIRECT_URL` set to that same UAT environment.
3. Create the private `receipts` and `csv-imports` buckets and public `avatars`
   bucket, then configure authentication redirects.
4. Follow [the UAT environment guide](uat-environment.md), facilitator script,
   and feedback forms with representative users.
5. Include at least one complete scan-to-confirm session on a representative
   physical Android phone.
6. Score results using the repository's UAT script and record acceptance
   decisions and release-blocking findings.
7. Add only consented, appropriately protected real receipts to the private
   accuracy corpus.

Exit criteria:

- predefined UAT acceptance rules pass;
- severe findings are resolved or explicitly accepted by the release owner;
- real-device and real-receipt evidence is recorded.

## Stage 2 — close production-operation gaps

Complete these before accepting real production data:

- choose the production topology and secrets-management approach;
- add centralized error tracking, structured request logs, and correlation IDs;
- add a database-aware readiness check;
- rehearse database restoration into a scratch environment and record recovery
  time;
- define and test recovery for receipt and CSV storage objects;
- add a durable receipt-job queue or a reliable stale-scan recovery process;
- implement ownership-safe account and business hard deletion;
- add security headers;
- keep a single backend instance until rate limiting uses a shared store.

## Stage 3 — release engineering

1. Produce and install a signed Android test build.
2. Verify permissions, camera capture, upload, network loss, and app
   backgrounding on representative devices.
3. Add browser end-to-end coverage for money-changing workflows.
4. Establish performance budgets for web bundles and receipt processing.
5. Complete web and mobile accessibility reviews.
6. Handle dependency upgrades separately from candidate stabilization.

## Change rules

- Treat financial calculations, ownership checks, confirmation flows, and
  migrations as high-risk changes requiring targeted tests.
- Do not run destructive integration tests against a shared or hosted
  database.
- Do not expose Supabase service-role credentials to either client.
- For a hosted migration, verify both database URLs and the target project
  before applying it.
- Re-run the complete verification gate after the final commit, not only before
  committing.
- Record any manual or external validation that cannot be reproduced in CI.

## Complete verification gate

```bash
cd backend
npm run typecheck
npm run build
npx prisma validate
npm test

cd ../web
npm run typecheck
npm test
npm run build

cd ../mobile
npm run typecheck
npm test
```

The release gates and unresolved risks remain authoritative in
[PROGRESS-REPORT.md](PROGRESS-REPORT.md#proposed-production-pilot-gates).
