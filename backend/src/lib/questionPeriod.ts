import { utcAddDays, utcDateKey, utcIsoWeekday } from "./dates";
import type { PeriodSelection } from "./reportingPeriod";

/**
 * The period a chat question names, read deterministically from its words.
 *
 * Ask FinSight used to ground every answer in the last 30 days, so "what did I
 * spend in January?" was answered from September's figures, or not at all. The
 * period is parsed HERE rather than left to the model because it decides which
 * rows the server reads: a model that misread "Enero" would quietly answer
 * about the wrong month with figures that looked authoritative.
 *
 * English, Filipino and Taglish phrasings are all recognised. Anything not
 * recognised returns null and the caller keeps its default window, which is
 * the behaviour before this existed.
 */
export interface QuestionPeriod {
  selection: PeriodSelection;
  /** How the period is described back to the owner and the model, e.g. "January 2022". */
  label: string;
}

const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1, enero: 1,
  february: 2, feb: 2, pebrero: 2, febrero: 2,
  march: 3, mar: 3, marso: 3,
  april: 4, apr: 4, abril: 4,
  may: 5, mayo: 5,
  june: 6, jun: 6, hunyo: 6,
  july: 7, jul: 7, hulyo: 7,
  august: 8, aug: 8, agosto: 8,
  september: 9, sept: 9, sep: 9, setyembre: 9, septiyembre: 9,
  october: 10, oct: 10, oktubre: 10,
  november: 11, nov: 11, nobyembre: 11,
  december: 12, dec: 12, disyembre: 12,
};

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Longest rolling window a question may ask for — beyond this, "all time" is the honest reading. */
const MAX_ROLLING_DAYS = 366;

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthSelection(year: number, month: number): QuestionPeriod {
  return { selection: { kind: "month", month: monthKey(year, month) }, label: `${MONTH_LABELS[month - 1]} ${year}` };
}

/** A whole calendar year, as a rolling window ending on 31 December (or today, for the current year). */
function yearSelection(year: number, today: Date): QuestionPeriod | null {
  const start = new Date(Date.UTC(year, 0, 1));
  if (start > today) return null;
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const end = yearEnd < today ? yearEnd : today;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return { selection: { kind: "rolling", days, endDate: end }, label: year === today.getUTCFullYear() ? `${year} so far` : `${year}` };
}

/**
 * Every month the question names, in the order it names them. A month name
 * may carry a year on either side: "January 2022", "jan 2022", "2022 January".
 * "may" is also an ordinary English word ("may I…") and Filipino ("may utang"),
 * so on its own it only counts when a year is next to it.
 */
function namedMonths(q: string, today: Date): QuestionPeriod[] {
  const thisYear = today.getUTCFullYear();
  const thisMonth = today.getUTCMonth() + 1;
  const found: QuestionPeriod[] = [];
  // "January, March and June 2025": one year written once covers every month listed.
  const years = new Set(q.match(/\b(?:19|20)\d{2}\b/g) ?? []);
  const soleYear = years.size === 1 ? [...years][0] : undefined;
  const monthPattern = new RegExp(`\\b(${Object.keys(MONTH_NAMES).join("|")})\\b(?:\\s*,?\\s*((?:19|20)\\d{2}))?`, "g");
  for (const match of q.matchAll(monthPattern)) {
    const name = match[1]!;
    const month = MONTH_NAMES[name]!;
    const before = q.slice(Math.max(0, match.index! - 6), match.index!).match(/((?:19|20)\d{2})\s*$/);
    const yearText = match[2] ?? before?.[1];
    if (name === "may" && !yearText) continue;
    // Three-letter English words that are also month abbreviations ("mar", "jun")
    // only count beside a year, for the same reason.
    if (name.length === 3 && !yearText && !["jan", "feb", "apr", "aug", "sep", "oct", "nov", "dec"].includes(name)) continue;
    // No year: the question's one year, else the most recent such month that has started.
    const year = yearText ?? soleYear;
    found.push(monthSelection(year ? Number(year) : month > thisMonth ? thisYear - 1 : thisYear, month));
  }
  return found;
}

