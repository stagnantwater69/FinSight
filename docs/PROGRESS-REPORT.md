# FinSight System Progress Report

**Reporting date:** 6 August 2026

**Branch reviewed:** `feat/mobile-ui-refine`

**Baseline commit:** `53dca4d`

**Stabilization status:** completed in six coherent commits after the baseline; working tree clean

**Scope:** Backend API, web application, mobile application, database, OCR/AI capabilities, automated tests, security, internal capstone acceptance, and demonstration readiness.

## Executive summary

FinSight has progressed well beyond its original scaffold. It is now a working cross-platform financial monitoring system composed of:

- an Express, Prisma, PostgreSQL, and TypeScript backend;
- a React, Vite, and TypeScript web application;
- a React Native and Expo mobile application;
- Supabase-backed authentication, database, and object-storage integration;
- OCR and vision-assisted receipt extraction;
- financial dashboards, insights, anomaly detection, and AI-assisted questions.

The system is best classified as **feature-complete for its capstone demonstration and ready for structured internal acceptance testing**. The project team are the intended evaluators and no external participant cohort is planned. This work must therefore be described as developer/internal acceptance, not representative user acceptance testing. The system is still not production-ready.

Fresh verification conducted for this report produced **843 passing automated tests**:

| Application | Result |
|---|---:|
| Backend | 657 tests passed across 31 files |
| Web | 75 tests passed across 5 files |
| Mobile | 111 tests passed across 15 files |
| **Total** | **843 tests passed** |

The root `README.md` and `docs/DEVELOPMENT-WORKFLOW.md` now reflect the implemented mobile application and the candidate's stabilization/UAT stage.

## Overall status

| Area | Status | Assessment |
|---|---|---|
| Backend/API | Green | Compiles, validates, and passes the complete automated suite |
| Web application | Green | Main product flows are present; tests and production build pass |
| Mobile application | Green/Amber | Broad feature parity and passing tests; physical-device validation remains |
| Database | Green | Prisma schema is valid and all 17 migrations apply successfully |
| Receipt/OCR | Green/Amber | Multi-page capture and review are implemented; field accuracy needs more real-receipt evidence |
| AI functionality | Amber | Provider integration and safe fallback behavior exist; live quality depends on external providers |
| Security | Amber | Strong ownership controls; deployment hardening and hard deletion remain open |
| Internal acceptance | Amber | Hosted security is verified; team workflow and physical-device checks remain |
| Deployment | Amber/Red | Docker and runbooks exist; hosting, recovery, monitoring, and mobile distribution remain unresolved |

## Progress against the development phases

### Phase 0 — Foundation: complete

- Backend and web projects compile successfully.
- The mobile application is also implemented and type-safe.
- Prisma schema validation succeeds.
- The database model has evolved through 17 migrations.
- Docker, nginx, testing, UAT, and deployment support files are present.

### Phase 1 — Database: complete for development and testing

- PostgreSQL is used through Prisma.
- The complete migration history is exercised against a dedicated local test database.
- Test safeguards refuse to run destructive integration tests against a remote or incorrectly named database.
- Supabase configuration supports Auth, Storage, and PostgreSQL.

The complete migration chain has been verified locally, and the hosted project
has the current security migration. Backup restoration only needs testing if
the project advances beyond capstone use.

The hosted project already contains the required `receipts`, `csv-imports`, and
`avatars` buckets with the expected private/private/public visibility.

### Phase 2 — Account management: substantially complete

Implemented capabilities include:

- registration and login;
- authentication/session handling;
- password recovery;
- current-user retrieval and profile editing;
- logout;
- protected API routes;
- business-scoped ownership checks.

The main remaining account-management gap is a user-facing hard-delete capability. Business profiles can be archived, but full account and business-data erasure currently requires direct administrative/database action.

### Phase 3 — Web application: substantially complete

The web application contains the main product journeys:

- landing, registration, login, password recovery, and profile;
- business-profile creation, editing, listing, and switching;
- manual sales and expense entry/editing;
- receipt scanning and owner confirmation;
- multi-page receipt uploads;
- CSV import, validation, mapping, and category preview;
- record filtering, search, and source provenance;
- duplicate and flagged-record resolution;
- dashboard, recovery, spending-impact, and expense insights;
- categories, notifications, Ask FinSight, tutorials, FAQs, legal pages, and contact information.

