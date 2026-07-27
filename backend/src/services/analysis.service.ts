// Shared statistical/financial calculations — used by both the Dashboard
// summary endpoint and the Insights screens. Keep this the single source
// of truth for these formulas; don't let a second, slightly different
// version grow up in either caller.

// ============================================================
// Recovery target — month-to-date tracker
// ============================================================
//
// This replaces an earlier period-prorate model (periodTarget +
// perOperatingDayTarget). That model answered "what should this arbitrary
// N-day window have produced?", which is not the question the mockup or
// the manuscript actually asks. The question is "am I on pace to cover
// this month's expenses, and what do I need per day from here on?" — so
// the whole thing is anchored to the calendar month, not to a rolling
// window.
//
// Direct matches to the mockup's stated formulas:
//   Daily Needed Target  = Expected Monthly Expenses ÷ Operating Days
//   Remaining Target     = Expected Monthly Expenses − Sales So Far
//   Adjusted Daily Target = Remaining Target ÷ Remaining Operating Days
//
// INTERPRETED, not stated anywhere — see remainingOperatingDays below.

export type DayStatus = "above" | "at" | "below";

// Half a centavo. Comparing two Decimal-derived floats with === would
// make "at target" essentially unreachable; anything inside rounding
// noise of the target counts as having hit it.
const AMOUNT_EPSILON = 0.005;

export function dayStatus(sales: number, target: number): DayStatus {
  if (Math.abs(sales - target) < AMOUNT_EPSILON) return "at";
  return sales > target ? "above" : "below";
}

// Read in UTC because record dates are date-only values stored at UTC
// midnight — see lib/dates.ts for why local getters corrupt the result.
export { utcDaysInMonth as daysInMonth } from "../lib/dates";
import { utcDayOfMonth, utcDaysInMonth } from "../lib/dates";

export interface RecoveryTargetInput {
  expectedMonthlyExpenses: number;
  operatingDays: number;
  /** Sales reference recorded from the 1st of this month through today. */
  salesThisMonth: number;
  /** Sales reference recorded today only. */
  salesToday: number;
  today: Date;
}

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

export function computeRecoveryTarget(input: RecoveryTargetInput): RecoveryTargets {
  const { expectedMonthlyExpenses, operatingDays, salesThisMonth, salesToday, today } = input;

  const dailyNeededTarget = operatingDays > 0 ? expectedMonthlyExpenses / operatingDays : 0;

  // Floored at 0: once the month's expenses are covered there is no
  // "negative target left to earn" — a negative remaining target would
  // produce a nonsense negative adjusted daily target.
  const remainingTarget = Math.max(0, expectedMonthlyExpenses - salesThisMonth);

  // APPROXIMATION, flagged. BusinessProfile stores operatingDays as a
  // count per month (e.g. 25), not a weekly schedule (e.g. "closed
  // Sundays"), so the exact operating days left in the month are
  // genuinely unknowable from the data model. We scale the monthly count
  // by the fraction of the month still ahead. Today counts as remaining —
  // sales can still be recorded against it.
  // Clamped to >= 1 so the last day of the month can't divide by zero (or
  // by a rounded-down 0 for a business with few operating days).
  const totalDays = utcDaysInMonth(today);
  const calendarDaysLeftInMonth = totalDays - utcDayOfMonth(today) + 1;
  const remainingOperatingDays = Math.max(1, Math.round(operatingDays * (calendarDaysLeftInMonth / totalDays)));

  const adjustedDailyTarget = remainingTarget / remainingOperatingDays;

  const todaysTarget = dailyNeededTarget;
  const todaysGap = salesToday - todaysTarget;

  return {
    expectedMonthlyExpenses,
    operatingDays,
    dailyNeededTarget,
    salesThisMonth,
    remainingTarget,
    daysInMonth: totalDays,
    calendarDaysLeftInMonth,
    remainingOperatingDays,
    remainingOperatingDaysIsApproximated: true,
    adjustedDailyTarget,
    todaysTarget,
    todaysSales: salesToday,
    todaysGap,
    todaysStatus: dayStatus(salesToday, todaysTarget),
    monthCoveragePercent: expectedMonthlyExpenses > 0 ? (salesThisMonth / expectedMonthlyExpenses) * 100 : 0,
    // "On track" at the month level = the adjusted daily target hasn't
    // drifted above the original flat target. If it has, the shortfall so
    // far is now being pushed onto fewer remaining days.
    onTrack: adjustedDailyTarget <= dailyNeededTarget + AMOUNT_EPSILON,
  };
}

