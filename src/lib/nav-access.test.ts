import { describe, it, expect } from "vitest";
import { NAV } from "@/components/nav/nav-items";
import { NAV_MODULE } from "./nav-access";

describe("NAV_MODULE", () => {
  it("maps every sidebar entry, so a new page can't silently skip the permission filter", () => {
    for (const item of NAV) expect(Object.prototype.hasOwnProperty.call(NAV_MODULE, item.href)).toBe(true);
  });
  it("uses the same modules as the pages' server-side checks", () => {
    expect(NAV_MODULE["/sales"]).toBe("invoices");
    expect(NAV_MODULE["/purchases"]).toBe("bills");
    expect(NAV_MODULE["/billing"]).toBeNull();
    expect(NAV_MODULE["/users"]).toBeNull();
  });
});
