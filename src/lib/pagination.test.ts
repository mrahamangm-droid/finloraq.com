import { describe, expect, it } from "vitest";
import { pageHref, pageWindow, parsePage, totalPages, PAGE_SIZE } from "@/lib/pagination";

describe("pagination", () => {
  it("parses ?page safely", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("3")).toBe(3);
    expect(parsePage(["4", "9"])).toBe(4);
    for (const bad of ["0", "-2", "abc", ""]) expect(parsePage(bad), bad).toBe(1);
    expect(parsePage("99999999999")).toBe(1_000_000);
  });

  it("computes skip/take and page counts", () => {
    expect(pageWindow(1)).toEqual({ skip: 0, take: PAGE_SIZE });
    expect(pageWindow(3)).toEqual({ skip: 2 * PAGE_SIZE, take: PAGE_SIZE });
    expect(totalPages(0)).toBe(1);
    expect(totalPages(PAGE_SIZE)).toBe(1);
    expect(totalPages(PAGE_SIZE + 1)).toBe(2);
  });

  it("keeps filters in page links and drops empty ones", () => {
    expect(pageHref("/sales", { period: "2026-Q3", customerId: "c1", page: "7", empty: "" }, 2)).toBe("/sales?period=2026-Q3&customerId=c1&page=2");
    expect(pageHref("/sales", { period: "2026-Q3" }, 1)).toBe("/sales?period=2026-Q3");
    expect(pageHref("/sales", {}, 1)).toBe("/sales");
  });
});
