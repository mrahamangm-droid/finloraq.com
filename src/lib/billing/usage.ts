import { prisma } from "@/lib/db";
import { planDefinition } from "@/lib/billing/plans";

export class UsageLimitExceededError extends Error {
  constructor(public readonly limit: number, public readonly used: number) {
    super(`AI usage limit reached (${used}/${limit} this month). Upgrade your plan to continue.`);
    this.name = "UsageLimitExceededError";
  }
}

/**
 * Every AI-backed feature (Copilot questions, document extraction, voice
 * queries — voice delegates to the Copilot so it's metered there) records
 * one AiUsageEvent per call, regardless of whether an AI provider is
 * actually configured: metering counts USAGE of the feature, not tokens
 * billed to a model, so plan limits are enforceable and testable even in
 * this sandbox with no AI key set.
 */
export async function recordAiUsage(params: {
  companyId: string;
  kind: "copilot_query" | "ocr_page" | "forecast_run";
  units?: number;
}): Promise<void> {
  const subscription = await prisma.subscription.findUnique({ where: { companyId: params.companyId } });
  if (!subscription) return; // no subscription row (shouldn't happen post-onboarding) — don't block the caller over metering

  await prisma.aiUsageEvent.create({
    data: { subscriptionId: subscription.id, kind: params.kind, units: params.units ?? 1 },
  });
}

function currentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

/** Total AI usage units (all kinds combined) so far this calendar month. */
export async function currentMonthAiUsage(companyId: string): Promise<number> {
  const subscription = await prisma.subscription.findUnique({ where: { companyId } });
  if (!subscription) return 0;

  const { start, end } = currentMonthRange();
  const events = await prisma.aiUsageEvent.findMany({
    where: { subscriptionId: subscription.id, createdAt: { gte: start, lt: end } },
    select: { units: true },
  });
  return events.reduce((sum, e) => sum + e.units, 0);
}

/**
 * Throws UsageLimitExceededError if this company's plan has a monthly AI
 * usage cap and it's already been reached. Call this BEFORE the AI call
 * (or its deterministic-template fallback — the limit is on feature
 * usage, not on whether a model was actually invoked) so a company on a
 * capped plan gets a clear upgrade prompt instead of silently degraded
 * answers.
 */
export async function enforceAiUsageLimit(companyId: string): Promise<void> {
  const subscription = await prisma.subscription.findUnique({ where: { companyId } });
  if (!subscription) return;

  const { aiUsageLimitPerMonth } = planDefinition(subscription.plan);
  if (aiUsageLimitPerMonth === null) return; // unlimited

  const used = await currentMonthAiUsage(companyId);
  if (used >= aiUsageLimitPerMonth) {
    throw new UsageLimitExceededError(aiUsageLimitPerMonth, used);
  }
}
