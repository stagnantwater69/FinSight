# FinSight — Project Brief & Build Instructions for Claude Code

Paste this whole file into Claude Code as your first message in the
project directory. It gives full context on what FinSight is, what's
already built, what conventions to follow, and how to proceed.

---

## 1. What FinSight Is

FinSight is an AI-assisted financial monitoring platform for small
business owners — a capstone project (BS Information Technology,
University of Cebu–Banilad) built for owners in Barangay Apas, Cebu City
who currently track finances in notebooks, loose receipts, or informal
spreadsheets with no way to see spending patterns or whether sales cover
costs.

It ships as a **web app** and an **Android app**, sharing one backend and
full feature parity between the two.

**⚠️ Critical scope constraint: this is a single-role system.** There is
**no Administrator account, no admin login, no user-account list, and no
account-management surface anywhere in the system.** The adviser removed
the Admin role from scope. The Small Business Owner is the only user type
that exists. Do not add admin functionality, an admin dashboard, a
`role`/`userType` check, or any "manage users" feature under any
circumstances, even if a reference document or old comment implies
otherwise.

---

## 2. The Six Modules (the entire feature scope)

| # | Module | Functions |
|---|---|---|
| 1 | **Account Management** | Register, log in, recover password, view profile, update profile, log out |
| 2 | **Business Profile Management** | Create, view, update, switch, and manage multiple business profiles; set Available Business Funds, Expected Monthly Expenses, Operating Days |
| 3 | **Records Management** | Add expense records, add sales reference records, scan receipts via OCR, import CSV records, review flagged records, manage duplicate records, search & filter records, edit/delete records |
| 4 | **Financial Monitoring Dashboard** | View financial overview, view expense insights, view spending impact, view recovery target |
| 5 | **Financial Analysis Insights** | Expense Behavior Analysis, Explain Financial Analysis Results, Target-Based Recovery Insight |
| 6 | **AI-Assisted Interaction** | Ask context-specific questions, answer context-specific questions, interpret financial scenarios, provide expense reduction strategies, generate plain-language summaries |

A business owner can manage **multiple business profiles** (e.g. multiple
stores/branches); nearly every record, insight, and AI interaction is
scoped to one `businessProfileId` at a time.

---

## 3. Tech Stack (do not substitute or "helpfully" swap these out)

| Layer | Technology |
|---|---|
| Mobile | React Native, Expo Go, RESTful API client, Google ML Kit OCR, Google Gemini API, OpenRouter API |
| Web | TypeScript, React JS, Vite, Tailwind CSS |
| Backend | Node.js, Express JS, RESTful API |
| Database / Auth / Storage | Supabase (PostgreSQL), Supabase Auth, Supabase Storage, Prisma ORM |
| Infra | Docker, Nginx |
| AI model / analysis | Isolation Forest, Z-score / IQR (statistical baseline), Google ML Kit OCR, Tesseract OCR, Scikit-learn |
| Future (not in current scope) | iOS platform, offline synchronization |

**Analysis engine rule:** new business profiles with limited transaction
history use the **Z-score/IQR statistical baseline**. Only once a profile
accumulates sufficient historical records does it graduate to
**Isolation Forest** (Scikit-learn — Python, so this needs a small
internal microservice or batch job; it cannot live in the Node backend as
plain TypeScript). Don't build Isolation Forest before the baseline is
solid and tested.

---

## 4. Current State of the Repo

The repo already has a working scaffold. **Read these files before writing
new code, so you extend the existing structure instead of duplicating
it:**

```
finsight/
├── DEVELOPMENT-WORKFLOW.md      — the phased build plan this brief follows
├── backend/
│   ├── prisma/schema.prisma     — full data model, already matches the ERD
│   ├── src/
│   │   ├── config/               (env.ts, prisma.ts, supabase.ts)
│   │   ├── middleware/           (auth, error handling, file upload)
│   │   ├── routes/               (one file per module, already wired)
│   │   ├── controllers/          (one file per module, business logic)
│   │   ├── services/             (storage, ocr, csvImport, duplicateDetection, analysis, ai)
│   │   └── app.ts / server.ts
│   └── .env.example
└── web/
    ├── package.json / vite.config.ts / tailwind.config.js  — configured
    └── src/                      — NOT YET BUILT — this is the next work
```

