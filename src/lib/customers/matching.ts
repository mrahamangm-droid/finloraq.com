import { prisma } from "@/lib/db";

/**
 * Fuzzy matching for the Customer File Intelligence pipeline
 * (src/lib/ai/customer-extraction.ts). This never writes anything — it
 * only ranks existing Customer rows against a name/email/phone read off
 * an uploaded document, so a human can pick "yes, that's this customer"
 * or "no, make a new one" in the review queue. Nothing here is exact
 * enough to auto-apply on its own, by design (see the "always require
 * review first" decision for this feature).
 */

export interface CustomerMatchCandidate {
  customerId: string;
  name: string;
  score: number; // 0..1, 1 = exact email/name match
  reason: string;
}

/** Lowercases, strips accents, and collapses everything that isn't a
 *  letter/digit to single spaces, so "Al-Fahim Trading Co." and
 *  "AL FAHIM TRADING CO" compare equal. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizePhone(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

/** Token-overlap (Jaccard) similarity between two names, 0..1, with a
 *  couple of cheap special cases for exact and substring matches so
 *  "Acme" scores well against "Acme Inc" even though token overlap alone
 *  would only give 1/2. */
export function scoreNameMatch(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  const ta = new Set(na.split(" ").filter(Boolean));
  const tb = new Set(nb.split(" ").filter(Boolean));
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : intersection / union;
}

const MIN_SCORE_TO_SURFACE = 0.5;
const MAX_CANDIDATES = 5;

export async function findCustomerMatches(params: {
  companyId: string;
  nameGuess: string | null;
  email: string | null;
  phone: string | null;
}): Promise<CustomerMatchCandidate[]> {
  const customers = await prisma.customer.findMany({
    where: { companyId: params.companyId, isActive: true },
    select: { id: true, name: true, email: true, phone: true },
  });

  const candidates: CustomerMatchCandidate[] = [];
  const email = params.email?.trim().toLowerCase() || null;
  const phone = params.phone ? normalizePhone(params.phone) : null;

  for (const c of customers) {
    let score = 0;
    const reasons: string[] = [];

    if (email && c.email && c.email.trim().toLowerCase() === email) {
      score = 1;
      reasons.push("email matches exactly");
    }
    if (phone && c.phone && normalizePhone(c.phone) === phone && phone.length >= 6) {
      if (0.95 > score) score = 0.95;
      reasons.push("phone matches exactly");
    }
    if (params.nameGuess) {
      const nameScore = scoreNameMatch(params.nameGuess, c.name);
      if (nameScore > score) {
        score = nameScore;
        reasons.length = 0; // name is the strongest signal we found; lead with it
        reasons.push(`name is ${Math.round(nameScore * 100)}% similar to "${c.name}"`);
      } else if (nameScore >= MIN_SCORE_TO_SURFACE) {
        reasons.push(`name is ${Math.round(nameScore * 100)}% similar to "${c.name}"`);
      }
    }

    if (score >= MIN_SCORE_TO_SURFACE) {
      candidates.push({ customerId: c.id, name: c.name, score, reason: reasons.join("; ") });
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES);
}
