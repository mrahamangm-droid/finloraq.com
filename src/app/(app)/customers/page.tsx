import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { createCustomerAction } from "./actions";

export default async function CustomersPage() {
  const { active } = await requireTenantContext();

  const customers = await prisma.customer.findMany({
    where: { companyId: active.companyId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Customers</h1>
        <p className="text-sm text-muted-foreground">{active.company.name}</p>
      </div>

      <form action={createCustomerAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-lg border border-border bg-card p-4">
        <input name="name" required placeholder="Customer name" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="email" type="email" placeholder="Email (optional)" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="phone" placeholder="Phone (optional)" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          Add customer
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Terms</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No customers yet.</td></tr>
              )}
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-card-foreground">{c.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.email ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.paymentTermsDays} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
