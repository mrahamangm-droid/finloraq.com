import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { ForbiddenError } from "@/lib/rbac";
import { getPreferences } from "@/lib/customization/server";
import { parseCsv } from "@/lib/files/csv";
import { parseXlsxRows } from "@/lib/files/xlsx-lite";
import { IMPORT_KINDS, parseTable, type ImportRow } from "@/lib/import/rows";
import { previewImport } from "@/lib/import/server";

export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024; // Vercel caps request bodies at ~4.5 MB; base64 adds a third.

const schema = z.object({
  kind: z.enum(IMPORT_KINDS),
  fileName: z.string().min(1).max(200),
  fileBase64: z.string().min(1),
});

/** Reads an uploaded CSV / Excel sheet and says exactly what importing it would do. Writes nothing. */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  const { kind, fileName, fileBase64 } = parsed.data;

  const buffer = Buffer.from(fileBase64, "base64");
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: "That file is over 3 MB. Split it into smaller sheets (for example one per year)." }, { status: 413 });
  }

  let table: string[][];
  try {
    const isXlsx = buffer.subarray(0, 2).toString("latin1") === "PK";
    if (isXlsx) table = parseXlsxRows(buffer);
    else if (/\.xls$/i.test(fileName)) return NextResponse.json({ error: "Old .xls files can't be read — in Excel use File → Save As → .xlsx or .csv." }, { status: 400 });
    else table = parseCsv(buffer.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Couldn't read that file. Upload a .csv or .xlsx sheet." }, { status: 400 });
  }

  const prefs = await getPreferences(ctx.userId);
  const { rows, error, periodTotals } = parseTable(kind, table, { dayFirst: prefs.dateFormat !== "MM/DD/YYYY" });
  if (!rows.length) return NextResponse.json({ error: error ?? "No rows found in that sheet." }, { status: 400 });

  const good = rows.filter((r) => r.row).map((r) => r.row as ImportRow);
  const preview = await previewImport({ companyId: ctx.active.companyId, membershipId: ctx.active.id, userId: ctx.userId }, kind, good);

  return NextResponse.json({
    kind,
    warning: error ?? null,
    periodTotals,
    currency: ctx.active.company.baseCurrency,
    rows: rows.map((r) => ({ line: r.line, errors: r.errors, notes: r.notes, row: r.row })),
    ...preview,
  });
}
