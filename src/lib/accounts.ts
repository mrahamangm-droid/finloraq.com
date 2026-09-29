import type { AccountType, SystemAccountPurpose } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";

/** Thrown for a bad account edit — a duplicate code, an empty name, etc. */
export class AccountValidationError extends Error {}

/** Thrown when a delete/edit-of-system-fields is refused. */
export class AccountInUseError extends Error {}

/**
 * Adds a general ledger account. Anyone with "accounting" CREATE can add
 * one (an Accountant or Finance Manager, not just an admin — see the
 * default matrix in src/lib/rbac.ts), same permission tier as posting a
 * manual journal entry. New accounts are never `isSystem` — those five
 * (Bank, AR, Input Tax, AP, Output Tax) are seeded once at onboarding and
 * never created here.
 */
export async function createAccount(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  code: string;
  name: string;
  type: AccountType;
  parentId?: string | null;
  currency?: string | null;
}) {
  await requirePermission(params.membershipId, "accounting", "CREATE");

  const code = params.code.trim();
  const name = params.name.trim();
  if (!code) throw new AccountValidationError("Account code can't be empty.");
  if (!name) throw new AccountValidationError("Account name can't be empty.");

  const clash = await prisma.account.findUnique({ where: { companyId_code: { companyId: params.companyId, code } } });
  if (clash) throw new AccountValidationError(`Account code "${code}" is already in use.`);

  if (params.parentId) {
    const parent = await prisma.account.findFirst({ where: { id: params.parentId, companyId: params.companyId } });
    if (!parent) throw new AccountValidationError("Parent account not found.");
    if (parent.type !== params.type) {
      throw new AccountValidationError(`A ${params.type.toLowerCase()} account can't sit under a ${parent.type.toLowerCase()} parent.`);
    }
  }

  const account = await prisma.account.create({
    data: {
      companyId: params.companyId,
      code,
      name,
      type: params.type,
      parentId: params.parentId || undefined,
      currency: params.currency || undefined,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "account.created",
    entityType: "Account",
    entityId: account.id,
    newValue: { code: account.code, name: account.name, type: account.type },
  });

  return account;
}

/**
 * Edits an account's name, active flag, parent or currency. The code and
 * type are deliberately not editable once journal lines exist against the
 * account — every posted JournalLine.accountId is trusted to still mean
 * what it meant when it posted, and code/type are what the ledger builders
 * in src/lib/ledger.ts (buildInvoicePosting, etc.) key off of. Renaming an
 * account (its display label) or deactivating it never touches history —
 * reports join on accountId, not on the code/name/type strings, so nothing
 * needs recomputing when this runs. A never-posted account (no journal
 * lines yet) can still have its code/type corrected, since nothing depends
 * on them yet.
 */
export async function updateAccount(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  accountId: string;
  code?: string;
  name?: string;
  type?: AccountType;
  isActive?: boolean;
  parentId?: string | null;
  currency?: string | null;
}) {
  await requirePermission(params.membershipId, "accounting", "EDIT");

  const before = await prisma.account.findFirst({ where: { id: params.accountId, companyId: params.companyId } });
  if (!before) throw new NotFoundError("Account not found.");

  if (params.name !== undefined && params.name.trim() === "") {
    throw new AccountValidationError("Account name can't be empty.");
  }
  if (params.parentId) {
    const parent = await prisma.account.findFirst({ where: { id: params.parentId, companyId: params.companyId } });
    if (!parent) throw new AccountValidationError("Parent account not found.");
  }

  const lineCount = await prisma.journalLine.count({ where: { accountId: params.accountId } });
  const codeOrTypeChanging =
    (params.code !== undefined && params.code.trim() !== before.code) ||
    (params.type !== undefined && params.type !== before.type);
  if (codeOrTypeChanging && lineCount > 0) {
    throw new AccountInUseError(
      `${before.code} · ${before.name} has ${lineCount} posted journal line${lineCount === 1 ? "" : "s"}. Its code and type can't change once it's been used — rename it, or deactivate it and create a new account instead.`
    );
  }
  if (before.isSystem && (params.code !== undefined || params.type !== undefined)) {
    throw new AccountInUseError(`${before.code} · ${before.name} is a system account. Its code and type can't change.`);
  }

  let code = before.code;
  if (params.code !== undefined && params.code.trim() !== before.code) {
    code = params.code.trim();
    if (!code) throw new AccountValidationError("Account code can't be empty.");
    const clash = await prisma.account.findUnique({ where: { companyId_code: { companyId: params.companyId, code } } });
    if (clash && clash.id !== params.accountId) throw new AccountValidationError(`Account code "${code}" is already in use.`);
  }

  const account = await prisma.account.update({
    where: { id: params.accountId },
    data: {
      code: params.code !== undefined ? code : undefined,
      name: params.name !== undefined ? params.name.trim() : undefined,
      type: params.type,
      isActive: params.isActive,
      parentId: params.parentId !== undefined ? params.parentId : undefined,
      currency: params.currency !== undefined ? params.currency : undefined,
    },
  });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "account.updated",
    entityType: "Account",
    entityId: account.id,
    previousValue: { code: before.code, name: before.name, type: before.type, isActive: before.isActive },
    newValue: { code: account.code, name: account.name, type: account.type, isActive: account.isActive },
  });

  return account;
}

