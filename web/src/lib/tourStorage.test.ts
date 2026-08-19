// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readTour, writeTour } from "./tourStorage";

describe("tourStorage", () => {
  beforeEach(() => window.localStorage.clear());

  it("reads not_started when nothing is stored", () => {
    expect(readTour(7)).toEqual({ status: "not_started" });
  });

  it("round-trips status and step", () => {
    writeTour(7, { status: "in_progress", step: 4 });
    expect(readTour(7)).toEqual({ status: "in_progress", step: 4 });
  });

  it("keys by user id, so accounts on a shared machine don't collide", () => {
    writeTour(1, { status: "completed" });
    writeTour(2, { status: "skipped" });
    expect(readTour(1).status).toBe("completed");
    expect(readTour(2).status).toBe("skipped");
    expect(readTour(3).status).toBe("not_started");
  });

  it("treats corrupt or foreign data as not_started rather than throwing", () => {
    window.localStorage.setItem("finsight.tour.7", "{not json");
    expect(readTour(7)).toEqual({ status: "not_started" });

    window.localStorage.setItem("finsight.tour.7", JSON.stringify({ status: "yes please" }));
    expect(readTour(7)).toEqual({ status: "not_started" });

    window.localStorage.setItem("finsight.tour.7", JSON.stringify({ status: "completed", step: -2 }));
    expect(readTour(7)).toEqual({ status: "completed", step: undefined });
  });
});
