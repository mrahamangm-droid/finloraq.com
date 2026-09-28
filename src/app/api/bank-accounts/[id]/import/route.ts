import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenant";
import { ForbiddenError } from "@/lib/rbac";
import { NotFoundError } from "@/lib/errors";
import { getPreferences } from "@/lib/customization/server";
import { parseBankStatement, StatementParseError } from "@/lib/bankStatement";
import { importBankStatement, BankValidationError } from "@/lib/banking";

// A 5,000-line statement is well under 1 MB of CSV; 2 MB leaves room for OFX's verbosity.
const schema = z.object({
  fileName: z.string().min(1).max(255),
  content: z.string().min(1).max(2_000_000),
  commit: z.boolean().default(false),
});

/**
 * Imports a bank statement file (CSV or OFX/QFX) into this bank account as
 * unmatched bank lines. `commit: false` (the default) only previews: it
 * parses, checks for lines already imported, and writes nothing.
 */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { active, userId } = await requireTenantContext();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a CSV or OFX file under 2 MB." }, { status: 400 });
  }
  try {
    const prefs = await getPreferences(userId);
    const statement = parseBankStatement(parsed.data.content, {
      fileName: parsed.data.fileName,
      dayFirst: prefs.dateFormat !== "MM/DD/YYYY",
    });
    const result = await importBankStatement({
      companyId: active.companyId,
      membershipId: active.id,
      userId,
      bankAccountId: params.id,
      lines: statement.lines,
      fileName: parsed.data.fileName,
      commit: parsed.data.commit,
    });
    return NextResponse.json({ format: statement.format, skipped: statement.skipped.slice(0, 50), skippedCount: statement.skipped.length, ...result });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof StatementParseError || err instanceof BankValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
