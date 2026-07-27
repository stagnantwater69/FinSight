# FinSight — Development Workflow

Phased build plan for this repo. Follow the order top to bottom — each phase
is only testable once the one before it works. See
[CLAUDE-CODE-PROMPT.md](CLAUDE-CODE-PROMPT.md) for full project context,
scope, and conventions.

## Phase 0 — Foundation (this phase)
- Repo scaffold: `backend/` (Express + TS + Prisma) and `web/` (Vite + React
  + TS + Tailwind), both building cleanly with no feature code yet.
- Prisma schema modeling the full ERD (all 9 tables from the data
  dictionary), so later phases never need structural migrations, only data.
- **Done when:** `npm run build` succeeds in both `backend/` and `web/`,
  and `npx prisma validate` passes.

## Phase 1 — Database Live
- Real Supabase project connected via `DATABASE_URL` in `backend/.env`.
- `npx prisma migrate dev` run successfully against it.
- **Done when:** tables exist in Supabase matching `schema.prisma`, verified
  via `npx prisma studio` or the Supabase dashboard.
- **Blocked on:** real Supabase project credentials — see the note in the
  root README.

## Phase 2 — Backend Module 1 (Account Management) proven via API calls
- Register, login, recover password, view/update profile, log out — wired
  to Supabase Auth, no UI yet.
- Proven with curl/Postman against a running `npm run dev`, not just
  compiled.
- **Done when:** a fresh user can register, log in, fetch `/me`, update
  profile fields, and log out, all via raw HTTP calls.

## Phase 3 — Web Frontend, module by module
1. **Login / Register / Profile** (Account Management) — *current step*
2. **Business Profile** creation & switching
3. **Records Management** — manual entry → receipt scan → CSV import →
   flagged/duplicates → search/filter, in that order of complexity
4. **Dashboard**
5. **Insights**
6. **Ask FinSight** (AI chat) — last, once there's real data to ground it in

Each step only starts once the previous one's backend routes are proven
(Phase 2 pattern repeats per module: backend proven via API calls, then UI).

## Phase 4 — Mobile app
React Native + Expo, reusing the same backend. Camera-based OCR capture is
the one genuinely new piece of work; everything else mirrors the web flows.

## Phase 5 — Deferred integrations
- Real Gemini/OpenRouter calls in `ai.service.ts` (currently a placeholder).
- Real Tesseract OCR in `ocr.service.ts` (currently a placeholder).
- Isolation Forest analysis microservice, once a business profile has
  enough transaction history to justify it (Z-score/IQR baseline until
  then).
- Confirm the large-expense threshold rule against the manuscript (currently
  a placeholder: 25% of expected monthly expenses).

## Phase 6 — Testing
Unit (analysis math), integration (record → flag → resolve → dashboard),
OCR accuracy, AI response grounding, cross-platform parity, user acceptance
testing.

## Phase 7 — Deployment
Docker + Nginx for the backend, static build for web, APK for Android.

---

**Current status: Phase 0 in progress.**