**Backend status:** all 6 modules have routes + controllers + services
wired end-to-end and should already run against a real Supabase project.
Several integration points are intentionally stubbed with `TODO` comments
— do not silently "complete" these with guessed values; flag them and ask,
or implement them clearly marked as an assumption:
- `ai.service.ts` — Gemini/OpenRouter calls are placeholders
- `ocr.service.ts` — Tesseract call is a placeholder
- Large-expense threshold in `records.controller.ts` — placeholder rule
  (25% of expected monthly expenses), not confirmed against the manuscript
- Isolation Forest — not implemented at all, Z-score baseline only

**Web frontend status:** configuration files exist; **no React source
files exist yet** (no `main.tsx`, `App.tsx`, routing, pages, or
components). This is very likely your first real task.

**Mobile:** not started at all.

---

## 5. Build Order — Follow This Sequence

Don't jump ahead to later phases even if it seems faster. Each phase is
only testable once the one before it works.

1. **Database live** — Supabase project connected, `prisma migrate dev`
   run successfully.
2. **Backend running, Module 1 (Account Management) proven via direct API
   calls** (Postman/curl) before any UI exists.
3. **Web frontend, module by module, in this exact order:**
   1. Login / Register / Profile (Account Management)
   2. Business Profile creation & switching
   3. Records Management — manual entry → receipt scan → CSV import →
      flagged/duplicates → search/filter, in that order of complexity
   4. Dashboard
   5. Insights
   6. Ask FinSight (AI chat) — build last, once there's real data to
      ground it in
4. **Mobile app**, reusing the backend, focused on camera-based OCR
   capture as the one genuinely new piece of work.
5. **Fill in deferred integrations** — real Gemini/OpenRouter calls, real
   Tesseract OCR, Isolation Forest once there's enough transaction history
   to justify it.
6. **Testing** — unit (analysis math), integration (record → flag →
   resolve → dashboard), OCR accuracy, AI response grounding, cross-platform
   parity, user acceptance testing.
7. **Deployment** — Docker/Nginx for backend, static build for web, APK
   for Android.

Full detail on each phase, including "done when" checkpoints, is in
`DEVELOPMENT-WORKFLOW.md` in the repo root — read it before starting a new
phase.

---

## 6. Conventions to Follow

- **TypeScript everywhere**, strict mode. No `any` unless truly
  unavoidable, and comment why if so.
- **Backend:** Express + Prisma, RESTful routes under `/api/v1/...`, one
  router + controller per module, business logic in `services/`, not
  inline in controllers. Validate all request bodies/queries with `zod`.
  Every authenticated route uses the existing `requireAuth` middleware —
  never add a role check, since there is only one role.
- **Web:** React function components + hooks, Tailwind for styling
  (design tokens already defined in `tailwind.config.js` — a teal-based
  palette, not generic AI-orange or default indigo). Use `react-router-dom`
  for routing, `axios` for API calls (put the client in `web/src/lib/api.ts`
  with a Supabase-session-token interceptor), `recharts` for dashboard
  charts.
- **Data model:** never modify `prisma/schema.prisma` without checking it
  against the actual data dictionary tables (User, BusinessProfile,
  ExpenseCategory, ExpenseRecord, SalesReferenceRecord, ReceiptScan,
  CSVImportBatch, Notification, AIInteraction) — don't invent new fields
  that aren't in the source manuscript without flagging it as a proposed
  addition first.
- **Commits:** small, one logical change per commit, message describes the
  module/feature (e.g. `feat(records): add manual expense entry form`).
- **Don't over-build.** If a manuscript detail is ambiguous (e.g. the exact
  large-expense threshold), implement a clearly-marked placeholder and ask
  rather than inventing a confident-sounding rule.

---

## 7. Your First Task

Start Phase 3, Step 1: build the **Account Management** web screens
(Login, Register, Profile) against the already-working backend routes in
`backend/src/routes/auth.routes.ts`. Before writing code:

1. Read `backend/src/controllers/auth.controller.ts` to confirm the exact
   request/response shapes you're building against.
2. Set up `web/src/lib/supabaseClient.ts` and `web/src/lib/api.ts` first —
   every screen after this depends on both existing.
3. Then build the Login/Register/Profile pages and wire up basic routing
   in `App.tsx`.

Ask me before moving on to Business Profile Management (Phase 3, Step 2).
