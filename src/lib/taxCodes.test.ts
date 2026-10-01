import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { checkTaxCodeChange, percentToRate, TaxCodeInUseError, TaxCodeValidationError, USAGE_RELATIONS } from "@/lib/taxCodes";
import { rateToPercentString } from "@/lib/taxRate";

const vat5 = { code: "VAT_STD_5", name: "Standard 5%", rate: "0.05", treatment: "STANDARD" as const, isInput: false, isActive: true };

describe("percentToRate", () => {
  it("converts percent to an exact stored fraction", () => {
    expect(percentToRate("5").toString()).toBe("0.05");
    expect(percentToRate(12.75).toString()).toBe("0.1275");
    expect(percentToRate("0").toString()).toBe("0");
    expect(percentToRate("100").toString()).toBe("1");
  });
  it("rejects out-of-range, non-numeric and over-precise rates", () => {
    for (const bad of ["-1", "100.01", "abc", "5%", "", "1e2", "5.125"]) {
      expect(() => percentToRate(bad), bad).toThrow(TaxCodeValidationError);
    }
  });
});

describe("rateToPercentString", () => {
  it("round-trips stored fractions without float error", () => {
    for (const pct of ["0", "5", "12.75", "100", "0.01", "7.5"]) {
      expect(rateToPercentString(percentToRate(pct).toString())).toBe(pct);
    }
    expect(rateToPercentString("0.0500")).toBe("5");
  });
});

describe("checkTaxCodeChange", () => {
  it("allows every field on an unused code and normalizes values", () => {
    const out = checkTaxCodeChange(vat5, false, { code: " vat_std_6 ", ratePercent: "6", treatment: "ZERO_RATED", isInput: true, name: " New " });
    expect(out.code).toBe("VAT_STD_6");
    expect(out.rate?.toString()).toBe("0.06");
    expect(out).toMatchObject({ treatment: "ZERO_RATED", isInput: true, name: "New" });
  });

  it("only returns fields that actually change", () => {
    expect(checkTaxCodeChange(vat5, true, { code: "vat_std_5", ratePercent: "5.00", name: "Standard 5%", isActive: true })).toEqual({});
  });

  it("refuses rate, treatment, direction and code changes once the code is used", () => {
    expect(() => checkTaxCodeChange(vat5, true, { ratePercent: "6" })).toThrow(TaxCodeInUseError);
    expect(() => checkTaxCodeChange(vat5, true, { treatment: "EXEMPT" })).toThrow(TaxCodeInUseError);
    expect(() => checkTaxCodeChange(vat5, true, { isInput: true })).toThrow(TaxCodeInUseError);
    expect(() => checkTaxCodeChange(vat5, true, { code: "OTHER" })).toThrow(TaxCodeInUseError);
  });

  it("still allows renaming and deactivating a used code", () => {
    expect(checkTaxCodeChange(vat5, true, { name: "VAT 5% (old)", isActive: false })).toEqual({ name: "VAT 5% (old)", isActive: false });
  });

  it("rejects an empty name and a malformed code", () => {
    expect(() => checkTaxCodeChange(vat5, false, { name: "  " })).toThrow(TaxCodeValidationError);
    expect(() => checkTaxCodeChange(vat5, false, { code: "has space" })).toThrow(TaxCodeValidationError);
  });
});

describe("USAGE_RELATIONS", () => {
  it("covers every relation that references TaxCode (taxCodeId FKs are ON DELETE SET NULL)", () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "TaxCode")!;
    const backRelations = model.fields
      .filter((f) => f.kind === "object" && f.isList)
      .map((f) => f.name)
      .sort();
    expect(Object.keys(USAGE_RELATIONS).sort()).toEqual(backRelations);
  });
});
