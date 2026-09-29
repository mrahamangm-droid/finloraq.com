/**
 * Cron endpoint — triggered daily by an external scheduler (Vercel Cron,
 * GitHub Actions, or equivalent). Secured by CRON_SECRET env var.
 *
 * Vercel cron.json:
 *   { "crons": [{ "path": "/api/cron/recurring-invoices", "schedule": "0 3 * * *" }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { processRecurringInvoices } from "@/lib/recurring-invoices";

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron endpoint not configured" }, { status: 501 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processRecurringInvoices(new Date());
  return NextResponse.json(result);
}

// Also allow GET for Vercel cron (it sends GET by default)
export async function GET(req: NextRequest) {
  return POST(req);
}