// ============================================================
// Spending-impact banding
// ============================================================
//
// INTERPRETED CUTOFFS, not adviser-confirmed. The mockup hardcoded 25% of
// Available Business Funds as "high impact" with a "noticeable" band
// starting at 10%. Rather than hardcode both numbers, the top boundary is
// the owner's configurable largeExpenseThresholdPercent and the lower
// boundary is 40% of it — which reproduces the mockup's 10% cutoff
// exactly when the threshold is left at the mockup's 25%.
//
// Note the mockup also had a fourth "Very High Impact" band above 50%
// (2x threshold). Not built — the spec for this step defines three bands.
export const NOTICEABLE_BAND_FRACTION = 0.4;

export type ImpactBand = "Low Impact" | "Noticeable Impact" | "High Impact";

export function impactBand(percentOfFunds: number, thresholdPercent: number): ImpactBand {
  if (percentOfFunds > thresholdPercent) return "High Impact";
  if (percentOfFunds >= thresholdPercent * NOTICEABLE_BAND_FRACTION) return "Noticeable Impact";
  return "Low Impact";
}

// PLACEHOLDER RULE, not adviser-confirmed — a 2 standard-deviation
// Z-score cutoff is a common statistical convention for "unusual" (flags
// roughly the outer ~5% under a normal-ish distribution) but nothing in
// the manuscript pins this sensitivity down. A different threshold is a
// legitimate adviser call.
export const Z_SCORE_THRESHOLD = 2;

// Below this many historical records in a category, mean/stddev are too
// noisy to be a meaningful baseline — report "insufficient history"
// rather than a number that looks precise but isn't.
//
// Raised from 5 to 8 after measurement. At 5 records, leave-one-out scoring
// estimates the baseline standard deviation from only 4 points; removing an
// extreme tightens that baseline enough that the extreme then clears 2 sd. The
// result was 2 false positives in 5 on ordinary categories — both the highest
// and lowest record reported as "unusual". At 8+ that collapses to under 1 in 8,
// while genuine outliers are still caught at every sample size.
export const MIN_HISTORY_FOR_DETECTION = 8;

// A record must ALSO differ from its category mean by at least this fraction
// before being reported. The z-score answers "is this statistically unusual for
// this category?", which on a tightly-clustered category can be true of a
// difference far too small to matter: PHP 187.50 on a category averaging
// PHP 5,000 (3.7%) scored 2.20 and was reported to the owner.
//
// A sari-sari store owner does not consider PHP 5,200 unusual where PHP 5,000
// is normal. This floor is the practical-significance half of the test, sitting
// alongside the statistical half.
export const MIN_DEVIATION_FRACTION = 0.15;

export interface CategoryStats {
  mean: number;
  stdDev: number;
  count: number;
}

// Sample standard deviation (n-1), not population (n) — with the small
// sample sizes this runs on (5-a few dozen records), population stddev
// underestimates spread and would over-flag borderline records.
export function computeCategoryStats(amounts: number[]): CategoryStats {
  const count = amounts.length;
  const mean = amounts.reduce((sum, a) => sum + a, 0) / count;
  const variance = count > 1 ? amounts.reduce((sum, a) => sum + (a - mean) ** 2, 0) / (count - 1) : 0;
  return { mean, stdDev: Math.sqrt(variance), count };
}

export function zScore(amount: number, stats: CategoryStats): number {
  if (stats.stdDev === 0) return 0;
  return (amount - stats.mean) / stats.stdDev;
}

/** How far the amount sits from the category mean, as a fraction of the mean. */
export function deviationFraction(amount: number, stats: CategoryStats): number {
  if (stats.mean === 0) return 0;
  return Math.abs(amount - stats.mean) / Math.abs(stats.mean);
}

/**
 * Whether a record should be reported to the owner as unusual.
 *
 * Both halves must hold:
 *   - statistically unusual for this category (|z| beyond the threshold), and
 *   - materially different in peso terms (at least MIN_DEVIATION_FRACTION).
 *
 * The z-score alone over-reports on tight clusters; the deviation floor alone
 * would fire on any category with naturally wide spread. Requiring both is what
 * makes a flag worth an owner's attention.
 */
export function isUnusualExpense(amount: number, stats: CategoryStats): boolean {
  return (
    Math.abs(zScore(amount, stats)) > Z_SCORE_THRESHOLD &&
    deviationFraction(amount, stats) >= MIN_DEVIATION_FRACTION
  );
}
