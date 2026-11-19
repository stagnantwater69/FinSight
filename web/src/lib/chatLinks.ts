import type { ChatAction, ChatAnswerBasis, ChatPageKey, ChatRecordReference } from "./types";

/**
 * Where Ask FinSight's link buttons go on the web.
 *
 * The server only ever sends a page KEY or a record id it resolved itself;
 * the route is decided here, so a model can never steer the browser to a URL
 * of its own invention.
 */
export const CHAT_PAGE_ROUTES: Record<ChatPageKey, string> = {
  dashboard: "/dashboard",
  records: "/records",
  "review-queue": "/records/flagged",
  "expense-insights": "/insights/expense-behavior",
  recovery: "/insights/recovery",
  "spending-impact": "/insights/spending-impact",
  categories: "/records/categories",
  "add-expense": "/records/expenses/new",
  "add-sales": "/records/sales/new",
  "scan-receipt": "/records/receipts/new",
};

/** Records, pre-filtered through the same URL params global search uses. */
export function recordsFilterHref(action: Extract<ChatAction, { kind: "open-records" }>): string {
  const params = new URLSearchParams({ type: action.recordType, dateFrom: action.dateFrom, dateTo: action.dateTo });
  if (action.categoryId !== undefined) params.set("categoryId", String(action.categoryId));
  if (action.keyword) params.set("keyword", action.keyword);
  return `/records?${params.toString()}`;
}

/**
 * Expenses open on the Records list with the row highlighted — the same
 * `highlightRecordId` link a notification uses. Sales have no highlight on
 * that list, so they open their own edit screen.
 */
export function recordHref(reference: ChatRecordReference): string {
  return reference.recordType === "expense"
    ? `/records?highlightRecordId=${reference.id}`
    : `/records/sales/${reference.id}/edit`;
}

const plural = (count: number, noun: string) => `${count.toLocaleString("en-US")} ${noun}${count === 1 ? "" : "s"}`;

/** "Figures from 214 expense records and 30 sales records, 2026-01-01 to 2026-11-19." Same words on web and mobile. */
export function basisSentence(basis: ChatAnswerBasis): string {
  const records = [
    basis.expenseRecords > 0 ? plural(basis.expenseRecords, "expense record") : null,
    basis.salesRecords > 0 ? plural(basis.salesRecords, "sales record") : null,
  ].filter(Boolean);
  const span = basis.from ? `${basis.from} to ${basis.to}` : `all records up to ${basis.to}`;
  return records.length > 0 ? `Figures from ${records.join(" and ")}, ${span}.` : `No counted records from ${span}.`;
}
