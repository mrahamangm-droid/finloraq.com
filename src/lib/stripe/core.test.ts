import { describe, expect, it } from "vitest";
import {
  StripeSignatureError, currencyExponent, encodeParams, fromMinorUnits, mapSubscriptionStatus,
  signStripePayload, toMinorUnits, verifyStripeSignature,
} from "./core";

describe("minor units", () => {
  it("knows currency precision", () => {
    expect(currencyExponent("AED")).toBe(2);
    expect(currencyExponent("jpy")).toBe(0);
    expect(currencyExponent("KWD")).toBe(3);
  });
  it("converts without float drift", () => {
    expect(toMinorUnits("1250.50", "AED")).toBe(125050);
    expect(toMinorUnits("0.29", "usd")).toBe(29);
    expect(toMinorUnits(19.99, "EUR")).toBe(1999);
    expect(toMinorUnits("10.005", "AED")).toBe(1001);
    expect(toMinorUnits("1200", "JPY")).toBe(1200);
    expect(toMinorUnits("12.345", "KWD")).toBe(12350);
    expect(() => toMinorUnits("abc", "AED")).toThrow();
  });
  it("round-trips", () => {
    expect(fromMinorUnits(125050, "AED")).toBe("1250.50");
    expect(fromMinorUnits(5, "AED")).toBe("0.05");
    expect(fromMinorUnits(1200, "JPY")).toBe("1200");
    expect(fromMinorUnits(12350, "KWD")).toBe("12.350");
  });
});

describe("encodeParams", () => {
  it("encodes nested objects and arrays like Stripe expects", () => {
    const s = encodeParams({
      mode: "subscription",
      line_items: [{ price: "price_1", quantity: 1 }],
      metadata: { companyId: "c 1" },
      skip: undefined,
    });
    expect(s).toBe(
      "mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1&metadata%5BcompanyId%5D=c%201",
    );
  });
});

describe("verifyStripeSignature", () => {
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
  const t = 1_800_000_000;
  it("accepts a valid signature from any configured secret", () => {
    const header = signStripePayload(body, "whsec_connect", t);
    expect(verifyStripeSignature(body, header, ["whsec_platform", "whsec_connect"], { now: t + 10 })).toBeUndefined();
  });
  it("rejects tampering, stale timestamps and missing headers", () => {
    const header = signStripePayload(body, "whsec_platform", t);
    expect(() => verifyStripeSignature(body + " ", header, ["whsec_platform"], { now: t })).toThrow(StripeSignatureError);
    expect(() => verifyStripeSignature(body, header, ["whsec_platform"], { now: t + 301 })).toThrow(StripeSignatureError);
    expect(() => verifyStripeSignature(body, null, ["whsec_platform"], { now: t })).toThrow(StripeSignatureError);
    expect(() => verifyStripeSignature(body, header, ["whsec_other"], { now: t })).toThrow(StripeSignatureError);
  });
});

describe("mapSubscriptionStatus", () => {
  it("maps every Stripe status", () => {
    expect(mapSubscriptionStatus("active")).toBe("ACTIVE");
    expect(mapSubscriptionStatus("trialing")).toBe("TRIALING");
    expect(mapSubscriptionStatus("past_due")).toBe("PAST_DUE");
    expect(mapSubscriptionStatus("unpaid")).toBe("PAST_DUE");
    expect(mapSubscriptionStatus("canceled")).toBe("CANCELED");
    expect(mapSubscriptionStatus("incomplete_expired")).toBe("CANCELED");
  });
});
