// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";

const get = vi.fn();
vi.mock("../lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args) } }));
const toast = vi.fn();
vi.mock("./Toast", () => ({ useToast: () => toast }));

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportCsvButton } from "./ExportCsvButton";

const MONTHS = [
  { month: "2026-11", expenses: 10, sales: 3 },
  { month: "2026-10", expenses: 4, sales: 2 },
  { month: "2025-12", expenses: 1, sales: 1 },
];
const csv = (filename: string) => ({
  data: new Blob(["﻿Date\r\n"], { type: "text/csv" }),
  headers: { "content-disposition": `attachment; filename="${filename}"` },
});
const exportCalls = () => get.mock.calls.filter((call) => call[0] === "/records/export");

describe("ExportCsvButton", () => {
  const createObjectURL = vi.fn(() => "blob:export");
  const revokeObjectURL = vi.fn();
  let click: MockInstance<HTMLAnchorElement["click"]>;
  const clickedLink = () => click.mock.contexts[0] as HTMLAnchorElement | undefined;

  beforeEach(() => {
    get.mockReset();
    toast.mockReset();
    localStorage.clear();
    get.mockImplementation((url: string) =>
      url === "/records/export/months" ? Promise.resolve({ data: { months: MONTHS } }) : Promise.resolve(csv("finsight-records.csv")));
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("exports the months ticked, says how many records first, and names the file for its span", async () => {
    render(<ExportCsvButton businessProfileId={3} filteredParams={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: /^Pick months/ }));
    expect(within(dialog).getByRole("button", { name: "Pick at least one month" })).toBeDisabled();

    await userEvent.click(await within(dialog).findByRole("checkbox", { name: /November 2026/ }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /October 2026/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Export 2 months · 19 records" }));

    expect(exportCalls()[0]![1]).toEqual({ params: { businessProfileId: 3, type: "all", months: "2026-10,2026-11" }, responseType: "blob" });
    expect(clickedLink()?.download).toBe("finsight-records-2026-10-to-2026-11.csv");
    expect(toast).toHaveBeenCalledWith("Your file is ready");
  });

  it("ticks a whole year from its year chip, for one kind of record", async () => {
    render(<ExportCsvButton businessProfileId={3} filteredParams={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Sales" }));
    await userEvent.click(within(dialog).getByRole("radio", { name: /^Pick months/ }));
    await userEvent.click(await within(dialog).findByRole("button", { name: "2025" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Whole of 2025" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Export 1 month · 1 record" }));
    expect(exportCalls()[0]![1].params).toEqual({ businessProfileId: 3, type: "sales", months: "2025-12" });
  });

  it("says what each period covers, and repeats the choice beside the button", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T04:00:00Z"));
    render(<ExportCsvButton businessProfileId={3} timeZone="Asia/Manila" filteredParams={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: "This year, Jan – Nov 2026" })).toBeTruthy();
    expect(within(dialog).getByRole("radio", { name: "Last month, Oct 2026" })).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("radio", { name: /^This quarter/ }));
    expect(within(dialog).getByText("All records")).toBeTruthy();
    expect(within(dialog).getByText("All records").parentElement).toHaveTextContent("All records · Oct – Nov 2026");
    vi.useRealTimers();
  });

  it("starts on the page's own filters when any are on, and keeps the server's filename", async () => {
    const filtered = { businessProfileId: 3, type: "expense", dateFrom: "2026-01-01" };
    get.mockImplementation((url: string) =>
      url === "/records/export/months" ? Promise.resolve({ data: { months: MONTHS } }) : Promise.resolve(csv("finsight-expense-2026-01-01.csv")));
    render(<ExportCsvButton businessProfileId={3} filteredParams={filtered} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: /^As filtered/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(dialog).getByRole("button", { name: "Export as filtered" }));
    expect(exportCalls()[0]![1]).toEqual({ params: filtered, responseType: "blob" });
    expect(clickedLink()?.download).toBe("finsight-expense-2026-01-01.csv");
  });

  it("shows the server's message when the export is refused", async () => {
    const body = new Blob([JSON.stringify({ error: "This export has 1,200,000 records." })]);
    get.mockImplementation((url: string) => url === "/records/export/months"
      ? Promise.resolve({ data: { months: MONTHS } })
      : Promise.reject(new AxiosError("Bad Request", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400, statusText: "Bad Request", data: body, headers: {}, config: { headers: new AxiosHeaders() },
      })));
    render(<ExportCsvButton businessProfileId={3} filteredParams={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: /^Everything/ }));
    await userEvent.click(await within(dialog).findByRole("button", { name: "Export 21 records" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn't export. This export has 1,200,000 records.");
    expect(click).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});
