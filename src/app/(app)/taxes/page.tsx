import { requireTenantContext } from "@/lib/tenant";
import { viewGate } from "@/lib/page-access";
import { getFormatter } from "@/lib/customization/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { vatReturn } from "@/lib/reports";
import { pickerProps, resolvePeriod, type PeriodParams } from "@/lib/periods";
import { PeriodPicker } from "@/components/periods/period-picker";
import {
  createTaxCodeAction,
  toggleTaxCodeAction,
  deleteTaxCodeAction,
} from "./actions";

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
          <span className="text-xs text-muted-foreground">{taxCodes.length} codes</span>
        </div>

        {taxCodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tax codes yet. Add one below.</p>
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
                  {canEdit && <th className="px-4 py-3" />}
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
                      {(Number(tc.rate) * 100).toFixed(1)}%
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
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <form action={toggleTaxCodeAction.bind(null, tc.id, !tc.isActive)}>
                            <button
                              type="submit"
                              className="text-xs text-primary underline-offset-2 hover:underline"
                            >
                              {tc.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </form>
                          <form action={deleteTaxCodeAction.bind(null, tc.id)}>
                            <button
                              type="submit"
                              className="text-xs text-destructive underline-offset-2 hover:underline"
                            >
                              Delete
                            </button>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Add Tax Code form ─────────────────────────────────────────── */}
        {canEdit && (
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Add Tax Code</h3>
            <form
              action={createTaxCodeAction}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Code (e.g. VAT_STD_5)
                </label>
                <input
                  name="code"
                  required
                  placeholder="VAT_STD_5"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Name
                </label>
                <input
                  name="name"
                  required
                  placeholder="Standard Rate 5%"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Rate (%)
                </label>
                <input
                  name="rate"
                  type="number"
                  step="0.001"
                  min="0"
                  max="100"
                  required
                  placeholder="5"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Treatment
                </label>
                <select
                  name="treatment"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {TREATMENTS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Direction
                </label>
                <select
                  name="isInput"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="false">Output (sales / collected)</option>
                  <option value="true">Input (purchases / recoverable)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Add Tax Code
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
