import { requireTenantContext } from "@/lib/tenant";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { vatReturn } from "@/lib/reports";

export default async function TaxesPage() {
  const { active, userId } = await requireTenantContext();
  const fmt = await getFormatter(userId);
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = now;

  const [taxCodes, vat] = await Promise.all([
    prisma.taxCode.findMany({ where: { companyId: active.companyId }, orderBy: { code: "asc" } }),
    vatReturn(active.companyId, from, to),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Taxes</h1>
        <p className="text-sm text-muted-foreground">
          {active.company.name} · {active.company.countryCode}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          VAT Return — {from.toISOString().slice(0, 10)} to {to.toISOString().slice(0, 10)}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 text-card-foreground">Output tax (on sales)</td>
                <td className="py-1 text-right text-card-foreground">{fmt.money(vat.outputTax)}</td>
              </tr>
              <tr>
                <td className="py-1 text-card-foreground">Input tax (on purchases)</td>
                <td className="py-1 text-right text-card-foreground">{fmt.money(vat.inputTax)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
          <span>{vat.netPayable.isNegative() ? "Net refund due" : "Net payable"}</span>
          <span>{fmt.money(vat.netPayable.abs())}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tax Codes
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {taxCodes.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{t.code}</td>
                  <td className="px-4 py-2 text-card-foreground">{t.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{t.treatment}</td>
                  <td className="px-4 py-2 text-right text-card-foreground">{fmt.money(t.rate.times(100))}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Filing/submission to a tax authority (e.g. UAE FTA e-filing) is a Phase 7 external
        integration — this is the computed return only, for review.
      </p>
    </div>
  );
}
