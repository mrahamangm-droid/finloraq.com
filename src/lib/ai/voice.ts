import { answerQuestion } from "@/lib/ai/copilot";
import { createExpense } from "@/lib/expenses";
import { prisma } from "@/lib/db";
import { planDefinition } from "@/lib/billing/plans";

/**
 * Voice command architecture (spec section 9). There's no speech-to-text
 * service configured here, so this operates on an already-transcribed
 * string — swapping in a real STT provider (Whisper, etc.) ahead of this
 * function is the only piece missing for actual voice input, and it's a
 * clean seam because everything downstream already works on text.
 *
 * The one rule this file exists to enforce: a query ("show overdue
 * invoices", "how much cash do we have") is answered immediately by
 * reusing the AI Copilot (src/lib/ai/copilot.ts) — same read-only,
 * data-backed answers, just a different entry point. A command that would
 * CHANGE something ("draft an expense for AED 500") is never executed
 * directly from parseVoiceCommand(); it returns a proposal, and a
 * separate, explicit confirmVoiceAction() call is what actually runs it —
 * matching "financial actions require confirmation/approval" literally,
 * not just as a UI suggestion.
 */

export type VoiceCommandResult =
  | { type: "query"; question: string; answer: string }
  | { type: "action_proposed"; action: "draft_expense"; description: string; amount: number; summary: string }
  | { type: "unrecognized"; message: string };

const DRAFT_EXPENSE_PATTERN = /draft (?:an? )?expense.*?(?:for|of)\s*(?:aed|usd|\$)?\s*([\d,]+(?:\.\d+)?)/i;

export async function parseVoiceCommand(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  transcript: string;
}): Promise<VoiceCommandResult> {
  const subscription = await prisma.subscription.findUnique({ where: { companyId: params.companyId } });
  if (subscription && !planDefinition(subscription.plan).features.voiceCommands) {
    return {
      type: "unrecognized",
      message: `Voice commands aren't included in the ${planDefinition(subscription.plan).label} plan. Upgrade to Professional or higher to enable them.`,
    };
  }

  const t = params.transcript.trim();
  const expenseMatch = t.match(DRAFT_EXPENSE_PATTERN);

  if (expenseMatch) {
    const amount = parseFloat(expenseMatch[1]!.replace(/,/g, ""));
    const description = t.replace(DRAFT_EXPENSE_PATTERN, "").trim() || "Voice-drafted expense";
    return {
      type: "action_proposed",
      action: "draft_expense",
      description,
      amount,
      summary: `Draft an expense of ${amount.toFixed(2)} — "${description}". This will be created as a DRAFT; it still needs Approve permission to post.`,
    };
  }

  // Everything else is treated as a query and handed to the same copilot
  // logic text questions use — "how much cash do we have", "show overdue
  // invoices", "why are expenses higher this month" all match existing
  // copilot intents.
  const result = await answerQuestion({
    companyId: params.companyId,
    membershipId: params.membershipId,
    userId: params.userId,
    question: t,
  });

  return { type: "query", question: t, answer: result.answer };
}

/** The explicit second step — only this function has side effects. */
export async function confirmVoiceAction(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  action: "draft_expense";
  description: string;
  amount: number;
}) {
  if (params.action === "draft_expense") {
    return createExpense({
      companyId: params.companyId,
      membershipId: params.membershipId,
      userId: params.userId,
      date: new Date(),
      description: params.description,
      amount: params.amount,
    });
  }
  throw new Error(`Unknown voice action: ${params.action}`);
}
