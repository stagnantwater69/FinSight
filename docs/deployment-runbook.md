# Deployment runbook

How to get FinSight running somewhere other than a laptop, and what to check
before and after. Host-agnostic on purpose: it does not pick a provider,
because that decision has not been made and the steps are the same either way.

Every command here has been run against this repo. Where something has NOT
been verified, it says so rather than implying it works.

---

## 1. What you are deploying

| Piece | What it is | How it ships |
|---|---|---|
| `backend/` | Express + Prisma API | Docker image (`backend/Dockerfile`, multi-stage, `node:24-bookworm-slim`) |
| `web/` | React + Vite SPA | Static files from `npm run build` → `web/dist/` |
| `mobile/` | React Native / Expo | APK or store build via Expo — **not covered here**, no build has been produced from this repo yet |
| Database + Storage + Auth | Supabase project | Already hosted; you provision the project, not the server |

`nginx/nginx.conf` and `docker-compose.yml` exist and put nginx in front of
the backend. Both were written for local use; the compose file is a reasonable
starting point for a single-VM deployment but has no TLS, no restart policy
beyond `unless-stopped`, and no log shipping.

---

## 2. Before the first deploy

- [ ] **A Supabase project that is not your development one.** Development
      data and real user data must not share a database. See §6.
- [ ] **Storage buckets exist** in that project: `receipts` (private),
      `csv-imports` (private), `avatars` (public). The app does not create
      them, and `uploadCsvFile` will fail at runtime if `csv-imports` is
      missing — `storage.service.ts` says so in a comment for exactly this
      reason.
- [ ] **Auth is configured** in Supabase (email/password provider enabled,
      redirect URLs set to wherever the web app is served from).
- [ ] **A decision about `GOOGLE_GEMINI_API_KEY`.** Without it the vision
      rescue and the AI features degrade quietly rather than erroring — which
      is the intended design, but means an unset key looks like "the AI is
      just not very good" rather than "the AI is not configured."

---

## 3. Environment variables

The backend validates these at boot (`backend/src/config/env.ts`) and refuses
to start if a required one is missing — a deliberate fail-fast, so a
misconfigured deploy dies immediately instead of erroring per-request later.

**Required — no default, boot fails without them:**

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Supabase pooled connection string |
| `DIRECT_URL` | Direct (non-pooled) connection. **Migrations use this one**, not `DATABASE_URL` — see §5 |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Public key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-side secret.** Never ship this to a client |

**Defaulted — but you almost certainly want to set them in production:**

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | Set to `production` |
| `CORS_ORIGIN` | `http://localhost:5173` | Must be the real web origin, or the browser blocks every request |
| `PORT` | `4000` | |
| `SUPABASE_STORAGE_BUCKET` | `receipts` | |
| `GOOGLE_GEMINI_API_KEY` | `""` | Empty disables the vision rescue silently |
| `OPENROUTER_API_KEY` | `""` | Fallback for the categoriser |
| `TESSERACT_LANG` | `eng` | |

The web build needs `VITE_API_BASE_URL` and the Supabase URL/anon key at
**build time**, not run time — Vite inlines them. Rebuild to change them.

**How to supply them:** there is no secrets manager wired up and no
`.env.production` convention in this repo. Use your host's environment/secrets
mechanism. Do not add a production `.env` to the repo — `.gitignore` covers
`.env`, and that is the only thing currently preventing an accidental commit.

---

## 4. Building and running

### Backend

```bash
docker build -t finsight-backend:$(git rev-parse --short HEAD) ./backend
docker run -d --name finsight-backend -p 4000:4000 --env-file /path/to/prod.env \
  finsight-backend:$(git rev-parse --short HEAD)
curl -s http://localhost:4000/api/v1/health    # → {"status":"ok"}
```

**Verified**: this image builds, boots, and answers `/api/v1/health` — checked
against this repo. Tagging by commit rather than `latest` is what makes a
rollback a matter of running the previous tag.

### Web

```bash
cd web && npm ci && npm run build      # → web/dist/
```

Serve `web/dist` as static files. It is a single-page app, so **the server
must fall back to `index.html` for unknown paths** — without that, refreshing
on `/records` returns a 404 instead of the app.

---

## 5. Database migrations

