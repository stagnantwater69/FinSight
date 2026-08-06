# FinSight internal capstone acceptance checklist

Use this checklist for the current team-only capstone evaluation. It is an
engineering and presentation-readiness check, not a representative end-user
study. Use synthetic transactions and non-sensitive sample receipts only.

## Evidence header

| Field | Value |
|---|---|
| Date | |
| Tester | |
| Commit | |
| Backend environment | Existing Supabase development project |
| Web device/browser | |
| Mobile device/Android version | |
| App build or Expo version | |

For each check, record **Pass**, **Fail**, or **Blocked**, plus a screenshot or
short note. A failed critical check blocks the capstone demonstration until it
is fixed and retested.

## 0. Safety and setup

- [x] Hosted-project security advisors contain no unaccepted critical finding
  (verified 2026-08-06; RLS enabled on 13/13 application tables and client
  table grants revoked).
- [ ] The account and business are clearly labeled as capstone/demo data.
- [ ] Transactions, CSV files, and receipts contain no real personal or
  business information.
- [ ] Backend, web, and mobile point to the intended Supabase project and API.
- [x] `receipts` and `csv-imports` are private; `avatars` is public (verified
  2026-08-06).
- [ ] The complete automated gate passes on the commit being demonstrated.

## 1. Account and business setup — critical

- [ ] Register a new synthetic test account.
- [ ] Log out and log back in.
- [ ] Recover or change the password if the presentation includes that flow.
- [ ] Create `Capstone Demo Store` with documented starting values.
- [ ] Edit the profile and confirm the changes persist after refresh/relaunch.

Record the exact starting values:

| Value | Expected |
|---|---:|
| Available funds | |
| Expected monthly expenses | |
| Operating days | |
| Large-expense threshold | |

## 2. Manual financial records — critical

- [ ] Create at least five expenses across two or more categories.
- [ ] Create at least three sales records.
- [ ] Edit one expense and one sale.
- [ ] Search and filter the records.
- [ ] Confirm source labels identify manual entries correctly.

Maintain an independent calculator or spreadsheet and record:

| Metric | Expected | FinSight | Match? |
|---|---:|---:|---|
| Total expenses | | | |
| Total sales reference | | | |
| Largest category | | | |
| Available funds shown | | | |

## 3. Receipt scan — critical

- [ ] Capture a non-sensitive sample receipt on the presentation phone.
- [ ] Verify upload reaches a terminal processing state.
- [ ] Compare extracted date, vendor, amount, and line items with the receipt.
- [ ] Correct at least one field before confirmation.
- [ ] Confirm the resulting expense records reconcile to the receipt total.
- [ ] Confirm the source image can be viewed through a signed URL.
- [ ] Background and reopen the app during a second scan.
- [ ] Disable the network during a test and record the recovery behavior.

| Receipt field | Expected | Extracted | Final | Correct? |
|---|---|---|---|---|
| Date | | | | |
| Vendor | | | | |
| Total | | | | |

## 4. CSV import — critical if demonstrated

- [ ] Import the prepared synthetic CSV.
- [ ] Verify column mapping and invalid-row messages.
- [ ] Confirm category-creation preview before accepting it.
- [ ] Confirm imported totals against an independent calculation.
- [ ] Confirm the retained source file can be retrieved.

## 5. Review and duplicate handling

- [ ] Trigger and resolve a possible duplicate.
- [ ] Trigger or identify a record needing review.
- [ ] Verify the explanation and available resolution actions.
- [ ] Confirm resolving one business's record does not affect another business.

## 6. Dashboard and insights — critical

- [ ] Dashboard totals match the independent calculation.
- [ ] Category percentages total approximately 100%.
- [ ] Daily and monthly cashflow points use the correct dates and values.
- [ ] Recovery and spending-impact calculations match manual calculations.
- [ ] Ask FinSight uses the selected business's figures.
- [ ] Provider failure produces a clear fallback rather than invented figures.

## 7. Cross-platform and presentation readiness — critical

- [ ] Repeat the core record and dashboard checks on web and Android.
- [ ] Verify camera and photo-library permissions on the presentation phone.
- [ ] Verify navigation, charts, greeting animation, help, and categories.
- [ ] Test at the actual presentation network/location if possible.
- [ ] Prepare fallback screenshots or a short recording for network/provider
  failure during the presentation.
- [ ] Restart all services and repeat the shortest critical path.

## Defects and retest log

| ID | Severity | Step | Expected | Actual | Fix/decision | Retest |
|---|---|---|---|---|---|---|
| | | | | | | |

Severity definitions:

- **Critical:** prevents login, data entry, receipt confirmation, correct
  financial totals, or the planned presentation path.
- **High:** major workflow works only with a workaround or shows misleading
  financial information.
- **Medium/Low:** localized usability, copy, layout, or polish issue.

## Acceptance decision

- [ ] All critical checks passed.
- [ ] No unresolved Critical or High defect remains on the presentation path.
- [ ] Expected-versus-actual totals were independently checked.
- [ ] Physical Android evidence was recorded.
- [ ] Limitations are disclosed honestly in the capstone report.

Decision: **Accepted / Accepted with documented limitations / Not accepted**

Signed by: ____________________  Date: ____________________
