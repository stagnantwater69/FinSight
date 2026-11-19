import { extractScenario } from "./scenario";
import type { ReductionSpec } from "../services/reductionOpportunity.service";

/**
 * What an Ask FinSight message asks FinSight to calculate or offer, read from
 * its words. Every reader here returns null unless the message is unmistakable:
 * a wrong guess runs the wrong simulation, and its figures would then reach the
 * owner looking just as authoritative as a right one.
 */

/** "What if", "if I", "kung" — the message describes something that has not happened. */
export const HYPOTHETICAL_CUE = /\b(?:what\s?if|if (?:i|we|my|our)|suppose|afford|plan(?:ning)? to|thinking of|(?:paano )?kung)\b/i;
export const PURCHASE_WORD = /\b(?:buy|buying|spend|spending|purchase|purchasing|pay|paying|afford|invest|investing|bibili|bumili|gagastos|magbabayad)\b/i;

const ASKING = /\?\s*$|^\s*(?:how|what|why|when|where|which|who|did|do|does|is|are|was|were|can|could|should|would|magkano|bakit|ano|anong|paano|kailan|saan|ilan)\b/i;
const PAID = /\b(?:paid|bought|spent|purchased|nagbayad|binayaran|bumili|binili|gumastos|ginastos)\b/i;
const SOLD = /\b(?:sold|earned|nabenta|naibenta|nakabenta|kumita|kinita)\b/i;
const TIME_WORDS = /\s+(?:today|yesterday|this morning|this afternoon|last night|kanina|kahapon|ngayon|kagabi)\s*$/i;

export interface RecordedTransaction {
  recordType: "expense" | "sales";
  amount: number;
  description: string;
}

/**
 * "I paid 500 for rice today", "nabenta ko 3,000 kanina". A statement that
 * something already happened, with an amount, so FinSight can offer to record
 * it. Questions and hypotheticals are not statements: "how much did I spend?"
 * and "what if I buy…" never qualify.
 */
export function recordedTransaction(message: string): RecordedTransaction | null {
  if (ASKING.test(message) || HYPOTHETICAL_CUE.test(message)) return null;
  const recordType = PAID.test(message) ? "expense" : SOLD.test(message) ? "sales" : null;
  if (!recordType) return null;
  const { amount, label } = extractScenario(message);
  if (amount === null) return null;
  const item = label?.replace(TIME_WORDS, "").trim().slice(0, 255) ?? "";
  return { recordType, amount, description: item || (recordType === "sales" ? "Daily sales" : "") };
}

export type RecoveryWhatIf = { kind: "daily-sales"; amount: number } | { kind: "monthly-costs"; amount: number };

const DAILY = /\b(?:a|per|each|every|kada|bawat)\s+(?:open\s+)?(?:day|araw)\b|\bdaily\b|\barawan\b/i;
const SELLING = /\b(?:sell|selling|make|making|benta|magbenta|makabenta|kumita|kikita)\b/i;
const MONTHLY_COSTS = /\b(?:monthly (?:costs?|expenses?|gastos)|(?:costs?|expenses?|gastos) (?:a|per|each|every|kada|bawat) (?:month|buwan))\b/i;

/** "What if I sell 3,000 a day?" or "what if my monthly costs were 100k?" — Recovery Target's two levers. */
export function recoveryWhatIf(message: string): RecoveryWhatIf | null {
  if (!HYPOTHETICAL_CUE.test(message)) return null;
  const { amount } = extractScenario(message);
  if (amount === null) return null;
  if (MONTHLY_COSTS.test(message)) return { kind: "monthly-costs", amount };
  if (SELLING.test(message) && DAILY.test(message)) return { kind: "daily-sales", amount };
  return null;
}

const CUTTING = /\b(?:cut|cutting|reduce|reducing|lower|lowering|lessen|trim|bawasan|babaan|bawas)\b/i;
const PERCENT = /(\d{1,3}(?:\.\d+)?)\s*(?:%|percent|porsyento)/i;

/**
 * "What if I cut Supplies by 10%?" — the size of the cut. Which category is
 * cut is decided against the owner's own category names by the caller.
 */
export function reductionWhatIf(message: string): ReductionSpec | null {
  if (!CUTTING.test(message) || !(HYPOTHETICAL_CUE.test(message) || /\bwould\b/i.test(message))) return null;
  const percent = message.match(PERCENT);
  if (percent) {
    const value = Number(percent[1]);
    return value > 0 && value <= 100 ? { kind: "percent", value } : null;
  }
  const { amount } = extractScenario(message);
  return amount === null ? null : { kind: "amount", value: amount };
}

/** "Is my data complete?", "did I forget anything?" */
export const COMPLETENESS_CUE =
  /\b(?:complete|missing|forgot|forget|up to date|accurate|correct|kulang|nakalimutan|tama ba|kumpleto)\b/i;

export interface BreakdownIntent {
  subject: "expense" | "sales";
  groupBy: "month" | "week" | "category" | "vendor";
  /** asc = least to greatest, desc = greatest first, chronological = calendar order. */
  order: "asc" | "desc" | "chronological";
}

const RANK_CUE =
  /\b(?:rank\w*|sort\w*|order\w*|highest|lowest|most|least|greatest|biggest|smallest|largest|top|bottom|best|worst|pinaka\w*)\b/i;
