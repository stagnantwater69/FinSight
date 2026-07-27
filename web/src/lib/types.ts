export interface Profile {
  id: number;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  status: string;
  createdAt: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  [key: string]: unknown;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  phoneNumber?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  phoneNumber?: string | null;
}

export interface BusinessProfile {
  id: number;
  name: string;
  type: string;
  availableFunds: number;
  expectedMonthlyExpenses: number;
  operatingDays: number;
  largeExpenseThresholdPercent: number;
  createdAt: string;
  /** Null when active. Archiving hides a business without deleting anything. */
  archivedAt: string | null;
  isArchived: boolean;
}

export interface BusinessProfileInput {
  name: string;
  type: string;
  availableFunds: number;
  expectedMonthlyExpenses: number;
  operatingDays: number;
  largeExpenseThresholdPercent: number;
}

export interface ExpenseCategory {
  id: number;
  businessProfileId: number;
  name: string;
  description: string | null;
  createdAt: string;
}

export type ReviewStatus = "Reviewed" | "Needs Review";
export type DuplicateStatus = "Not a Duplicate" | "Flagged";

export interface RecordItem {
  id: number;
  type: "expense" | "sales";
  businessProfileId: number;
  categoryId?: number;
  receiptScanId?: number | null;
  importBatchId?: number | null;
  duplicateOfRecordId: number | null;
  date: string;
  description: string;
  vendor?: string | null;
  amount: number;
  source: string;
  reviewStatus: ReviewStatus;
  duplicateStatus: DuplicateStatus;
  largeExpenseFlag?: boolean;
  createdAt: string;
}

export interface ExpenseRecordInput {
  businessProfileId: number;
  categoryId: number;
  date: string;
  description: string;
  vendor?: string;
  amount: number;
}

export interface SalesRecordInput {
  businessProfileId: number;
  date: string;
  description: string;
  amount: number;
}

export type RecordSource = "MANUAL_ENTRY" | "CSV_UPLOAD" | "RECEIPT_SCAN";

export const RECORD_SOURCE_LABELS: Record<RecordSource, string> = {
  MANUAL_ENTRY: "Manual Entry",
  CSV_UPLOAD: "CSV Upload",
  RECEIPT_SCAN: "Receipt Scan",
};

export interface RecordFilters {
  businessProfileId: number;
  type?: "expense" | "sales" | "all";
  categoryId?: number;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  source?: RecordSource;
}

export interface Notification {
  id: number;
  businessProfileId: number;
  message: string;
  type: string;
  dateCreated: string;
  readStatus: boolean;
}

export interface DashboardSummary {
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  overview: {
    availableFunds: number;
    totalExpenses: number;
    totalSalesReference: number;
  };
  expenseCategoryBreakdown: {
    categoryId: number;
    categoryName: string;
    total: number;
    percent: number;
  }[];
  recoveryStatus: RecoveryTargets;
  recordsNeedingReview: number;
  alerts: Notification[];
}

export type DayStatus = "above" | "at" | "below";

// Month-to-date recovery tracker. Shared verbatim by the Dashboard summary
// and the Insights Recovery Target screen — both read the same computed
// object from the backend, so they can't disagree.
export interface RecoveryTargets {
  expectedMonthlyExpenses: number;
  operatingDays: number;
  dailyNeededTarget: number;
  salesThisMonth: number;
  remainingTarget: number;
  daysInMonth: number;
  calendarDaysLeftInMonth: number;
  remainingOperatingDays: number;
  remainingOperatingDaysIsApproximated: boolean;
  adjustedDailyTarget: number;
  todaysTarget: number;
  todaysSales: number;
  todaysGap: number;
  todaysStatus: DayStatus;
  monthCoveragePercent: number;
  onTrack: boolean;
}

export interface CategoryTrend {
  categoryId: number;
  categoryName: string;
  current: number;
  previous: number;
  direction: "up" | "down" | "flat";
  percentChange: number | null;
  /** Number of expense records in the current period. */
  recordCount: number;
  /** Absolute peso movement — `current - previous`. */
  change: number;
}

/** One day of the period. Days with no spending are present with total 0. */
export interface DailyExpenseTotal {
  date: string;
  total: number;
  count: number;
}

export interface UnusualExpense {
  id: number;
  description: string;
  amount: number;
  date: string;
  categoryId: number;
  categoryName: string;
  zScore: number;
  categoryMean: number;
  categoryStdDev: number;
}

export interface ExpenseBehavior {
  periodStart: string;
  periodEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
  periodDays: number;
  /** Period totals, summed server-side so every surface shows the same figure. */
  totals: { current: number; previous: number };
  dailyTotals: DailyExpenseTotal[];
  categoryTrends: CategoryTrend[];
  unusualExpenses: UnusualExpense[];
  insufficientHistoryCategories: { categoryId: number; categoryName: string; historyCount: number }[];
}

export interface DailyCoverageRow {
  date: string;
  neededTarget: number;
  sales: number;
  gap: number;
  status: DayStatus;
}

export interface RecoveryInsight extends RecoveryTargets {
  monthStart: string;
  today: string;
  coverageDays: number;
  dailyCoverage: DailyCoverageRow[];
}

export type ImpactBand = "Low Impact" | "Noticeable Impact" | "High Impact";

export interface SpendingImpact {
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  plannedAmount: number;
  thresholdPercent: number;
  thresholdAmount: number;
  percentOfFunds: number;
  impactBand: ImpactBand;
  exceedsFunds: boolean;
  funds: { before: number; after: number };
  periodExpenses: { before: number; after: number };
  availableFunds: number;
  resultingFunds: number;
}

export type InteractionModule = "Expense Insights" | "Spending Impact" | "Recovery Target" | "Dashboard";

export interface AIInteraction {
  id: number;
  module: InteractionModule;
  question: string;
  answer: string;
  timestamp: string;
}

export interface AskResponse extends AIInteraction {
  provider: "gemini" | "openrouter" | "unavailable";
  detectedAmount: number | null;
}
