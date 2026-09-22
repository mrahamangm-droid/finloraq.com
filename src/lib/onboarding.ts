import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

/** UAE tax pack — the first country pack, per spec section 6/25. Additional
 *  countries add their own pack here; nothing about company creation is
 *  UAE-specific beyond which pack gets seeded for countryCode "AE". */
const UAE_TAX_CODES = [
  { code: "VAT_STD_5", name: "Standard rate 5%", rate: 0.05, treatment: "STANDARD" as const },
  { code: "VAT_ZERO", name: "Zero-rated", rate: 0, treatment: "ZERO_RATED" as const },
  { code: "VAT_EXEMPT", name: "Exempt", rate: 0, treatment: "EXEMPT" as const },
];

/** Minimal starter chart of accounts — enough for Phase 2's posting engine
 *  to have real accounts to hit (AR, AP, Bank, Revenue, Output/Input Tax).
 *  Full country-specific COA templates are a Phase 2+ enhancement. */
const STARTER_ACCOUNTS: { code: string; name: string; type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE"; isSystem?: boolean }[] = [
  { code: "1000", name: "Bank", type: "ASSET" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET", isSystem: true },
  { code: "1200", name: "Input Tax Receivable", type: "ASSET", isSystem: true },
  { code: "2000", name: "Accounts Payable", type: "LIABILITY", isSystem: true },
  { code: "2100", name: "Output Tax Payable", type: "LIABILITY", isSystem: true },
  { code: "3000", name: "Owner's Equity", type: "EQUITY" },
  { code: "4000", name: "Sales Revenue", type: "REVENUE" },
  { code: "5000", name: "General Expenses", type: "EXPENSE" },
];

export async function createCompanyForUser(params: {
  userId: string;
  name: string;
  countryCode: string;
  baseCurrency: string;
}) {
  const { userId, name, countryCode, baseCurrency } = params;

  const company = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name, countryCode, baseCurrency },
    });

    await tx.companyMembership.create({
      data: { companyId: company.id, userId, role: "COMPANY_ADMIN" },
    });

    await tx.accountingPeriod.create({
      data: {
        companyId: company.id,
        name: currentPeriodName(),
        startDate: startOfCurrentMonth(),
        endDate: endOfCurrentMonth(),
      },
    });

    await tx.account.createMany({
      data: STARTER_ACCOUNTS.map((a) => ({ ...a, companyId: company.id })),
    });

    if (countryCode === "AE") {
      await tx.taxCode.createMany({
        data: UAE_TAX_CODES.map((t) => ({
          companyId: company.id,
          countryCode: "AE",
          code: t.code,
          name: t.name,
          rate: t.rate,
          treatment: t.treatment,
          isInput: false,
        })),
      });
    }

    await tx.subscription.create({
      data: { companyId: company.id, plan: "STARTER", status: "TRIALING" },
    });

    return company;
  });

  await recordAuditEvent({
    companyId: company.id,
    userId,
    action: "company.created",
    entityType: "Company",
    entityId: company.id,
    newValue: { name, countryCode, baseCurrency },
  });

  return company;
}

function currentPeriodName() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function startOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
}
function endOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59));
}
