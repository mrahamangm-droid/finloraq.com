import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { prisma } from "@/lib/db";
import { NewInvoiceForm } from "@/components/forms/new-invoice-form";

export default async function EditInvoicePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const { active } = await requireTenantContext();
  const denied = await viewGate(active.id, "invoices");
  if (denied) return denied;

  const [invoice, customers, taxCodes, products] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id: id, companyId: active.companyId },
      include: { lines: true },
    }),
    prisma.customer.findMany({ where: { companyId: active.companyId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.taxCode.findMany({ where: { companyId: active.companyId, isActive: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { companyId: active.companyId, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  if (!invoice) notFound();
  if (invoice.status !== "DRAFT") notFound(); // only a draft can be edited — see updateInvoice() in src/lib/sales.ts

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Edit Invoice {invoice.invoiceNumber}</h1>
      <NewInvoiceForm
        invoiceId={invoice.id}
        currency={active.company.baseCurrency}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        taxCodes={taxCodes.map((t) => ({ id: t.id, name: t.name, rate: t.rate.toNumber() }))}
        products={products.map((p) => ({ id: p.id, name: p.name, unitPrice: p.unitPrice.toNumber(), trackInventory: p.trackInventory, quantityOnHand: p.quantityOnHand.toNumber() }))}
        initial={{
          customerId: invoice.customerId,
          issueDate: invoice.issueDate.toISOString().slice(0, 10),
          dueDate: invoice.dueDate.toISOString().slice(0, 10),
          currency: invoice.currency,
          exchangeRate: invoice.exchangeRate.toString(),
          lines: invoice.lines.map((l: any) => ({
            description: l.description,
            quantity: l.quantity.toString(),
            unitPrice: l.unitPrice.toString(),
            taxCodeId: l.taxCodeId ?? "",
            productId: l.productId ?? "",
          })),
        }}
      />
    </div>
  );
}