/**
 * Permanently removes an account. Refused for a system account (AR/AP/
 * Bank/tax control accounts the posting engine's builders hard-code by
 * code — see src/lib/ledger.ts) and for any account with a posted or
 * draft journal line against it, since deleting it would orphan those
 * lines. Deactivating (updateAccount isActive: false) is the right move
 * for an account with history: it drops out of the "unknown or inactive
 * account code" check in postJournalEntry, so it can no longer receive
 * new postings, while every past line keeps resolving normally in
 * reports.
 */
export async function deleteAccount(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  accountId: string;
}) {
  await requirePermission(params.membershipId, "accounting", "DELETE");

  const account = await prisma.account.findFirst({ where: { id: params.accountId, companyId: params.companyId } });
  if (!account) throw new NotFoundError("Account not found.");

  if (account.isSystem) {
    throw new AccountInUseError(`${account.code} · ${account.name} is a system account and can't be deleted.`);
  }

  const [lineCount, childCount] = await Promise.all([
    prisma.journalLine.count({ where: { accountId: account.id } }),
    prisma.account.count({ where: { parentId: account.id } }),
  ]);
  if (lineCount > 0) {
    throw new AccountInUseError(
      `${account.code} · ${account.name} has ${lineCount} journal line${lineCount === 1 ? "" : "s"} on record and can't be deleted. Deactivate it instead to hide it without losing that history.`
    );
  }
  if (childCount > 0) {
    throw new AccountInUseError(`${account.code} · ${account.name} has sub-accounts under it. Reassign or remove those first.`);
  }

  await prisma.account.delete({ where: { id: account.id } });

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "account.deleted",
    entityType: "Account",
    entityId: account.id,
    previousValue: { code: account.code, name: account.name, type: account.type },
  });
}

/**
 * Resolves one of this company's five well-known system accounts by role
 * instead of assuming a literal code ("1000" for Bank, "1100" for AR, etc.)
 * — those codes are only guaranteed for companies onboarded after
 * Account.purpose existed (see the account_system_purpose migration's
 * backfill). Every posting/reporting path that needs one of these accounts
 * should resolve it once via this (or one of the named wrappers below) and
 * pass the result through, rather than hard-coding the code directly.
 */
export async function getSystemAccountCode(companyId: string, purpose: SystemAccountPurpose): Promise<string> {
  const account = await prisma.account.findFirst({ where: { companyId, purpose } });
  if (!account) {
    throw new NotFoundError(`This company has no ${SYSTEM_ACCOUNT_LABEL[purpose]} account configured.`);
  }
  return account.code;
}

const SYSTEM_ACCOUNT_LABEL: Record<SystemAccountPurpose, string> = {
  BANK: "Bank",
  ACCOUNTS_RECEIVABLE: "Accounts Receivable",
  INPUT_TAX_RECEIVABLE: "Input Tax Receivable",
  ACCOUNTS_PAYABLE: "Accounts Payable",
  OUTPUT_TAX_PAYABLE: "Output Tax Payable",
};

export const getBankAccountCode = (companyId: string) => getSystemAccountCode(companyId, "BANK");
export const getAccountsReceivableCode = (companyId: string) => getSystemAccountCode(companyId, "ACCOUNTS_RECEIVABLE");
export const getInputTaxReceivableCode = (companyId: string) => getSystemAccountCode(companyId, "INPUT_TAX_RECEIVABLE");
export const getAccountsPayableCode = (companyId: string) => getSystemAccountCode(companyId, "ACCOUNTS_PAYABLE");
export const getOutputTaxPayableCode = (companyId: string) => getSystemAccountCode(companyId, "OUTPUT_TAX_PAYABLE");
