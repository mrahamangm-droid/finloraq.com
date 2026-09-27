import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { NewBankAccountForm } from "@/components/forms/new-bank-account-form";
import { BankTransactionPanel } from "@/components/forms/bank-transaction-panel";
import { BankAccountHeader } from "@/components/forms/bank-account-header";

export default async function BankingPage() {
  const { active } = await requireTenantContext();

  const [accounts, canEdit, canDelete] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { companyId: active.companyId },
      orderBy: { createdAt: "asc" },
      include: { transactions: { orderBy: { date: "desc" }, take: 50 } },
    }),
    can(active.id, "banking", "EDIT"),
    can(active.id, "banking", "DELETE"),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Banking</h1>
        <p className="text-sm text-muted-foreground">{active.company.name}</p>
      </div>

      <NewBankAccountForm />

      {accounts.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          Add a bank account above to start recording and matching transactions.
        </p>
      )}

      {accounts.map((account) => (
        <div key={account.id} className="space-y-3">
          <BankAccountHeader
            bankAccountId={account.id}
            name={account.name}
            currency={account.currency}
            isActive={account.isActive}
            canEdit={canEdit}
            canDelete={canDelete}
          />
          <BankTransactionPanel
            bankAccountId={account.id}
            canEdit={canEdit}
            canDelete={canDelete}
            transactions={account.transactions.map((t) => ({
              id: t.id,
              date: t.date.toISOString().slice(0, 10),
              description: t.description,
              amount: t.amount.toNumber(),
              status: t.status,
            }))}
          />
        </div>
      ))}
    </div>
  );
}
