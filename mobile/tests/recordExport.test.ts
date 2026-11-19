import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase", () => ({
  API_BASE_URL: "http://localhost:4000/api/v1",
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) } },
}));

/** The expo-file-system surface the helper touches; native writes land in `written`. */
const written = new Map<string, string>();
vi.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///cache/" } },
  File: class {
    uri: string;
    constructor(dir: { uri: string }, name: string) { this.uri = `${dir.uri}${name}`; }
    create() { written.set(this.uri, ""); }
    async write(content: string) { written.set(this.uri, content); }
  },
}));

const sharing = { isAvailableAsync: vi.fn(async () => true), shareAsync: vi.fn(async () => undefined) };
vi.mock("expo-sharing", () => sharing);

const { exportRecordsCsv } = await import("../src/lib/recordExport");

describe("exportRecordsCsv", () => {
  const originalFetch = globalThis.fetch;
  let urls: string[];

  function serve(status: number, body: string) {
    urls = [];
    globalThis.fetch = vi.fn(async (url: unknown) => {
      urls.push(String(url));
      return new Response(body, { status });
    }) as typeof fetch;
  }

  beforeEach(() => {
    written.clear();
    sharing.isAvailableAsync.mockClear();
    sharing.shareAsync.mockClear();
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("writes the server's CSV with a BOM and opens the share sheet", async () => {
    serve(200, "Date,Type\r\n2026-03-01,Sales\r\n");
    await exportRecordsCsv({ businessProfileId: 4, type: "sales", dateFrom: "2026-03-01", dateTo: "2026-03-31", limit: undefined });

    const url = new URL(urls[0]!);
    expect(url.pathname).toBe("/api/v1/records/export");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      businessProfileId: "4", type: "sales", dateFrom: "2026-03-01", dateTo: "2026-03-31",
    });
    const uri = "file:///cache/finsight-sales-2026-03-01-to-2026-03-31.csv";
    expect(written.get(uri)).toBe("\uFEFFDate,Type\r\n2026-03-01,Sales\r\n");
    expect(sharing.shareAsync).toHaveBeenCalledWith(uri, expect.objectContaining({ mimeType: "text/csv" }));
  });

  it("surfaces the server's refusal and shares nothing", async () => {
    serve(400, JSON.stringify({ error: "Choose a shorter date range and export again." }));
    await expect(exportRecordsCsv({ businessProfileId: 4 })).rejects.toThrow("Choose a shorter date range");
    expect(written.size).toBe(0);
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });

  it("says so when the device cannot share", async () => {
    serve(200, "Date\r\n");
    sharing.isAvailableAsync.mockResolvedValueOnce(false);
    await expect(exportRecordsCsv({ businessProfileId: 4 })).rejects.toThrow("Sharing isn't available");
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });
});
