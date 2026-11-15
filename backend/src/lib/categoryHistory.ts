import { prisma } from "../config/prisma";

export interface ConfirmedCategoryChoice {
  description: string;
  vendor: string | null;
  categoryId: number;
  categoryName: string;
}

const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const isUncategorised = (name: string) => /^uncategori[sz]ed$/i.test(name.trim());

/** Call only after authenticating ownership of the active business profile. */
export async function loadConfirmedCategoryHistory(businessProfileId: number): Promise<ConfirmedCategoryChoice[]> {
  const records = await prisma.expenseRecord.findMany({
    where: {
      businessProfileId,
      category: { businessProfileId },
      OR: [{ receiptScanId: null }, { receiptScan: { confirmationStatus: "Confirmed" } }],
    },
    select: { description: true, vendor: true, categoryId: true, category: { select: { name: true } } },
    orderBy: { id: "desc" },
    take: 200,
  });
  return records.filter((record) => !isUncategorised(record.category.name)).map((record) => ({
    description: record.description,
    vendor: record.vendor,
    categoryId: record.categoryId,
    categoryName: record.category.name,
  }));
}

/** Exact wording, preserving quantities and product digits; no fuzzy guesses. */
export function categoryFromHistory(history: ConfirmedCategoryChoice[], description: string, vendor?: string | null) {
  const descriptionKey = normalise(description);
  if (!descriptionKey) return null;
  const matches = history.filter((choice) => normalise(choice.description) === descriptionKey);
  const vendorKey = vendor ? normalise(vendor) : null;
  const match = (vendorKey ? matches.find((choice) => choice.vendor && normalise(choice.vendor) === vendorKey) : null)
    ?? matches[0];
  return match ? { categoryId: match.categoryId, categoryName: match.categoryName, source: "history" as const } : null;
}

/** The name without its sizes and pack counts: "SAFEGUARD BAR WHITE 60G" and "... 135G" share one. */
const withoutSizes = (value: string) =>
  value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word && !/\d/.test(word)).join(" ");

/**
 * The category the owner has filed this product under in other sizes. Only
 * when at least two confirmed rows share the name and every one of them agrees;
 * a guess from one row, or from rows that disagree, is not offered.
 */
export function categoryFromSimilarHistory(history: ConfirmedCategoryChoice[], description: string) {
  const key = withoutSizes(description);
  if (key.length < 4) return null;
  const matches = history.filter((choice) => withoutSizes(choice.description) === key);
  const [first] = matches;
  if (!first || matches.length < 2 || matches.some((choice) => choice.categoryId !== first.categoryId)) return null;
  return { categoryId: first.categoryId, categoryName: first.categoryName, source: "history" as const };
}
