import { describe, expect, it } from "vitest";
import {
  billingCurrencyForCountry,
  currencyForCountry,
  formatMoney,
  isBillingCurrency,
  isDisplayCurrency,
  roundApprox,
} from "./currency";

describe("currency helpers", () => {
  it("formats billing prices the way the pricing cards show them", () => {
    expect(formatMoney(49, "USD")).toBe("US$49");
    expect(formatMoney(179, "AED")).toBe("AED 179");
    expect(formatMoney(1099, "AED")).toBe("AED 1,099");
    expect(formatMoney(45, "EUR")).toBe("€45");
    expect(formatMoney(35, "GBP")).toBe("£35");
    expect(formatMoney(4700, "INR", { approx: true })).toBe("≈ ₹4,700");
  });

  it("maps countries to currencies, falling back to USD for billing", () => {
    expect(currencyForCountry("AE")).toBe("AED");
    expect(currencyForCountry("de")).toBe("EUR");
    expect(currencyForCountry("IN")).toBe("INR");
    expect(currencyForCountry(null)).toBe("USD");
    expect(billingCurrencyForCountry("IN")).toBe("usd");
    expect(billingCurrencyForCountry("FR")).toBe("eur");
    expect(billingCurrencyForCountry("SA")).toBe("sar");
  });

  it("keeps billing and display-only currencies separate", () => {
    expect(isBillingCurrency("aed")).toBe(true);
    expect(isBillingCurrency("inr")).toBe(false);
    expect(isDisplayCurrency("INR")).toBe(true);
    expect(isDisplayCurrency("AED")).toBe(false);
  });

  it("rounds estimates so they don't look falsely precise", () => {
    expect(roundApprox(4697.6)).toBe(4700);
    expect(roundApprox(13593.9)).toBe(13600);
    expect(roundApprox(15.07)).toBe(15.1);
  });
});
