import { requireTenantContext } from "@/lib/tenant";
import { requirePermission, can } from "@/lib/rbac";
import { listContacts } from "@/lib/crm";
import Link from "next/link";
import { NewContactForm } from "@/components/crm/new-contact-form";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { active } = await requireTenantContext();
  await requirePermission(active.id, "crm", "VIEW");

  const [canCreate, result] = await Promise.all([
    can(active.id, "crm", "CREATE"),
    listContacts(active.companyId, {
      customerId: sp.customerId,
      page: parseInt(sp.page ?? "1", 10),
      limit: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground">{result.total} total</p>
        </div>
        <Link href="/crm" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to CRM
        </Link>
      </div>

      {canCreate && <NewContactForm />}

      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Name</th>
                <th className="hidden px-4 py-3 sm:table-cell">Title</th>
                <th className="px-4 py-3">Email</th>
                <th className="hidden px-4 py-3 md:table-cell">Customer</th>
                <th className="hidden px-4 py-3 lg:table-cell">Primary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No contacts yet. Add your first contact above.
                  </td>
                </tr>
              )}
              {result.items.map((contact: any) => (
                <tr key={contact.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {contact.firstName} {contact.lastName}
                    </div>
                    {contact.phone && (
                      <div className="text-xs text-muted-foreground">{contact.phone}</div>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {contact.title ?? "—"}
                    {contact.department ? ` · ${contact.department}` : ""}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`} className="hover:text-foreground">
                        {contact.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {contact.customer ? (
                      <Link
                        href={`/customers`}
                        className="text-primary hover:underline"
                      >
                        {contact.customer.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {contact.isPrimary ? (
                      <span className="text-xs text-green-600 dark:text-green-400">✓ Primary</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
