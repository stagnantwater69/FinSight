import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { ApiError } from "../middleware/error.middleware";
import { buildModuleContext, type InteractionModule } from "./aiContext.service";
import type { ExtractedScenario } from "../lib/scenario";
import type { AIInteraction } from "@prisma/client";

// Keep the model names as named constants — Google and OpenRouter rename
// or deprecate models often. If a call starts failing with a 404/"model
// not found", check https://ai.google.dev/gemini-api/docs/models (Gemini)
// or https://openrouter.ai/models (OpenRouter) before assuming the
// integration itself broke.
// gemini-2.5-flash-lite is no longer available to new users as of this
// build (confirmed live against the API, not from docs) — 3.5 is the
// current flash-lite tier.
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Deliberately a different vendor (Anthropic, via OpenRouter) than the
// primary Gemini path, so a Google-side outage doesn't take down the
// fallback too. Reasoning-family models (e.g. openai/gpt-5-mini) were
// tried first and rejected: they silently spend the token budget on
// hidden reasoning tokens and can return empty content under a modest
// max_tokens — confirmed live, not a hypothetical. claude-haiku-4.5 has
// no such hidden-token behavior by default.
const OPENROUTER_MODEL = "anthropic/claude-haiku-4.5";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// The grounding rule stays first and unconditional. An open-ended chat
// gives the model far more room to drift into invented figures than the
// old single-shot "Explain this" did, so this is the one instruction that
// must not be diluted by anything below it.
const SYSTEM_PROMPT = `You are FinSight, an AI assistant built into a financial monitoring app for small business owners with no accounting background.

RULE 1, ABOVE ALL ELSE: Only use numbers that appear in the CONTEXT block. Never invent, estimate, extrapolate, or guess a number that isn't given to you. If you catch yourself about to produce a figure that isn't in CONTEXT, say you don't have that information instead. This holds no matter how conversational the exchange becomes.

Other rules:
- If CONTEXT doesn't contain enough information to answer, say so plainly instead of guessing. "Your records don't show that yet" is a good answer.
- Answer in plain, everyday language — avoid accounting jargon (say "money left after expenses", not "net margin").
- Keep answers short: 2-4 sentences, or up to 4 short bullets when the question genuinely calls for a list.
- When asked how to reduce expenses, ground every suggestion in the owner's actual categories, amounts, and trends from CONTEXT. Name the real category and its real number. Never give generic advice like "cut unnecessary spending" or "negotiate with suppliers" without tying it to a specific figure you were given.
- FinSight's calculations are structured, not invented by you. When CONTEXT contains a pre-computed result, describe those exact figures rather than doing your own arithmetic.
- You monitor and explain; you do not tell the owner what to decide. Don't advise for or against a purchase.
- Earlier turns in this conversation are for continuity only. The CONTEXT block in the newest message is the only current, authoritative data — if an older answer conflicts with it, the new CONTEXT wins.`;

export interface ConversationTurn {
  question: string;
  answer: string;
}

export interface AskInput {
  context: string;
  question: string;
  /** Earlier turns in this drawer conversation, oldest first. */
  priorTurns?: ConversationTurn[];
}

export interface AskResult {
  answer: string;
  provider: "gemini" | "openrouter" | "unavailable";
}

function buildUserContent(input: AskInput): string {
  return `CONTEXT:\n${input.context}\n\nQUESTION:\n${input.question}`;
}

// Prior turns carry the questions and answers only — deliberately NOT the
// CONTEXT blocks they were originally answered against. Those numbers are
// stale by now; replaying them invites the model to answer a follow-up
// from month-old figures. Only the newest message carries data.
async function callGemini(input: AskInput): Promise<string> {
  const contents = [
    ...(input.priorTurns ?? []).flatMap((turn) => [
      { role: "user", parts: [{ text: turn.question }] },
      { role: "model", parts: [{ text: turn.answer }] },
    ]),
    { role: "user", parts: [{ text: buildUserContent(input) }] },
  ];

  const res = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Native REST endpoint + x-goog-api-key header — required for the
      // newer "AQ." key format, which OpenAI-compatible wrappers/shims
      // that expect the old "AIza..." format are known to reject.
      "x-goog-api-key": env.GOOGLE_GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini responded ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned no text content");
  }
  return text.trim();
}

async function callOpenRouter(input: AskInput): Promise<string> {
  const res = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...(input.priorTurns ?? []).flatMap((turn) => [
          { role: "user", content: turn.question },
          { role: "assistant", content: turn.answer },
        ]),
        { role: "user", content: buildUserContent(input) },
      ],
      temperature: 0.3,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter responded ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenRouter returned no text content");
  }
  return text.trim();
}

