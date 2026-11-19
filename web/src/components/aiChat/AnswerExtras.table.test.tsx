// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ToastProvider } from "../Toast";
import { AnswerExtras } from "./AnswerExtras";
import { basisSentence, recordsFilterHref } from "../../lib/chatLinks";
import type { ChatAnswerMetadata } from "../../lib/types";

/**
 * What the server's ranked list looks like under a reply: every row in the
 * server's order with its own figure, a total, where the figures came from,
 * and a button that opens Records filtered to the top row.
 */

vi.mock("../../context/BusinessProfileContext", () => ({
  useBusinessProfiles: () => ({ selected: { id: 7, name: "Kusina" } }),
}));
vi.mock("../../lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

const METADATA: ChatAnswerMetadata = {
  references: [],
  pages: [],
  actions: [
    { kind: "open-records", recordType: "expense", dateFrom: "2025-03-01", dateTo: "2025-03-31", label: "Open March 2025 expenses" },
  ],
  followUps: [],
  period: "2025",
  amountCheck: "passed",
  table: {
    title: "Expenses by month, 2025 (lowest to highest)",
    valueLabel: "Expenses",
    rows: [
      { label: "March 2025", amount: 300, count: 1 },
      { label: "January 2025", amount: 1000, count: 2 },
      { label: "June 2025", amount: 2500, count: 1 },
    ],
    total: 3800,
  },
  basis: { expenseRecords: 4, salesRecords: 1, from: "2025-01-01", to: "2025-12-31" },
};

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderExtras(metadata: ChatAnswerMetadata) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AnswerExtras metadata={metadata} content="March was lowest." latest feedback={null} onRate={() => {}} onNavigate={() => {}} />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("AnswerExtras table", () => {
  it("draws the server's rows in order, with a total and where the figures came from", () => {
    renderExtras(METADATA);
    const figure = screen.getByRole("figure", { name: "Expenses by month, 2025 (lowest to highest)" });
    const rows = within(figure).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("March 2025"),
      expect.stringContaining("January 2025"),
      expect.stringContaining("June 2025"),
    ]);
    expect(rows[1]).toHaveTextContent("1,000.00");
    expect(within(figure).getByText("Total").parentElement).toHaveTextContent("3,800.00");
    expect(screen.getByText("Figures from 4 expense records and 1 sales record, 2025-01-01 to 2025-12-31.")).toBeInTheDocument();
    // The basis line replaces the vaguer "Based on your records for 2025."
    expect(screen.queryByText("Based on your records for 2025.")).not.toBeInTheDocument();
  });

  it("opens Records filtered to the row the button names", async () => {
    renderExtras(METADATA);
    await userEvent.click(screen.getByRole("button", { name: "Open March 2025 expenses" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/records?type=expense&dateFrom=2025-03-01&dateTo=2025-03-31");
  });

  it("shows nothing new for an answer without a table or basis", () => {
    const { table: _table, basis: _basis, ...plain } = METADATA;
    renderExtras({ ...plain, actions: [] });
    expect(screen.queryByRole("figure")).not.toBeInTheDocument();
    expect(screen.getByText("Based on your records for 2025.")).toBeInTheDocument();
  });
});

describe("helpers", () => {
  it("groups large counts with commas", () => {
    expect(basisSentence({ expenseRecords: 7195, salesRecords: 57205, from: null, to: "2026-11-19" })).toBe(
      "Figures from 7,195 expense records and 57,205 sales records, all records up to 2026-11-19.",
    );
  });

  it("words the basis for all time and for an empty period", () => {
    expect(basisSentence({ expenseRecords: 1, salesRecords: 0, from: null, to: "2026-11-19" })).toBe(
      "Figures from 1 expense record, all records up to 2026-11-19.",
    );
    expect(basisSentence({ expenseRecords: 0, salesRecords: 0, from: "2026-11-01", to: "2026-11-19" })).toBe(
      "No counted records from 2026-11-01 to 2026-11-19.",
    );
  });

  it("adds the category and keyword filters", () => {
    expect(
      recordsFilterHref({
        kind: "open-records", recordType: "expense", dateFrom: "2025-01-01", dateTo: "2025-12-31", categoryId: 4, keyword: "rice", label: "x",
      }),
    ).toBe("/records?type=expense&dateFrom=2025-01-01&dateTo=2025-12-31&categoryId=4&keyword=rice");
  });
});
