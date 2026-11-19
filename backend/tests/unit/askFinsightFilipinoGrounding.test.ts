import { describe, expect, it } from "vitest";
import { groundAnswer, tagFinancialFacts } from "../../src/services/aiAnswer.service";
import type { AskInput, AskResult } from "../../src/services/ai.service";

/**
 * The answer check binds each figure to the words around it. Those words were
 * matched against the context's English only, so a correct Taglish sentence
 * ("ang kailangan mo pang benta ... PHP 72,500.00") was trimmed for naming
 * no subject the check could read. Seen in the live eval, 2026-11-19.
 */

const CONTEXT = tagFinancialFacts([
  "Recovery target this month: PHP 100,000.00",
  "Sales still needed this month: PHP 72,500.00",
  "Sales this pace would add by month end: PHP 60,000.00",
  "Supplies this month: PHP 500.00",
  "Rent this month: PHP 9,000.00",
]).join("\n");

async function check(draft: string) {
  const drafts: string[] = [];
  const ask = async (input: AskInput): Promise<AskResult> => {
    drafts.push(input.revisionNote ?? "first");
    return { answer: `${draft}\nFOLLOW-UPS: Magkano ang benta ko? | Ano ang goal ko?`, provider: "gemini" };
  };
  const result = await groundAnswer(ask, { context: CONTEXT, question: "aabot ba ako sa goal?", references: new Map() });
  return result.metadata.amountCheck;
}

describe("Filipino and Taglish claims", () => {
  it("keeps a correctly cited Taglish sentence", async () => {
    expect(
      await check(
        "Hindi pa aabot sa iyong recovery target dahil ang kailangan mo pang benta ngayon ay PHP 72,500.00 [fact:f2], " +
          "habang ang kikitain mo sa takbong ito ay PHP 60,000.00 [fact:f3].",
      ),
    ).toBe("passed");
  });

  it("keeps a Filipino sentence about one category", async () => {
    expect(await check("Ang gastos mo sa upa ngayong buwan ay PHP 9,000.00 [fact:f5].")).toBe("passed");
  });

  it("still catches a figure given to the wrong subject in Filipino", async () => {
    // "Your rent this month is PHP 500" when 500 is the supplies figure.
    expect(await check("Ang upa mo ngayong buwan ay PHP 500.00 [fact:f4].")).toBe("trimmed");
  });
});