const monthKeyOf = (period: QuestionPeriod) => (period.selection.kind === "month" ? period.selection.month : "");

/**
 * Every distinct calendar month the question names, oldest first, including
 * "this month" and "last month".
 */
export function extractNamedMonths(question: string, today: Date): QuestionPeriod[] {
  const q = question.toLowerCase().replace(/[’']/g, "'");
  const thisYear = today.getUTCFullYear();
  const thisMonth = today.getUTCMonth() + 1;
  const months = namedMonths(q, today);
  if (/\b(this month|ngayong buwan)\b/.test(q)) months.push(monthSelection(thisYear, thisMonth));
  if (/\b(last month|nakaraang buwan|noong isang buwan|previous month)\b/.test(q)) {
    months.push(thisMonth === 1 ? monthSelection(thisYear - 1, 12) : monthSelection(thisYear, thisMonth - 1));
  }
  const distinct = months.filter((month, index) => months.findIndex((other) => other.label === month.label) === index);
  return distinct.sort((a, b) => monthKeyOf(a).localeCompare(monthKeyOf(b)));
}

/**
 * Two calendar months to set side by side — "October vs September",
 * "this month compared with last month" — oldest first. Null unless the
 * question names exactly two different months: three or more are answered
 * by the month-by-month breakdown instead, which used to drop all but two.
 */
export function extractComparedMonths(question: string, today: Date): [QuestionPeriod, QuestionPeriod] | null {
  const months = extractNamedMonths(question, today);
  return months.length === 2 ? (months as [QuestionPeriod, QuestionPeriod]) : null;
}

const MONTH_WORD = `(${Object.keys(MONTH_NAMES).join("|")})`;
const YEAR_WORD = "((?:19|20)\\d{2})";
const RANGE_PATTERN = new RegExp(
  `\\b${MONTH_WORD}\\.?(?:\\s*,?\\s*${YEAR_WORD})?\\s*(?:to|through|thru|until|till|-|–|hanggang(?: sa)?)\\s*${MONTH_WORD}\\b\\.?(?:\\s*,?\\s*${YEAR_WORD})?`,
);
const QUARTER_PATTERN = new RegExp(
  `\\b(?:${YEAR_WORD}\\s+)?(?:q([1-4])|(first|second|third|fourth|1st|2nd|3rd|4th) quarter)\\b(?:\\s*(?:of\\s+)?${YEAR_WORD})?`,
);
const QUARTER_WORDS: Record<string, number> = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4 };

/** Whole months from (y1, m1) to (y2, m2), ending today when the span is still in progress. */
function monthSpan(y1: number, m1: number, y2: number, m2: number, today: Date, label?: string): QuestionPeriod | null {
  const start = new Date(Date.UTC(y1, m1 - 1, 1));
  const lastDay = new Date(Date.UTC(y2, m2, 0));
  if (start > today || lastDay < start) return null;
  const end = lastDay < today ? lastDay : today;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const span =
    y1 === y2 ? `${MONTH_LABELS[m1 - 1]} to ${MONTH_LABELS[m2 - 1]} ${y2}` : `${MONTH_LABELS[m1 - 1]} ${y1} to ${MONTH_LABELS[m2 - 1]} ${y2}`;
  const text = label ? `${label} (${span})` : span;
  return { selection: { kind: "rolling", days, endDate: end }, label: end < lastDay ? `${text}, so far` : text };
}

/** "January to March", "Oct 2025 - Feb 2026", "Q1 2026", "second quarter". */
function monthRange(q: string, today: Date): QuestionPeriod | null {
  const thisYear = today.getUTCFullYear();
  const range = q.match(RANGE_PATTERN);
  if (range) {
    const m1 = MONTH_NAMES[range[1]!]!;
    const m2 = MONTH_NAMES[range[3]!]!;
    let y2 = range[4] ? Number(range[4]) : range[2] ? Number(range[2]) + (m2 < m1 ? 1 : 0) : thisYear;
    let y1 = range[2] ? Number(range[2]) : m1 <= m2 ? y2 : y2 - 1;
    // No year given and the span has not started yet: the owner means the last one.
    if (!range[2] && !range[4] && new Date(Date.UTC(y1, m1 - 1, 1)) > today) {
      y1 -= 1;
      y2 -= 1;
    }
    return monthSpan(y1, m1, y2, m2, today);
  }
  const quarter = q.match(QUARTER_PATTERN);
  if (quarter) {
    const n = quarter[2] ? Number(quarter[2]) : QUARTER_WORDS[quarter[3]!]!;
    const yearText = quarter[1] ?? quarter[4];
    let year = yearText ? Number(yearText) : thisYear;
    if (!yearText && new Date(Date.UTC(year, (n - 1) * 3, 1)) > today) year -= 1;
    return monthSpan(year, (n - 1) * 3 + 1, year, n * 3, today, `Q${n} ${year}`);
  }
  return null;
}

export function extractQuestionPeriod(question: string, today: Date): QuestionPeriod | null {
  const q = question.toLowerCase().replace(/[’']/g, "'");
  const thisYear = today.getUTCFullYear();
  const thisMonth = today.getUTCMonth() + 1;

  if (/\b(all[- ]time|ever|since (i|we) started|from the (start|beginning)|lahat ng panahon|kahit kailan)\b/.test(q)) {
    return { selection: { kind: "all" }, label: "all time" };
  }

  if (/\b(this week|ngayong linggo|this wk)\b/.test(q)) {
    return { selection: { kind: "week" }, label: "this week" };
  }
  if (/\b(last week|nakaraang linggo|noong isang linggo)\b/.test(q)) {
    const thisMonday = utcAddDays(today, -(utcIsoWeekday(today) - 1));
    const lastSunday = utcAddDays(thisMonday, -1);
    return {
      selection: { kind: "rolling", days: 7, endDate: lastSunday },
      label: `last week (${utcDateKey(utcAddDays(lastSunday, -6))} to ${utcDateKey(lastSunday)})`,
    };
  }

  if (/\b(this month|ngayong buwan|this mo)\b/.test(q)) {
    return monthSelection(thisYear, thisMonth);
  }
  if (/\b(last month|nakaraang buwan|noong isang buwan|previous month)\b/.test(q)) {
    return thisMonth === 1 ? monthSelection(thisYear - 1, 12) : monthSelection(thisYear, thisMonth - 1);
  }

  const lastNDays = q.match(/\b(?:last|past|nakaraang)\s+(\d{1,3})\s+(days?|araw)\b/);
  if (lastNDays) {
    const days = Number(lastNDays[1]);
    if (days >= 1 && days <= MAX_ROLLING_DAYS) {
      return { selection: { kind: "rolling", days }, label: `the last ${days} day${days === 1 ? "" : "s"}` };
    }
  }

  const range = monthRange(q, today);
  if (range) return range;

  // "2022-01" — an explicit month key.
  const isoMonth = q.match(/\b((?:19|20)\d{2})-(0[1-9]|1[0-2])\b/);
  if (isoMonth) return monthSelection(Number(isoMonth[1]), Number(isoMonth[2]));

  // Three or more months ("January, February and March") cover the span between them.
  const listed = extractNamedMonths(q, today);
  if (listed.length >= 3) {
    const [y1, m1] = monthKeyOf(listed[0]!).split("-").map(Number) as [number, number];
    const [y2, m2] = monthKeyOf(listed[listed.length - 1]!).split("-").map(Number) as [number, number];
    const span = monthSpan(y1, m1, y2, m2, today);
    if (span) return span;
  }

  const named = namedMonths(q, today)[0];
  if (named) return named;

  if (/\b(this year|ngayong taon)\b/.test(q)) return yearSelection(thisYear, today);
  if (/\b(last year|nakaraang taon|noong isang taon)\b/.test(q)) return yearSelection(thisYear - 1, today);
  // "about" so a follow-up "what about 2024?" names its year.
  const bareYear = q.match(/\b(?:in|for|of|about|noong|nung|sa|during)\s+((?:19|20)\d{2})\b/);
  if (bareYear) return yearSelection(Number(bareYear[1]), today);

  return null;
}

