import { describe, it, expect, vi } from "vitest";
import { computeTaxedLines } from "./taxCalc";

/** A minimal stand-in for the Prisma client/transaction client — just
 *  enough surface (taxCode.findMany) for computeTaxedLines to call. */
function fakeDb(taxCodes: { id: string; rate: number }[]) {
  return {
    taxCode: {
      findMany: vi.fn(async ({ where }: { where: { companyId: string; id: { in: string[] } } }) =>
        taxCodes.filter((t) => where.id.in.includes(t.id)).map((t) => ({ ...t, companyId: where.companyId })),
      ),
    },
  } as unknown as Parameters<typeof computeTaxedLines>[0];
}

describe("computeTaxedLines", () => {
  it("computes a single untaxed line", async () => {
    const db = fakeDb([]);
    const result = await computeTaxedLines(db, "co1", [{ quantity: 2, unitPrice: 50 }]);
    expect(result.lines[0]!.lineTotal.toFixed(2)).toBe("100.00");
    expect(result.lines[0]!.lineTax.toFixed(2)).toBe("0.00");
    expect(result.subtotal.toFixed(2)).toBe("100.00");
    expect(result.taxTotal.toFixed(2)).toBe("0.00");
    expect(result.total.toFixed(2)).toBe("100.00");
  });

  it("applies a tax code's rate to the line total", async () => {
    const db = fakeDb([{ id: "vat5", rate: 0.05 }]);
    const result = await computeTaxedLines(db, "co1", [{ quantity: 1, unitPrice: 200, taxCodeId: "vat5" }]);
    expect(result.lines[0]!.lineTotal.toFixed(2)).toBe("200.00");
    expect(result.lines[0]!.lineTax.toFixed(2)).toBe("10.00");
    expect(result.subtotal.toFixed(2)).toBe("200.00");
    expect(result.taxTotal.toFixed(2)).toBe("10.00");
    expect(result.total.toFixed(2)).toBe("210.00");
  });

  it("sums multiple lines with mixed tax codes and no tax", async () => {
    const db = fakeDb([{ id: "vat5", rate: 0.05 }]);
    const result = await computeTaxedLines(db, "co1", [
      { quantity: 2, unitPrice: 100, taxCodeId: "vat5" }, // 200 + 10
      { quantity: 1, unitPrice: 50 }, // 50, no tax
    ]);
    expect(result.subtotal.toFixed(2)).toBe("250.00");
    expect(result.taxTotal.toFixed(2)).toBe("10.00");
    expect(result.total.toFixed(2)).toBe("260.00");
  });

  it("treats an unknown/cross-tenant taxCodeId as no tax rather than throwing", async () => {
    // computeTaxedLines is always called with companyId already scoped by
    // the caller, so a taxCodeId that doesn't resolve within that company
    // (deleted, or belonging to a different tenant) must never leak
    // another company's rate — falling back to "no tax" is the safe
    // default here, same behavior as the pre-refactor inline code.
    const db = fakeDb([{ id: "other-companys-code", rate: 0.2 }]);
    const result = await computeTaxedLines(db, "co1", [{ quantity: 1, unitPrice: 100, taxCodeId: "does-not-exist" }]);
    expect(result.lines[0]!.lineTax.toFixed(2)).toBe("0.00");
    expect(result.total.toFixed(2)).toBe("100.00");
  });

  it("rounds each line before summing, matching the pre-refactor per-line rounding behavior", async () => {
    const db = fakeDb([{ id: "vat5", rate: 0.05 }]);
    // 33.333... * 3 = 99.999..., but quantity*unitPrice is computed per
    // line and rounded to 2dp before tax is applied and before summing.
    const result = await computeTaxedLines(db, "co1", [{ quantity: 3, unitPrice: 33.333333, taxCodeId: "vat5" }]);
    expect(result.lines[0]!.lineTotal.toFixed(2)).toBe("100.00");
    expect(result.lines[0]!.lineTax.toFixed(2)).toBe("5.00");
  });

  it("returns zeroed totals for an empty line list", async () => {
    const db = fakeDb([]);
    const result = await computeTaxedLines(db, "co1", []);
    expect(result.lines).toEqual([]);
    expect(result.subtotal.toFixed(2)).toBe("0.00");
    expect(result.taxTotal.toFixed(2)).toBe("0.00");
    expect(result.total.toFixed(2)).toBe("0.00");
  });

  it("skips the taxCode lookup entirely when no line references one", async () => {
    const db = fakeDb([]);
    await computeTaxedLines(db, "co1", [{ quantity: 1, unitPrice: 10 }]);
    expect((db.taxCode.findMany as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});