const MONTH_GROUP =
  /\b(?:monthly|by month|per month|each month|every month|month[- ]by[- ]month|month[- ]on[- ]month|(?:which|what) months?|buwan[- ]buwan|buwanan|kada buwan|bawat buwan|(?:anong|aling) buwan)\b/i;
const WEEK_GROUP =
  /\b(?:weekly|by week|per week|each week|every week|week[- ]by[- ]week|(?:which|what) weeks?|linggo[- ]linggo|lingguhan|kada linggo|bawat linggo)\b/i;
const ASCENDING =
  /\b(?:least to (?:greatest|most|highest|biggest|largest)|lowest (?:to|first)|smallest (?:to|first)|ascending|(?:which|what) month .*\b(?:least|lowest|smallest)|pinakamababa|pinakamaliit|pinakakaunti)\b/i;
const VENDOR_WORD = /\b(?:vendors?|suppliers?|payees?|stores?|tindahan|supplier)\b/i;
const CATEGORY_WORD = /\b(?:categor(?:y|ies)|kategorya|kategoryang)\b/i;
const BY_GROUP = /\b(?:by|per|each|every|kada|bawat)\s+(?:vendor|supplier|category|kategorya)\b/i;
/** "Which category moved the most?" asks about change, which the snapshot's trends answer. */
const CHANGE_WORD = /\b(?:moved|changed?|grew|growth|increased?|decreased?|rose|dropped|fell|up|down|tumaas|bumaba|lumaki)\b/i;
const LEAST = /\b(?:least|lowest|smallest|fewest)\b|pinakamababa|pinakamaliit|pinakakaunti/i;
const MOST_TO_LEAST = /\b(?:most|highest|greatest|biggest|largest) to (?:least|lowest|smallest)\b/i;
const SALES_SUBJECT = /\b(?:sales|sold|sell|revenue|income|benta|nabenta|kita|kinita)\b/i;
const EXPENSE_SUBJECT = /\b(?:expenses?|spend\w*|spent|costs?|gastos|ginastos|bayad)\b/i;

/**
 * "Rank my monthly expense this year", "which month did I spend the most?",
 * "sales by week in March". The question wants one figure per month or week,
 * which no other block supplies. Null unless it unmistakably groups by
 * month or week — "this month" or "last week" alone name a period, not a grouping.
 */
export function breakdownIntent(message: string, namedMonthCount = 0): BreakdownIntent | null {
  const ranksMonths = RANK_CUE.test(message) && /\bmonths\b/i.test(message);
  // "January, February and March" is a month-by-month question even without the word "monthly".
  const ranksGroup = (word: RegExp) => word.test(message) && (RANK_CUE.test(message) || BY_GROUP.test(message)) && !CHANGE_WORD.test(message);
  const groupBy =
    MONTH_GROUP.test(message) || ranksMonths || namedMonthCount >= 3 ? "month"
    : WEEK_GROUP.test(message) ? "week"
    : ranksGroup(VENDOR_WORD) ? "vendor"
    : ranksGroup(CATEGORY_WORD) ? "category"
    : null;
  if (!groupBy) return null;
  // A planned cost is not a question about past months.
  if (HYPOTHETICAL_CUE.test(message)) return null;
  // "Monthly bills" asks about repeating payments, not a per-month total.
  if (/\bmonthly (?:bills?|payments?|subscriptions?)\b/i.test(message) && !RANK_CUE.test(message)) return null;
  // Sales carry no vendor or category, so those groupings are always expenses.
  const named = groupBy === "vendor" || groupBy === "category";
  const subject = !named && SALES_SUBJECT.test(message) && !EXPENSE_SUBJECT.test(message) ? "sales" : "expense";
  const ascending = ASCENDING.test(message) || (LEAST.test(message) && !MOST_TO_LEAST.test(message));
  const order = ascending ? "asc" : RANK_CUE.test(message) || named ? "desc" : "chronological";
  return { subject, groupBy, order };
}

/**
 * "What about last year?", "and in March?", "e yung sales naman?" — a short
 * follow-up that leans on the previous question for its topic.
 */
export function isFollowUp(message: string): boolean {
  if (message.trim().length > 80) return false;
  return /^\s*(?:(?:and|so|ok(?:ay)?|then)[\s,]+)?(?:what|how)\s+about\b|^\s*(?:and|or)\s+(?:for|in|during|last|this|the|my)\b|^\s*(?:e|eh|at|paano|kumusta)?\s*(?:yung|noong|nung)?\b.*\bnaman\b|^\s*same\s+(?:for|in)\b/i.test(message);
}

/**
 * A question that may need a lookup the fixed context blocks do not cover:
 * a grouping, ranking, filter or comparison. Small talk and "explain this flag"
 * do not match, so they never spend a planning call.
 */
export const LOOKUP_CUE =
  /\b(?:rank\w*|sort\w*|order\w*|list|breakdown|break down|group\w*|each|every|per|by|compare\w*|versus|vs|trend\w*|average|avg|most|least|highest|lowest|biggest|smallest|largest|top|bottom|which|how many|count|between|over|under|more than|less than|above|below|from|vendor\w*|supplier\w*|categor\w*|pinaka\w*|ilan|alin)\b/i;

/** "What are my regular bills?", "anything that repeats every month?" */
export const RECURRING_CUE =
  /\b(?:recurring|repeat\w*|regular|subscriptions?|bills?|monthly payments?|every (?:week|month)|due|bayarin|buwan-buwan|linggo-linggo)\b/i;
