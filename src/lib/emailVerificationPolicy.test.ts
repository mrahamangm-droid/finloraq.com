import { describe, expect, it } from "vitest";
import { ENFORCED_FROM, isVerificationRequired } from "./emailVerificationPolicy";

const after = new Date(ENFORCED_FROM.getTime() + 86_400_000);
const before = new Date(ENFORCED_FROM.getTime() - 86_400_000);

describe("isVerificationRequired", () => {
  it("never requires it for an already verified user", () => {
    expect(isVerificationRequired({ emailVerified: new Date(), createdAt: after }, { emailConfigured: true })).toBe(false);
  });

  it("grandfathers accounts created before verification existed", () => {
    expect(isVerificationRequired({ emailVerified: null, createdAt: before }, { emailConfigured: true, envFlag: "true" })).toBe(false);
  });

  it("requires it for new unverified users once email is configured", () => {
    expect(isVerificationRequired({ emailVerified: null, createdAt: after }, { emailConfigured: true })).toBe(true);
  });

  it("does not lock users out when email cannot be delivered", () => {
    expect(isVerificationRequired({ emailVerified: null, createdAt: after }, { emailConfigured: false })).toBe(false);
  });

  it("can be forced on or off with REQUIRE_EMAIL_VERIFICATION", () => {
    expect(isVerificationRequired({ emailVerified: null, createdAt: after }, { emailConfigured: false, envFlag: "true" })).toBe(true);
    expect(isVerificationRequired({ emailVerified: null, createdAt: after }, { emailConfigured: true, envFlag: "false" })).toBe(false);
  });
});
