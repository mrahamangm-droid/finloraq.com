import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { domainErrorResponse } from "@/lib/api-errors";
import { checkRateLimit } from "@/lib/rateLimit";
import { exportCompanyData } from "@/lib/dataExport";

// A full export reads every core table; give it room on large companies.
export const maxDuration = 60;

/** Downloads the caller's company as a ZIP of CSVs (see src/lib/dataExport.ts). */
export async function GET() {
  const { active, userId } = await requireTenantContext();
  const limit = await checkRateLimit(`export:${active.id}`, 5, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many exports in the last hour. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000))) } }
    );
  }
  try {
    const { zip, exportedAt } = await exportCompanyData({ companyId: active.companyId, membershipId: active.id, userId });
    const slug = active.company.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "company";
    const fileName = `finloraq-export-${slug}-${exportedAt.toISOString().slice(0, 10)}.zip`;
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return domainErrorResponse(err);
  }
}