The production build succeeds. Route-level chunking is in place, although chart-related and shared application bundles remain candidates for later performance optimization.

### Phase 4 — Mobile application: substantially complete

The Expo mobile application includes:

- authentication flows;
- business management;
- dashboard and financial summaries;
- sales and expense records;
- camera/photo receipt capture;
- CSV import support;
- categories and insights;
- notifications, help, and settings/more screens;
- Ask FinSight access;
- accessibility and reduced-motion improvements.

The current working tree includes a significant mobile home/dashboard refinement with new charts, quick actions, a greeting hero, spending breakdown, categories/help access, and an Ask FinSight floating action button.

The primary remaining mobile gate is testing the complete capture-to-confirm flow on representative physical Android devices. No APK or store build has yet been documented as produced from this repository.

### Phase 5 — OCR, AI, and financial analysis: substantially implemented

Implemented capabilities include:

- Tesseract OCR;
- OCR confidence tracking;
- deterministic receipt field and line-item parsing;
- Gemini vision-assisted rescue when objective quality checks fail;
- AI-assisted categorisation;
- Ask FinSight contextual questions;
- history-based vendor matching;
- Z-score and IQR anomaly detection;
- recovery-target calculations;
- threshold and impact banding;
- allocation and receipt-total reconciliation.

Remaining considerations:

- the large-expense threshold remains a business assumption requiring validation;
- Isolation Forest analysis remains deferred;
- live AI quality and availability depend on correctly configured external services;
- known parsing limitations remain for difficult receipt layouts.

### Phase 6 — Testing: strong automated foundation

The project contains unit, integration, contract, web, mobile, OCR-quality, AI-quality, cross-platform parity, and UAT assets.

Strengths include coverage for:

- financial calculations and date boundaries;
- anomaly detection and recovery targets;
- authentication ownership boundaries;
- record lifecycle and business isolation;
- receipt scanning, polling, confirmation, and failure behavior;
- multi-page receipts and duplicate-page detection;
- CSV import and duplicate resolution;
- source-file cleanup;
- extraction feedback and calibration metrics;
- client/backend payload compatibility;
- mobile navigation, formatting, content, and consistency;
- selected web receipt review and component behavior.

Remaining gaps include:

- real Supabase Auth and Storage are mocked in automated backend tests;
- real OCR assessment is separate from the standard suite;
- the receipt corpus is mainly synthetic;
- live AI calls are excluded from deterministic tests;
- a comprehensive browser end-to-end suite is not evident;
- physical-device capture, load, soak, and poor-network tests remain;
- production restoration has never been exercised.

### Phase 7 — Deployment: partially complete

Available deployment assets include:

- a multi-stage backend Dockerfile;
- nginx configuration;
- Docker Compose configuration;
- a web production build;
- a detailed deployment runbook;
- UAT environment instructions.

The backend image and health endpoint have previously been documented as verified. However, deployment readiness is incomplete because:

- no production provider/topology is selected;
- TLS is not included in the supplied nginx setup;
- no error-tracking service is configured;
- logs are unstructured and lack request correlation;
- the health endpoint does not test database connectivity;
- no storage backup strategy is documented;
- no database restore rehearsal has been completed;
- no mobile release build is documented.

## Delivered functional capabilities

### Financial records

- Manual sales and expense creation and editing.
- Business-scoped access and ownership enforcement.
- Search and filtering by relevant record attributes.
- User-defined expense categories.
- Source provenance for manual, CSV, and receipt-derived records.
- Flagged-record handling and anomaly review.
- Duplicate detection and grouped duplicate resolution.

### Receipt processing

- Single-page and multi-page receipt upload.
- Ordered receipt pages stored against one scan.
- Pollable background processing states.
- OCR confidence measurement.
- Vision rescue for low-confidence or unreconciled scans.
- Receipt field and line-item extraction.
- Item categorisation and category proposals.
- Reconciliation between item totals and receipt totals.
- Duplicate-page and multiple-receipt warnings.
- Image-quality assessment.
- Owner review before an expense is created.
- Cleanup of orphaned receipt source files.

### Extraction feedback

The current work adds a feedback loop that records differences between extracted values and owner-confirmed values. Supporting tools can calculate accuracy, calibration, and recurring error clusters and recommend confidence-threshold changes.

This process is intentionally review-driven:

