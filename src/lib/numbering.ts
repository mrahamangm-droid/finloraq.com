import type { Prisma } from "@prisma/client";

/**
 * Sequential document numbering shared by invoices/bills/etc. Same
 * advisory-lock pattern as the journal entry numbering in ledger.ts — see
 * that file's comment for the production-scale caveat (swap for a real
 * per-company DB sequence if contention ever becomes measurable).
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  prefix: string,
  findLast: () => Promise<{ number: string } | null>
): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId + ":" + prefix}))`;
  const last = await findLast();
  const lastN = last ? parseInt(last.number.replace(/\D/g, ""), 10) || 0 : 0;
  return `${prefix}-${String(lastN + 1).padStart(6, "0")}`;
}
