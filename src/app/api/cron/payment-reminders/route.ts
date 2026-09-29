/**
 * Cron endpoint — send automated payment reminders for overdue invoices.
 * Trigger daily around 08:00 UTC after the business day starts.
 *
 * Vercel cron.json entry (add alongside recurring-invoices):
 *   { "path": "/api/cron/payment-reminders", "schedule": "0 8 * * *" }
 *
 * Dry-run: pass ?dryRun=1 (or body { dryRun: true }) to see what would be
 * sent without actually emailing anyone.
 */
import { NextRequest, NextResponse } from "next/server";
import { processPaymentReminders } from "@/lib/payment-reminders";

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Support ?dryRun=1 or body { dryRun: true } for safe testing
  const url = new URL(req.url);
  let dryRun = url.searchParams.get("dryRun") === "1";
  let intervalDays: number | undefined;

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.dryRun === true) dryRun = true;
    if (typeof body.intervalDays === "number") intervalDays = body.intervalDays;
  } catch {
    // GET requests have no body — ignore
  }

  const result = await processPaymentReminders({ dryRun, intervalDays });
  return NextResponse.json({ ...result, dryRun, timestamp: new Date().toISOString() });
}

// Vercel Cron sends GET requests
export async function GET(req: NextRequest) {
  return POST(req);
}
