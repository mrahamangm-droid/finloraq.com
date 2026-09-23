import { describe, expect, it } from "vitest";
import {
  WebhookSignatureError,
  encodeStripeForm,
  isEntitlingStatus,
  mapStripeStatus,
  planFromPrice,
  planLookupKey,
  signStripePayload,
  stripeModeFromKey,
  verifyStripeSignature,
} from "./stripe-core";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ id: "evt_1", type: "invoice.paid" });

describe("verifyStripeSignature", () => {
  const now = 1_700_000_000;

  it("accepts a correctly signed payload inside the tolerance window", () => {
    const header = signStripePayload(BODY, SECRET, now - 10);
    expect(() => verifyStripeSignature(BODY, header, SECRET, { nowSeconds: now })).not.toThrow();
  });

  it("accepts when any one of several v1 signatures matches (secret rotation)", () => {
    const good = signStripePayload(BODY, SECRET, now).split(",")[1];
    const header = `t=${now},v1=${"0".repeat(64)},${good}`;
    expect(() => verifyStripeSignature(BODY, header, SECRET, { nowSeconds: now })).not.toThrow();
  });

  it("rejects a tampered body", () => {
    const header = signStripePayload(BODY, SECRET, now);
    expect(() => verifyStripeSignature(BODY + " ", header, SECRET, { nowSeconds: now })).toThrow(WebhookSignatureError);
  });

  it("rejects the wrong secret", () => {
    const header = signStripePayload(BODY, "whsec_other", now);
    expect(() => verifyStripeSignature(BODY, header, SECRET, { nowSeconds: now })).toThrow(WebhookSignatureError);
  });

  it("rejects replays outside the tolerance window", () => {
    const header = signStripePayload(BODY, SECRET, now - 301);
    expect(() => verifyStripeSignature(BODY, header, SECRET, { nowSeconds: now })).toThrow(/tolerance/);
  });

  it("rejects missing or malformed headers", () => {
    expect(() => verifyStripeSignature(BODY, null, SECRET)).toThrow(WebhookSignatureError);
    expect(() => verifyStripeSignature(BODY, "v1=abc", SECRET)).toThrow(/timestamp/);
    expect(() => verifyStripeSignature(BODY, `t=${now}`, SECRET, { nowSeconds: now })).toThrow(/v1/);
  });
});

describe("encodeStripeForm", () => {
  it("encodes nested objects and arrays in Stripe's bracket syntax and skips empty values", () => {
    const encoded = encodeStripeForm({
      mode: "subscription",
      line_items: [{ price: "price_1", quantity: 1 }],
      metadata: { companyId: "c 1" },
      email: undefined,
      recurring: { interval: "month" },
    });
    expect(decodeURIComponent(encoded)).toBe(
      "mode=subscription&line_items[0][price]=price_1&line_items[0][quantity]=1&metadata[companyId]=c 1&recurring[interval]=month"
    );
  });
});

describe("plan ↔ price mapping", () => {
  it("round-trips lookup keys for paid plans", () => {
    for (const plan of ["GROWTH", "PROFESSIONAL", "AI_CFO"] as const) {
      expect(planFromPrice({ lookup_key: planLookupKey(plan) })).toBe(plan);
    }
  });

  it("prefers metadata.plan and ignores non-self-serve plans", () => {
    expect(planFromPrice({ lookup_key: "finloraq_growth_monthly", metadata: { plan: "AI_CFO" } })).toBe("AI_CFO");
    expect(planFromPrice({ lookup_key: "finloraq_enterprise_monthly" })).toBeNull();
    expect(planFromPrice({ lookup_key: "something_else" })).toBeNull();
    expect(planFromPrice(null)).toBeNull();
  });
});

describe("status + mode helpers", () => {
  it("maps Stripe statuses", () => {
    expect(mapStripeStatus("active")).toBe("ACTIVE");
    expect(mapStripeStatus("trialing")).toBe("TRIALING");
    expect(mapStripeStatus("past_due")).toBe("PAST_DUE");
    expect(mapStripeStatus("canceled")).toBe("CANCELED");
    expect(isEntitlingStatus("past_due")).toBe(true);
    expect(isEntitlingStatus("incomplete")).toBe(false);
  });

  it("detects test vs live keys", () => {
    expect(stripeModeFromKey("sk_test_abc")).toBe("test");
    expect(stripeModeFromKey("rk_live_abc")).toBe("live");
    expect(stripeModeFromKey("")).toBeNull();
  });
});