- thresholds do not change automatically;
- real owner corrections require human review before becoming prompt examples;
- proposed changes must be measured against the fixed corpus before release;
- correction data remains subject to privacy restrictions.

### CSV import

- File parsing and row validation.
- Column/header mapping.
- Import preview.
- Category-creation preview.
- Source-file retention and signed retrieval.
- Safe filename handling for storage object keys.

### Dashboard and insights

- Business totals and trends.
- Period and category comparisons.
- Spending breakdowns.
- Recovery-target and spending-impact calculations.
- Business-aware AI context.
- Explicit outage/fallback messages when AI providers are unavailable.

## Verification results

The following checks were run against the current working tree:

| Component | Command | Result |
|---|---|---|
| Backend | `npm run typecheck` | Passed |
| Backend | `npm run build` | Passed |
| Backend | `npx prisma validate` | Passed |
| Backend | `npm test` | 657 tests passed |
| Web | `npm test` | 75 tests passed |
| Web | `npm run build` | Passed |
| Mobile | `npm test` | 111 tests passed |
| Mobile | `npm run typecheck` | Passed |

The backend tests required the repository's dedicated PostgreSQL container. The container initially existed but was stopped; after it was started, all backend tests passed. Warning output from deliberately invalid mock image bytes and simulated provider failures was expected by the relevant tests and did not produce failures.

## Candidate stabilization completed

At the start of this review, the repository had a large uncommitted workstream spanning backend, web, mobile, schema, tests, documentation, and assets.

Tracked changes represented approximately:

- 26 modified or deleted files;
- 1,428 additions;
- 515 deletions.

Major themes include:

- mobile home/dashboard redesign;
- new charts and spending breakdowns;
- quick actions and Ask FinSight entry points;
- category and help screens;
- dashboard API/service improvements;
- receipt extraction feedback and reporting;
- revised web help, legal, marketing, and contact content;
- new automated tests and mobile assets.

That workstream has now been reviewed and split into six commits covering dashboard API work, receipt-extraction feedback, mobile UI, web content, and documentation. Required migrations, tests, generated frames, source artwork, and document moves are included intentionally, and the working tree is clean. The branch name `feat/mobile-ui-refine` still understates the backend, database, and web changes now included, but the commit boundaries make those concerns independently reviewable.

The complete 843-test/typecheck/build gate passed before and after the commits. All 17 migrations were also applied locally. The resulting correction table was checked for its cascade foreign key, indexes, and enabled row-level security. A local data-to-dashboard smoke check returned the expected expense, sales, category, and cashflow totals. The hosted security migration was then verified separately: all 13 public application tables have RLS enabled, client Data API roles have zero table grants, and backend database access remains operational.

Live internal acceptance now covers Supabase registration and password login,
hosted Storage uploads and signed retrieval, a synthetic receipt scan and CSV
import, duplicate resolution, dashboard/insight calculations, Ask FinSight,
and the rendered web dashboard. Results are recorded in
`docs/internal-acceptance-results-2026-08-06.md`. Physical Android camera,
backgrounding, network-loss, and presentation-location evidence remain.

## Key risks and blockers

### Capstone-critical risks

1. **Internal acceptance is partially complete.** Hosted and automated web checks pass, but the presentation workflow and physical-device evidence remain outstanding.
2. **The physical presentation-device flow is unverified.** Camera, network-loss, backgrounding, and scan-to-confirm still require hands-on evidence.

### Future production risks

4. **Production backup and recovery are untested.** A successful restore must be demonstrated before production use, not merely assumed.
5. **Storage files lack a recovery strategy.** Database backups alone do not protect receipt photographs and imported CSV files.
6. **Receipt jobs are not durable.** Background work runs inside the API process and can be stranded during a restart.
7. **Operational monitoring is absent.** There is no centralized error reporting, structured logging, or database-aware readiness check.
8. **Hard deletion is missing.** Full data-erasure requests cannot currently be completed through the application.

### Product-quality risks

9. **Real-receipt evidence is limited.** Synthetic corpus results are valuable for regression tests but do not prove production accuracy on blurred, folded, faded, or badly lit receipts.
10. **External AI behavior varies.** Categorisation, vision rescue, and Ask FinSight depend on provider configuration and availability.
11. **Known outlier edge case.** At the minimum history size, ordinary extremes can produce false positives.
12. **Known OCR layout issue.** Vendor text in a footer may be selected incorrectly.
13. **Business threshold assumption.** The large-expense threshold still requires stakeholder and user validation.

