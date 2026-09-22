import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, isPasswordStrong } from "./password";

describe("password hashing (Argon2id)", () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("CorrectHorseBattery9");
    expect(await verifyPassword(hash, "CorrectHorseBattery9")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("CorrectHorseBattery9");
    expect(await verifyPassword(hash, "WrongPassword1")).toBe(false);
  });

  it("never returns the plaintext in the hash", async () => {
    const hash = await hashPassword("CorrectHorseBattery9");
    expect(hash).not.toContain("CorrectHorseBattery9");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("fails closed on a malformed hash instead of throwing", async () => {
    await expect(verifyPassword("not-a-real-hash", "anything")).resolves.toBe(false);
  });
});

describe("password strength policy", () => {
  it("rejects short passwords", () => {
    expect(isPasswordStrong("Short1").ok).toBe(false);
  });
  it("rejects passwords missing a digit", () => {
    expect(isPasswordStrong("NoDigitsHereAtAll").ok).toBe(false);
  });
  it("accepts a strong password", () => {
    expect(isPasswordStrong("StrongPassword123").ok).toBe(true);
  });
});
