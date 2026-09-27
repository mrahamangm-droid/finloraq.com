import { requireTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { NewJournalEntryForm } from "@/components/forms/new-journal-entry-form";

export default async function NewJournalEntryPage() {
  const { active } = await requireTenantContext();

  const [costCentres, projects] = await Promise.all([
    prisma.costCentre.findMany({ where: { companyId: active.companyId, isActive: true }, orderBy: { code: "asc" } }),
    prisma.project.findMany({ where: { companyId: active.companyId, isActive: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold text-foreground">New Journal Entry</h1>
      <NewJournalEntryForm
        costCentres={costCentres.map((c) => ({ id: c.id, name: c.name, code: c.code }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name, code: p.code }))}
      />
    </div>
  );
}
