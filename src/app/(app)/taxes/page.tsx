import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { can } from "@/lib/rbac";
import { rateToPercentString } from "@/lib/taxRate";
import { vatReturn } from "@/lib/reports";
import { pickerProps, resolvePeriod, type PeriodParams } from "@/lib/periods";
import { PeriodPicker } from "@/components/periods/period-picker";

const TREATMENTS = [
  { value: "STANDARD",    label: "Standard rated" },
  { value: "ZERO_RATED",  label: "Zero rated" },
  { value: "EXEMPT",      label: "Exempt" },
  { value: "OUT_OF_SCOPE", label: "Out of scope" },
];

export default async function TaxesPage(props: { searchParams?: Promise<PeriodParams> }) {
  const searchParams = (await props.searchParams) ?? {};
  const { active, userId } = await requireTenantContext();
  const denied = await viewGate(active.id, "taxes");
  if (denied) return denied;
  const fmt = await getFormatter(userId);
  const period = resolvePeriod(searchParams, new Date(), "quarter");
  const { from, to } = period;

  const [canEdit, taxCodes, vat] = await Promise.all([
    can(active.id, "settings", "EDIT"),
    prisma.taxCode.findMany({
      where:   { companyId: active.company.id },
      orderBy: [{ isActive: "desc" }, { code: "asc" }],
    }),
    vatReturn(active.company.id, from, to),
  ]);

  // Simple VAT return box breakdown
  const totalSales    = vat.outputTax;       // collected from customers
  const totalPurchase = vat.inputTax;        // paid to suppliers
  const netPayable    = vat.netPayable;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Taxes</h1>
        <p className="text-sm text-muted-foreground">
          {active.company.name} · {active.company.countryCode ?? "AE"}
        </p>
      </div>

      <PeriodPicker {...pickerProps(period)} />

      {/* ── VAT Return ──────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            VAT Return — {period.label}
          </h2>
          <p className="text-xs text-muted-foreground">
            {fmt.date(from)} to {fmt.date(to)} · Computed from posted journal entries
          </p>
        </div>

        <div className="divide-y divide-border">
          {/* Box 1 – Sales */}
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Output tax on sales</p>
              <p className="text-xs text-muted-foreground">VAT collected from customers</p>
            </div>
            <span className="font-mono text-sm text-foreground">{fmt.money(totalSales)}</span>
          </div>

          {/* Box 2 – Purchases */}
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Input tax on purchases</p>
              <p className="text-xs text-muted-foreground">VAT paid to suppliers (recoverable)</p>
            </div>
            <span className="font-mono text-sm text-foreground">{fmt.money(totalPurchase)}</span>
          </div>

          {/* Net */}
          <div className="flex items-center justify-between bg-muted/30 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">
              {netPayable.isNegative() ? "Net VAT refund due" : "Net VAT payable"}
            </p>
            <span
              className={`font-mono text-sm font-semibold ${
                netPayable.isNegative() ? "text-emerald-600" : "text-foreground"
              }`}
            >
              {fmt.money(netPayable.abs())}
            </span>
          </div>
        </div>

        <div className="px-4 py-2">
          <p className="text-xs text-muted-foreground">
            Submission to the UAE FTA e-services portal is a Phase 7 external integration.
            This is the computed return only — review before filing manually.
          </p>
        </div>
      </div>

      {/* ── Tax Codes table ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Tax Codes</h2>
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            {taxCodes.length} codes
            {canEdit && (
              <Link href="/settings/tax-codes" className="font-medium text-primary hover:underline">
                Manage tax codes
              </Link>
            )}
          </span>
        </div>

        {taxCodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tax codes yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Treatment</th>
                  <th className="px-4 py-3 text-left">Direction</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {taxCodes.map((tc: any) => (
                  <tr key={tc.id} className={`hover:bg-muted/20 ${!tc.isActive ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{tc.code}</td>
                    <td className="px-4 py-3 text-foreground">{tc.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {TREATMENTS.find((t) => t.value === tc.treatment)?.label ?? tc.treatment}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {tc.isInput ? "Input (purchases)" : "Output (sales)"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">
                      {rateToPercentString(tc.rate.toString())}%
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          tc.isActive
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {tc.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
