import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { NewBankAccountForm } from "@/components/forms/new-bank-account-form";
import { BankTransactionPanel } from "@/components/forms/bank-transaction-panel";

export default async function BankingPage() {
  const { active } = await requireTenantContext();

  const accounts = await prisma.bankAccount.findMany({
    where: { companyId: active.companyId },
    orderBy: { createdAt: "asc" },
    include: { transactions: { orderBy: { date: "desc" }, take: 50 } },
  });

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
          <h2 className="text-lg font-medium text-foreground">
            {account.name} <span className="text-sm font-normal text-muted-foreground">({account.currency})</span>
          </h2>
          <BankTransactionPanel
            bankAccountId={account.id}
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