// DEVIATION, flagged: the data dictionary's Interaction_Module described
// three values (the three Insights screens). Module 6 puts an Ask FinSight
// drawer on the Dashboard too, which needs a fourth value to scope and
// thread those conversations separately. The column is VARCHAR(50) and not
// a DB enum, so no migration was needed — but the dictionary should be
// updated to match.
export { INTERACTION_MODULES, type InteractionModule } from "./aiContext.service";

// Interaction_AIResponse is VARCHAR(1000) NOT NULL — defensive truncation
// in case a model response runs long, since we can't reject our own
// output the way we'd reject oversized user input.
const MAX_ANSWER_LENGTH = 1000;

// How many earlier turns of this module's conversation get replayed. Enough
// for "why is that one so high?" to resolve, small enough to keep the token
// cost and the risk of the model anchoring on stale phrasing down.
const HISTORY_TURNS_FOR_CONTEXT = 6;

// Cut at a sentence boundary when truncating, so a clipped answer reads as
// finished rather than as if the connection dropped mid-word.
function truncateAnswer(answer: string): string {
  if (answer.length <= MAX_ANSWER_LENGTH) return answer;
  const clipped = answer.slice(0, MAX_ANSWER_LENGTH);
  const lastBreak = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("\n"));
  return lastBreak > MAX_ANSWER_LENGTH * 0.6 ? clipped.slice(0, lastBreak + 1) : clipped;
}

function toInteractionDTO(interaction: AIInteraction) {
  return {
    id: interaction.id,
    module: interaction.module,
    question: interaction.question,
    answer: interaction.aiResponse,
    timestamp: interaction.timestamp,
  };
}

// Recent turns for one business profile + module, oldest first — this is
// both the drawer's message history and the source of the prior turns fed
// back to the model.
export async function getHistory(userId: number, businessProfileId: number, module?: InteractionModule, limit = 30) {
  const profile = await prisma.businessProfile.findFirst({ where: { id: businessProfileId, userId } });
  if (!profile) {
    throw new ApiError(404, "Business profile not found");
  }

  const interactions = await prisma.aIInteraction.findMany({
    where: { userId, businessProfileId, module },
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  return interactions.reverse().map(toInteractionDTO);
}

export async function askAndRecord(
  userId: number,
  businessProfileId: number,
  module: InteractionModule,
  question: string,
  contextOverride?: string
) {
  const profile = await prisma.businessProfile.findFirst({
    where: { id: businessProfileId, userId },
  });
  if (!profile) {
    throw new ApiError(404, "Business profile not found");
  }

  // Two callers, one AI path.
  //
  // "Explain this" on an Insights screen passes contextOverride — the exact
  // numbers already rendered on screen — and is a deliberate one-shot: no
  // conversation thread, so no prior turns.
  //
  // The Ask FinSight drawer passes no context. The context is built here,
  // server-side, from data queried at this moment. That's what makes a
  // follow-up see an expense the owner recorded 20 seconds ago.
  let context: string;
  let priorTurns: ConversationTurn[] = [];
  let scenario: ExtractedScenario | undefined;

  if (contextOverride) {
    context = contextOverride;
  } else {
    const [built, recent] = await Promise.all([
      buildModuleContext(userId, profile, module, question),
      getHistory(userId, businessProfileId, module, HISTORY_TURNS_FOR_CONTEXT),
    ]);
    context = built.context;
    scenario = built.scenario;
    priorTurns = recent.map((turn) => ({ question: turn.question, answer: turn.answer }));
  }

  const { answer, provider } = await askFinSight({ context, question, priorTurns });

  const interaction = await prisma.aIInteraction.create({
    data: {
      userId,
      businessProfileId,
      module,
      question,
      aiResponse: truncateAnswer(answer),
    },
  });

  return {
    ...toInteractionDTO(interaction),
    provider,
    // Surfaced so the drawer can show what amount was actually parsed out
    // of a plain-language scenario, rather than the owner having to trust
    // that the number in the prose was the one that got calculated.
    detectedAmount: scenario?.amount ?? null,
  };
}

export async function askFinSight(input: AskInput): Promise<AskResult> {
  try {
    const answer = await callGemini(input);
    return { answer, provider: "gemini" };
  } catch (geminiError) {
    console.error("Gemini call failed, falling back to OpenRouter:", geminiError);
    try {
      const answer = await callOpenRouter(input);
      return { answer, provider: "openrouter" };
    } catch (openRouterError) {
      console.error("OpenRouter fallback also failed:", openRouterError);
      return {
        answer: "FinSight can't reach its AI assistant right now. Please try again in a few minutes.",
        provider: "unavailable",
      };
    }
  }
}
