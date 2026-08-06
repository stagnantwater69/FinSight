# FinSight

AI-assisted financial monitoring for small-business owners. FinSight is a
single-role product with web and mobile clients backed by an Express API,
Prisma/PostgreSQL, and Supabase Auth and Storage.

The application is feature-complete for a controlled beta. Current release
work is focused on stabilization, user acceptance testing (UAT), physical
device validation, and production operations. See the
[progress report](docs/PROGRESS-REPORT.md) and
[development workflow](docs/DEVELOPMENT-WORKFLOW.md) for the current status.
Project conventions are documented in
[the implementation brief](docs/CLAUDE-CODE-PROMPT.md).

## Repository layout

```text
backend/   Express + Prisma + TypeScript API
web/       Vite + React + TypeScript web client
mobile/    React Native + Expo mobile client
docs/      Architecture, security, UAT, and deployment documentation
scripts/   UAT result scoring tools
nginx/     Reverse-proxy configuration
```

## Prerequisites

- Node.js 22 or later
- npm
- PostgreSQL (the automated backend suite expects the dedicated test database)
- A Supabase project for Auth, Storage, and hosted PostgreSQL integration

Copy each application's example environment file before running it. Never
commit Supabase service-role keys or other secrets.

## Backend

```bash
cd backend
npm ci
cp .env.example .env
npx prisma generate
npm run dev
```

The API listens on `http://localhost:4000`; its basic health endpoint is
`GET /api/v1/health`.

For a fresh target database, set both `DATABASE_URL` and `DIRECT_URL` before
deploying migrations. See [the deployment runbook](docs/deployment-runbook.md)
and [UAT environment guide](docs/uat-environment.md) before pointing at a
shared or hosted environment.

## Web

```bash
cd web
npm ci
cp .env.example .env
npm run dev
```

The Vite development server normally listens on `http://localhost:5173`.
Supabase client settings and `VITE_API_BASE_URL` are build-time values.

## Mobile

```bash
cd mobile
npm ci
cp .env.example .env
npm start
```

When testing on a physical phone, configure the API base URL with an address
the phone can reach; `localhost` refers to the phone itself.

## Verification

Run the complete release-candidate gate before UAT or deployment:

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

Backend integration tests are destructive by design and refuse to run unless
their database URL targets the dedicated `finsight_test` database. The setup
and safeguards are described in [backend/tests/README.md](backend/tests/README.md).

## Release readiness

Passing automated tests is necessary but not sufficient. A production pilot
also requires completed UAT, a successful physical-device receipt flow,
measured real-receipt accuracy, rehearsed database and storage recovery,
operational monitoring, durable receipt-job recovery, and reliable user-data
deletion. The authoritative checklist is in
[docs/PROGRESS-REPORT.md](docs/PROGRESS-REPORT.md#proposed-production-pilot-gates).
