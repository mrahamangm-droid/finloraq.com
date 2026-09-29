import { notFound } from "next/navigation";
import Link from "next/link";
import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { getFormatter } from "@/lib/customization/server";

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return { title: `Supplier — Finloraq` };
}

const STATUS_COLOUR: Record<string, string> = {
  DRAFT:   "bg-muted text-muted-foreground",
  PENDING: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  PAID:    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  OVERDUE: "bg-destructive/10 text-destructive",
  VOID:    "bg-muted/40 text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft", PENDING: "Pending", PAID: "Paid", OVERDUE: "Overdue", VOID: "Void",
};

export default async function SupplierDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);

  const supplier = await prisma.supplier.findFirst({
    where: { id, companyId: active.companyId },
  });
  if (!supplier) notFound();

  // Load bills and purchase orders concurrently
  const [bills, purchaseOrders] = await Promise.all([
    prisma.bill.findMany({
      where: { supplierId: id, companyId: active.companyId },
      orderBy: { issueDate: "desc" },
      take: 50,
      select: {
        id: true, billNumber: true, issueDate: true, dueDate: true,
        status: true, total: true, currency: true,
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { supplierId: id, companyId: active.companyId },
      orderBy: { issueDate: "desc" },
      take: 20,
      select: {
        id: true, poNumber: true, issueDate: true,
        status: true, total: true,
      },
    }).catch(() => []),
  ]);

  // Calculate AP balance from open bills
  const openBills = bills.filter(
    (b: any) => b.status === "PENDING" || b.status === "OVERDUE"
  );
  const totalOwed      = openBills.reduce((s: number, b: any) => s + Number(b.total), 0);
  const totalBilled    = bills.reduce((s: number, b: any) => s + Number(b.total), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/suppliers" className="hover:text-foreground">Suppliers</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{supplier.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{supplier.name}</h1>
          <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
            {supplier.email && <span>{supplier.email}</span>}
            {supplier.phone && <span>{supplier.phone}</span>}
            {(supplier as any).taxRegNumber && (
              <span>TRN: {(supplier as any).taxRegNumber}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/suppliers/${id}/statement`}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
          >
            Statement
          </Link>
          <Link
            href={`/purchases/new?supplierId=${id}`}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            New bill
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Amount owed</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${totalOwed > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>
            {fmt.money(totalOwed)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{openBills.length} open bill{openBills.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total billed</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{fmt.money(totalBilled)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{bills.length} bill{bills.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment terms</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {(supplier as any).paymentTermsDays ?? 30}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">days net</p>
        </div>
      </div>

      {/* Bills */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Bills</h2>
          <Link href={`/purchases?supplierId=${id}`} className="text-xs text-muted-foreground hover:text-foreground">
            All bills →
          </Link>
        </div>

        {bills.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No bills yet.{" "}
            <Link href={`/purchases/new?supplierId=${id}`} className="text-primary hover:underline">
              Create one
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 text-left">Bill</th>
                  <th className="px-4 py-2 text-left">Issued</th>
                  <th className="px-4 py-2 text-left">Due</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bills.map((bill: any) => (
                  <tr key={bill.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <Link href={`/purchases/${bill.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                        {bill.billNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {fmt.date(new Date(bill.issueDate))}
                    </td>
                    <td className={`px-4 py-2 text-xs ${bill.status === "OVERDUE" ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                      {fmt.date(new Date(bill.dueDate))}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOUR[bill.status] ?? "bg-muted text-muted-foreground"}`}>
                        {STATUS_LABEL[bill.status] ?? bill.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-foreground">
                      {fmt.money(Number(bill.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Purchase orders */}
      {purchaseOrders.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Purchase Orders</h2>
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 text-left">PO</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {purchaseOrders.map((po: any) => (
                  <tr key={po.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <Link href={`/purchase-orders/${po.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                        {po.poNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {fmt.date(new Date(po.issueDate))}
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {po.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-foreground">
                      {fmt.money(Number(po.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
