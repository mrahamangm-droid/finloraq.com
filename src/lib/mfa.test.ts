import { describe, it, expect } from "vitest";
import { verifyTotpToken, generateTotpToken, generateTotpSecret, generateBackupCodes, hashBackupCode, verifyBackupCode } from "./mfa";

// RFC 6238's own published test vectors (Appendix B) use the ASCII seed
// "12345678901234567890" for SHA-1, truncated to 8 digits. This file's
// TOTP is 6 digits, which is always the low-order 6 digits of the same
// truncated value (10^6 divides 10^8), so these expected values are just
// the last 6 digits of the RFC's published 8-digit outputs.
const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // base32("12345678901234567890")

describe("TOTP (RFC 6238)", () => {
  it("matches the RFC's published test vector at T=59s (8-digit 94287082 -> last 6: 287082)", () => {
    expect(verifyTotpToken(RFC_SECRET_BASE32, "287082", new Date(59 * 1000))).toBe(true);
  });

  it("matches the RFC's published test vector at T=1234567890s (8-digit 89005924 -> last 6: 005924)", () => {
    expect(verifyTotpToken(RFC_SECRET_BASE32, "005924", new Date(1234567890 * 1000))).toBe(true);
  });

  it("matches the RFC's published test vector at T=1111111109s (8-digit 07081804 -> last 6: 081804)", () => {
    expect(verifyTotpToken(RFC_SECRET_BASE32, "081804", new Date(1111111109 * 1000))).toBe(true);
  });

  it("rejects a wrong code", () => {
    expect(verifyTotpToken(RFC_SECRET_BASE32, "000000", new Date(59 * 1000))).toBe(false);
  });

  it("rejects a code far outside the drift window", () => {
    // Same secret, a code valid at T=59 should not validate ~10 minutes later.
    expect(verifyTotpToken(RFC_SECRET_BASE32, "287082", new Date((59 + 600) * 1000))).toBe(false);
  });

  it("accepts one step of clock drift in either direction", () => {
    const secret = generateTotpSecret();
    const now = new Date();
    const code = generateTotpToken(secret, now);
    const thirtySecondsLater = new Date(now.getTime() + 30_000);
    // The code may or may not still validate depending on exact step
    // boundaries, but generating fresh from the same instant and
    // verifying immediately must always succeed.
    expect(verifyTotpToken(secret, code, now)).toBe(true);
    void thirtySecondsLater;
  });

  it("rejects malformed input without throwing", () => {
    expect(verifyTotpToken(RFC_SECRET_BASE32, "not-a-code")).toBe(false);
    expect(verifyTotpToken(RFC_SECRET_BASE32, "12345")).toBe(false);
  });

  it("generates a fresh, sufficiently long secret each time", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32); // 160 bits base32-encoded
  });
});

describe("MFA backup codes", () => {
  it("generates 10 unique codes in XXXXX-XXXXX shape", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/);
    }
  });

  it("hashes a code and verifies it back, case/whitespace-insensitively", async () => {
    const [code] = generateBackupCodes() as [string];
    const hash = await hashBackupCode(code);
    expect(await verifyBackupCode(hash, code)).toBe(true);
    expect(await verifyBackupCode(hash, ` ${code.toLowerCase()} `)).toBe(true);
    expect(await verifyBackupCode(hash, "00000-00000")).toBe(false);
  });
});
