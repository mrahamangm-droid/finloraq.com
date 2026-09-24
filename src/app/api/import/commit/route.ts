import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/lib/tenant";
import { ForbiddenError } from "@/lib/rbac";
import { IMPORT_KINDS, checkRow, type ImportRow } from "@/lib/import/rows";
import { commitRows } from "@/lib/import/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Small chunks keep each request well inside serverless time limits; the page sends them one after another.
const schema = z.object({
  kind: z.enum(IMPORT_KINDS),
  rows: z.array(z.unknown()).min(1).max(40),
  keys: z.array(z.string().min(1).max(2000)).min(1).max(40),
});

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.rows.length !== parsed.data.keys.length) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { kind, keys } = parsed.data;
  const rows: ImportRow[] = [];
  for (const raw of parsed.data.rows) {
    const row = checkRow(kind, raw);
    if (!row) return NextResponse.json({ error: "A row in this batch is malformed — re-upload the sheet." }, { status: 400 });
    rows.push(row);
  }

  try {
    const results = await commitRows(
      { companyId: ctx.active.companyId, membershipId: ctx.active.id, userId: ctx.userId, currency: ctx.active.company.baseCurrency },
      kind, rows, keys,
    );
    for (const p of ["/dashboard", "/expenses", "/sales", "/purchases", "/customers", "/suppliers"]) revalidatePath(p);
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "You don't have permission to post these entries. Ask an admin or accountant with approval rights." }, { status: 403 });
    }
    throw err;
  }
}
