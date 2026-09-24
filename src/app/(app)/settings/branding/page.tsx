import { requireTenantContext } from "@/lib/tenant";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { SettingsTabs } from "@/components/settings/customize/settings-tabs";
import { BrandingForm } from "@/components/settings/customize/branding-form";

export const metadata = { title: "Branding" };

export default async function BrandingPage() {
  const { active } = await requireTenantContext();
  const [company, canEdit] = await Promise.all([
    prisma.company.findUniqueOrThrow({
      where: { id: active.companyId },
      select: { name: true, brandColor: true, invoiceFooter: true, invoiceTerms: true, logoUrl: true },
    }),
    can(active.id, "settings", "EDIT"),
  ]);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Make Finloraq look like your company — for your team and on the invoices your customers see.</p>
      </div>
      <SettingsTabs />
      <BrandingForm
        canEdit={canEdit}
        companyName={company.name}
        initial={{ brandColor: company.brandColor, invoiceFooter: company.invoiceFooter, invoiceTerms: company.invoiceTerms, logoUrl: company.logoUrl }}
      />
    </div>
  );
}