**`prisma migrate deploy` uses `DIRECT_URL`, not `DATABASE_URL`.** This is the
single easiest thing to get wrong here, and it fails in the worst way:
overriding only `DATABASE_URL` leaves the command pointed at whatever
`DIRECT_URL` holds, which — if that is still your development project — means
migrating the wrong database. Override **both**, always:

```bash
cd backend
DATABASE_URL="$PROD_DB_URL" DIRECT_URL="$PROD_DIRECT_URL" npx prisma migrate deploy
```

Then confirm it did what you expected:

```bash
DATABASE_URL="$PROD_DB_URL" DIRECT_URL="$PROD_DIRECT_URL" npx prisma migrate status
```

Notes:

- **Migrations run separately from the container start**, deliberately — an
  image that migrates on boot will race itself the moment there is more than
  one instance.
- `migrate deploy` only applies pending migrations and never resets. Do not
  use `migrate dev` against a real database; it can drop and recreate.
- **There is no automated rollback.** Prisma has no `migrate down`. The
  migrations in this repo are additive (new tables and defaulted columns), so
  the practical undo is a restore from backup — which is the reason §6 exists.
- Take a backup *before* migrating, not after.

---

## 6. Backups and recovery — the open question

**This is not solved, and it should be before real data exists.**

The database is Supabase-hosted, so backups are whatever your Supabase plan
provides — which on the free tier is limited and, more importantly, **has never
been tested by restoring from one**. A backup nobody has restored is a belief,
not a recovery plan.

Before real owners' figures are in this system:

- [ ] Confirm what the Supabase plan actually retains, and for how long
- [ ] Perform one restore into a scratch project, end to end
- [ ] Write down how long that took — that number is your actual RTO
- [ ] Decide who is allowed to run `migrate deploy` against production

Storage objects (receipt photographs, uploaded CSVs) are a **separate** concern
from the database. `sourceCleanup.ts` deletes them by reference counting when
records go, but nothing backs them up, so a bucket loss means every scanned
receipt image is gone while the expense records that reference them remain.

---

## 7. What you will not have on day one

Named plainly, so nobody assumes otherwise:

- **No error tracking.** No Sentry or equivalent. Failures surface as
  `console.error` in container logs and nowhere else — nobody is paged, and a
  crash loop is invisible until someone looks.
- **A liveness-only health check.** `/api/v1/health` returns `{"status":"ok"}`
  without touching the database, so it reports healthy while the database is
  unreachable. Fine for "is the process up", useless for "does it work".
- **No structured logging.** Plain `console.*`, no request ids, so correlating
  a user's report to a log line means guessing from timestamps.
- **Single instance only.** The rate limiter is in-memory and per-process
  (`rateLimit.middleware.ts` documents this itself). Behind two instances the
  effective limit doubles. Scaling horizontally means moving it to Redis or
  the database first.
- **Background scan work does not survive a restart.** Receipt reads run
  in-process (see schema header note 15); deploying mid-read strands those
  scans on `processingStatus = "Processing"`. The clients time out politely
  and offer a rescan, but those rows stay stuck. **Prefer deploying when
  nobody is mid-scan**, and know this is the cost of not having a job queue.
- **No security headers.** No `helmet`. See `SECURITY.md`.

---

## 8. After deploying

- [ ] `curl https://<host>/api/v1/health` → `{"status":"ok"}`
- [ ] Register a throwaway account and create a business profile
- [ ] Record one expense by hand
- [ ] Scan one receipt — this exercises Storage, OCR, and (if configured) the
      vision model, which is the most infrastructure any single action touches
- [ ] Import a small CSV
- [ ] Confirm `CORS_ORIGIN` is right by using the web app from its real URL,
      not from localhost
- [ ] Delete the throwaway account's data (**manual** — see `SECURITY.md`;
      there is no in-app hard delete yet)

---

## 9. Rolling back

1. Run the previous image tag (this is why §4 tags by commit).
2. **Check whether the bad deploy included a migration.** If it did, the old
   image may not tolerate the new schema. The migrations here are additive, so
   an older backend generally runs against a newer schema — but that is a
   property of the migrations so far, not a guarantee. Check the migration
   before assuming it.
3. If data is wrong rather than the code, restore from backup — and note that
   §6 means you should have tested that path already.
