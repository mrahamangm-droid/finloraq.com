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

  it("refuses a taxCodeId that isn't this company's instead of storing it", async () => {
    // computeTaxedLines is called with the caller's server-resolved
    // companyId. A taxCodeId that doesn't resolve within that company
    // (another tenant's, or made up) used to be treated as "no tax" and
    // then written onto the line anyway, leaving a line that points at
    // another company's tax code. It's refused now.
    const db = fakeDb([{ id: "other-companys-code", rate: 0.2 }]);
    await expect(
      computeTaxedLines(db, "co1", [{ quantity: 1, unitPrice: 100, taxCodeId: "does-not-exist" }]),
    ).rejects.toThrow("Tax code not found.");
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

  it("refuses a product id that isn't this company's", async () => {
    const db = {
      ...(fakeDb([]) as object),
      product: { count: vi.fn(async ({ where }: { where: { companyId: string; id: { in: string[] } } }) => where.id.in.filter((id) => id === "own-product").length) },
    } as unknown as Parameters<typeof computeTaxedLines>[0];
    await expect(
      computeTaxedLines(db, "co1", [{ quantity: 1, unitPrice: 10, productId: "other-tenant-product" }]),
    ).rejects.toThrow("Product not found.");
    const ok = await computeTaxedLines(db, "co1", [{ quantity: 1, unitPrice: 10, productId: "own-product" }]);
    expect(ok.total.toFixed(2)).toBe("10.00");
  });
});
