# FinSight

AI-assisted financial monitoring platform for small business owners — a
single-role system (Small Business Owner only, no admin surface). See
[CLAUDE-CODE-PROMPT.md](CLAUDE-CODE-PROMPT.md) for full project context and
conventions, and [DEVELOPMENT-WORKFLOW.md](DEVELOPMENT-WORKFLOW.md) for the
phased build plan and current status.

## Repo layout

```
backend/   Express + Prisma + TypeScript API
web/       Vite + React + TypeScript + Tailwind frontend
```

Mobile (React Native/Expo) hasn't been started yet — see
DEVELOPMENT-WORKFLOW.md Phase 4.

## Prerequisites

- Node.js 20+ (tested on 24)
- A Supabase project (for `DATABASE_URL`, Auth, Storage)

## backend/

```bash
cd backend
npm install
cp .env.example .env   # fill in real Supabase/Gemini/OpenRouter values
npm run dev             # http://localhost:4000
```

```bash
curl http://localhost:4000/api/v1/health
```

Once `DATABASE_URL` in `.env` points at a real Supabase Postgres instance:

```bash
npx prisma generate
npx prisma migrate dev
```

## web/

```bash
cd web
npm install
cp .env.example .env   # fill in Supabase URL + anon key, API base URL
npm run dev             # http://localhost:5173
```

## Supabase project

⚠️ This repo needs its own Supabase project (URL + anon/service keys). It
does not reuse credentials from any other FinSight prototype — plug your
own values into `backend/.env` and `web/.env` before running migrations.
