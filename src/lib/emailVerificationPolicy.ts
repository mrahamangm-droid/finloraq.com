/**
 * Pure policy for "must this account confirm its email before signing in?".
 * Kept free of database/email imports so it is trivially unit-testable.
 *
 * Rules, in order:
 *  1. Already verified (including Google sign-ups, which arrive verified): no.
 *  2. REQUIRE_EMAIL_VERIFICATION=false switches the requirement off entirely.
 *  3. Accounts created before ENFORCED_FROM are grandfathered — they signed
 *     up when verification did not exist and must not be locked out.
 *  4. Otherwise it is required when outbound email is actually configured
 *     (so nobody is locked out by a link that could never be delivered), or
 *     when REQUIRE_EMAIL_VERIFICATION=true forces it on.
 */
export const ENFORCED_FROM = new Date("2026-09-28T00:00:00.000Z");

export function isVerificationRequired(
  user: { emailVerified: Date | null; createdAt: Date },
  opts: { emailConfigured: boolean; envFlag?: string },
): boolean {
  if (user.emailVerified) return false;
  if (opts.envFlag === "false") return false;
  if (user.createdAt < ENFORCED_FROM) return false;
  return opts.emailConfigured || opts.envFlag === "true";
}
