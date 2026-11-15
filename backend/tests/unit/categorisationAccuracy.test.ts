import { describe, expect, it } from "vitest";
import { categoryFromSimilarHistory } from "../../src/lib/categoryHistory";
import { categoriseReceiptLines, productClassOf, vendorTypeOf } from "../../src/lib/itemCategoriser";
import { HELD_OUT, TUNING, type LabelledItem } from "../helpers/categorisationLabels";

function score(items: LabelledItem[]) {
  const wrong: string[] = [];
  let unclassified = 0;
  for (const [name, expected] of items) {
    const got = productClassOf(name);
    if (got === null) {
      if (expected !== null) unclassified += 1;
    } else if (got !== expected) {
      wrong.push(`${name}: ${got}, expected ${expected}`);
    }
  }
  return { total: items.length, unclassified, wrong };
}

/**
 * Ceilings, lowered whenever a change improves on them. Before the vocabulary
 * and OCR-tolerance work the same sets scored 56 unclassified and 2 wrong
 * (tuning), 30 unclassified and 5 wrong (held-out).
 */
const CEILING = {
  tuning: { unclassified: 0, wrong: 0 },
  heldOut: { unclassified: 18, wrong: 3 },
};

describe("item classification on the labelled sets", () => {
  it.each([
    ["tuning", TUNING, CEILING.tuning],
    ["held-out", HELD_OUT, CEILING.heldOut],
  ] as const)("%s: no more unclassified or wrongly classified lines than recorded", (label, items, ceiling) => {
    const result = score(items);
    console.log(`${label}: ${result.total} lines, ${result.unclassified} unclassified, ${result.wrong.length} wrong`);
    for (const line of result.wrong) console.log(`  wrong: ${line}`);
    expect(result.wrong.length).toBeLessThanOrEqual(ceiling.wrong);
    expect(result.unclassified).toBeLessThanOrEqual(ceiling.unclassified);
  });
});

describe("forgiving an OCR slip", () => {
  it("reads through a swapped glyph, and asks the owner to check", () => {
    const [decision] = categoriseReceiptLines([{ name: "B0ND PAPER A4", quantity: 1 }], { businessType: "Services", vendor: null });
    expect(decision).toMatchObject({ key: "office_supplies", confidence: "low" });
    expect(decision!.reason).toMatch(/misprinted/);
  });

  it.each(["SERVICE CHARGES", "MARKET FEE", "POSTAL ID", "GROWER PELLETS X"])("does not stretch %s to a neighbouring word", (name) => {
    expect(productClassOf(name)).not.toBe("electronics");
    expect(productClassOf(name)).not.toBe("office_supply");
    expect(productClassOf(name)).not.toBe("advertising");
    expect(productClassOf(name)).not.toBe("snack_drink");
  });

  it("leaves sizes alone", () => {
    expect(productClassOf("X 155G 50S")).toBeNull();
  });
});

describe("shops named by their operating company", () => {
  it.each([
    ["WENPHIL CORPORATION", "restaurant"],
    ["GOLDEN ARCHES DEVELOPMENT CORPORATION", "restaurant"],
    ["DUNKIN' DONUTS", "restaurant"],
    ["southstardrug", "pharmacy"],
    ["THE MARKETPLACE", "supermarket"],
    ["ABC TRADING", null],
  ])("reads %s as %s", (vendor, type) => {
    expect(vendorTypeOf(vendor)).toBe(type);
  });
});

describe("the same product in another size", () => {
  const choice = (description: string, categoryId: number) => ({ description, vendor: null, categoryId, categoryName: `C${categoryId}` });

  it("follows two confirmed rows that agree", () => {
    const history = [choice("SAFEGUARD BAR WHITE 60G", 7), choice("SAFEGUARD BAR WHITE 135G", 7)];
    expect(categoryFromSimilarHistory(history, "SAFEGUARD BAR WHITE 175G")?.categoryId).toBe(7);
  });

  it("offers nothing from one row, or from rows that disagree", () => {
    expect(categoryFromSimilarHistory([choice("SAFEGUARD BAR WHITE 60G", 7)], "SAFEGUARD BAR WHITE 175G")).toBeNull();
    const split = [choice("RICE 25KG", 7), choice("RICE 5KG", 8)];
    expect(categoryFromSimilarHistory(split, "RICE 10KG")).toBeNull();
  });

  it("offers nothing when only sizes are left to compare", () => {
    expect(categoryFromSimilarHistory([choice("25KG", 7), choice("5KG", 7)], "10KG")).toBeNull();
  });
});
