import { z } from "zod";

/**
 * The lookups Ask FinSight's model may request before it answers.
 *
 * The model never sees the database and never computes a figure. It names a
 * lookup and its arguments; the server validates them here, runs them for the
 * session's own business profile (aiContext.service), and adds the results to
 * CONTEXT, where the answer check verifies every figure as usual. Arguments are
 * model output, so they are treated like any other untrusted input: unknown
 * tools, extra fields and out-of-range values are dropped, never trusted.
 */

export const MAX_TOOL_CALLS = 3;

const period = z.string().trim().min(2).max(60);
const order = z.enum(["asc", "desc", "chronological"]).default("desc");

export const TOOL_SCHEMAS = {
  expense_totals: z.object({
    period,
    group_by: z.enum(["month", "week", "category", "vendor"]),
    order,
  }).strict(),
  sales_totals: z.object({
    period,
    group_by: z.enum(["month", "week"]),
    order,
  }).strict(),
  find_records: z.object({
    record_type: z.enum(["expense", "sales"]).default("expense"),
    period,
    text: z.string().trim().min(2).max(60).optional(),
    category: z.string().trim().min(2).max(60).optional(),
    vendor: z.string().trim().min(2).max(60).optional(),
    min_amount: z.number().nonnegative().max(1e9).optional(),
    max_amount: z.number().nonnegative().max(1e9).optional(),
    sort: z.enum(["newest", "largest", "smallest"]).default("newest"),
  }).strict(),
  compare_periods: z.object({ first: period, second: period }).strict(),
  recovery_status: z.object({}).strict(),
  open_findings: z.object({}).strict(),
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;
export type ToolCall = { [K in ToolName]: { name: K; args: z.infer<(typeof TOOL_SCHEMAS)[K]> } }[ToolName];

const PERIOD_HELP =
  'Plain words FinSight understands: "this year", "last year", "2025", "this month", "last month", "March 2026", ' +
  '"January to March 2026", "Q2 2026", "last 30 days", "this week", "all time".';

/** Gemini functionDeclarations: OpenAPI-style parameter schemas. */
export const TOOL_DECLARATIONS = [
  {
    name: "expense_totals",
    description: "Counted expense totals for a period, grouped by month, week, category or vendor, and ranked.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", description: PERIOD_HELP },
        group_by: { type: "string", enum: ["month", "week", "category", "vendor"] },
        order: { type: "string", enum: ["asc", "desc", "chronological"], description: "asc = least to greatest." },
      },
      required: ["period", "group_by"],
    },
  },
  {
    name: "sales_totals",
    description: "Recorded sales totals for a period, grouped by month or week.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", description: PERIOD_HELP },
        group_by: { type: "string", enum: ["month", "week"] },
        order: { type: "string", enum: ["asc", "desc", "chronological"] },
      },
      required: ["period", "group_by"],
    },
  },
  {
    name: "find_records",
    description: "Individual expense or sales records matching a word, category, vendor or amount range, with their total.",
    parameters: {
      type: "object",
      properties: {
        record_type: { type: "string", enum: ["expense", "sales"] },
        period: { type: "string", description: PERIOD_HELP },
        text: { type: "string", description: "A word in the record's description, e.g. rice." },
        category: { type: "string", description: "One of the owner's category names." },
        vendor: { type: "string" },
        min_amount: { type: "number" },
        max_amount: { type: "number" },
        sort: { type: "string", enum: ["newest", "largest", "smallest"] },
      },
      required: ["period"],
    },
  },
  {
    name: "compare_periods",
    description: "Total expenses and sales for two periods side by side, with the difference.",
    parameters: {
      type: "object",
      properties: {
        first: { type: "string", description: PERIOD_HELP },
        second: { type: "string", description: PERIOD_HELP },
      },
      required: ["first", "second"],
    },
  },
  {
    name: "recovery_status",
    description: "This month's Recovery target: costs paid by sales so far, daily goal and open days left.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "open_findings",
    description: "Records waiting in Needs review: unusual amounts and possible duplicates.",
    parameters: { type: "object", properties: {} },
  },
] as const;

export const PLANNER_PROMPT = `You choose which FinSight lookups the owner's question needs. You do not answer the question.
FinSight already supplies, for the period the question names (or the last 30 days): total expenses and sales, the top categories with their change, the top vendors, records whose description matches a word in the question, and the owner's alerts.
Call a lookup only when that default data cannot answer the question, for example a ranking by month, week, category or vendor, records filtered by category, vendor or amount, or two periods side by side.
Call at most ${MAX_TOOL_CALLS} lookups. If the default data is enough, or the question is small talk, call none and reply with the single word NONE.
Copy the owner's own period words into "period" (translate Filipino month names to English). Never invent category or vendor names that the question does not mention.`;

/** Gemini's reply, as far as this reader needs it. */
interface GeminiPlannerReply {
  candidates?: { content?: { parts?: { functionCall?: { name?: unknown; args?: unknown } }[] } }[];
}

/**
 * The valid tool calls in a planner reply, at most MAX_TOOL_CALLS, duplicates
 * dropped. Anything malformed is skipped rather than failing the answer: the
 * fixed context blocks still answer without it.
 */
export function parseToolCalls(reply: unknown): ToolCall[] {
  const parts = (reply as GeminiPlannerReply)?.candidates?.[0]?.content?.parts ?? [];
  const calls: ToolCall[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const call = part?.functionCall;
    if (!call || typeof call.name !== "string" || !(call.name in TOOL_SCHEMAS)) continue;
    const name = call.name as ToolName;
    const parsed = TOOL_SCHEMAS[name].safeParse(call.args ?? {});
    if (!parsed.success) continue;
    const fingerprint = `${name}:${JSON.stringify(parsed.data)}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    calls.push({ name, args: parsed.data } as ToolCall);
    if (calls.length >= MAX_TOOL_CALLS) break;
  }
  return calls;
}