### Security and operational risks

14. **Leaked-password protection is disabled.** Accepted for synthetic capstone accounts; enable it before storing real user credentials.
15. **Security headers are not configured.** Helmet or equivalent hardening remains pending.
16. **Rate limiting is process-local.** Horizontal scaling would multiply the effective allowance.
17. **A React Router advisory is accepted, not patched.** The documented vulnerable RSC path is not used by this client-side bearer-token application, but the finding should be revisited when an appropriate forward fix is available.
18. **Expo build-tool advisories remain.** These should be reassessed during the next SDK upgrade.
19. **Migration configuration is sensitive.** Both `DATABASE_URL` and `DIRECT_URL` must be set when migrating a target environment to avoid using the wrong database.

### Project-control note

The broad working tree and stale primary documentation identified during the initial review have been resolved. The branch name remains broader in content than its name suggests; preserve the coherent commit boundaries during review or integration.

## Recommended next steps

### Priority 0 — stabilize the current candidate

Completed locally:

1. Reviewed and split the working tree into six coherent commits.
2. Included the required migrations, tests, assets, and documentation intentionally.
3. Re-ran the complete 843-test/typecheck/build gate against the committed state.
4. Updated the root README and development workflow.
5. Applied all migrations to a clean scratch database and smoke-tested seeded financial data through the dashboard services.

The external smoke portion is now complete against the existing development
project using synthetic data: registration, login, hosted receipt/CSV Storage,
receipt confirmation, financial calculations, Ask FinSight, and the rendered
web dashboard passed. The hosted RLS/Data API finding is also resolved and
verified.

### Priority 1 — internal capstone acceptance

Completed: the labeled synthetic demo account, hosted workflow, web acceptance
automation, independent financial calculations, and clean demo dataset.

Remaining:

1. Run the physical Android portions of `docs/internal-acceptance-checklist.md`.
2. Include at least one complete receipt-capture session on the presentation phone.
3. Test backgrounding, network loss, permissions, and the presentation network.
4. Record screenshots or video and prepare offline fallback evidence.
5. Restart the presentation stack and repeat the shortest critical path.

The facilitator script, participant feedback form, and scoring utility are retained only for a future or adviser-required external study. Team responses must not be reported as representative UAT percentages.

### Priority 2 — close production operations gaps

1. Select the production host and secrets-management approach.
2. Add centralized error tracking and structured request logs.
3. Add a database-aware readiness endpoint.
4. Test database restoration into a scratch environment and record actual recovery time.
5. Define recovery for receipt and CSV storage objects.
6. Implement a durable job queue or stale-scan recovery process.
7. Implement ownership-safe account and business hard deletion.
8. Add security headers and retain a single backend instance until rate limiting is centralized.

### Priority 3 — release engineering

1. Produce a signed Android test build.
2. Verify installation, permissions, camera capture, upload, network loss, and app backgrounding.
3. Add browser end-to-end tests for money-changing workflows.
4. Establish web bundle and receipt-processing performance budgets.
5. Perform web and mobile accessibility reviews.
6. Address dependency upgrades separately from the stabilized release candidate.

## Capstone demonstration gates

FinSight is ready for its capstone demonstration when:

- all automated build and test gates remain green;
- the hosted RLS/Data API exposure is resolved and rechecked;
- the internal acceptance checklist passes with no critical presentation-path defect;
- the presentation Android device completes scan-to-confirm successfully;
- synthetic expected-versus-actual financial totals match;
- Auth, Storage, environment variables, migrations, and CORS are smoke-tested;
- a clean synthetic demo account and fallback screenshots are prepared;
- the current working changes remain reviewed and committed;
- primary project documentation continues to describe the system accurately.

## Conclusion

FinSight is no longer an early-stage scaffold. It is a broad and well-tested product candidate with thoughtful safeguards around ownership, financial confirmation, receipt reconciliation, source provenance, and AI failure behavior.

The local candidate is stabilized. The next milestone is **internal capstone evidence rather than additional broad features**: resolve the hosted data-exposure finding, complete the checklist on the presentation phone, verify financial outputs independently, and rehearse the final demonstration. Production-operation gaps should remain disclosed as future work rather than being presented as completed.
