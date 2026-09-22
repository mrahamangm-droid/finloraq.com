import { profitAndLoss, arAging, vatReturn } from "@/lib/reports";
import { cashFlowForecast, customerPaymentBehavior } from "@/lib/cashflow";
import { findDuplicateBills, findDuplicateInvoices, largestExpenses } from "@/lib/ai/analysis";
import { getAiProvider } from "@/lib/ai/provider";
import { requirePermission } from "@/lib/rbac";
import { recordAuditEvent } from "@/lib/audit";

export interface CopilotAnswer {
  answer: string;
  data: unknown;
  aiPhrased: boolean;
}

/**
 * Answers a natural-language finance question. The shape is deliberately
 * "classify intent → fetch real numbers from the existing report/analysis
 * functions → phrase an answer" rather than a free-form LLM tool-use loop:
 * every number in the answer traces to a specific query this file runs,
 * never to the model's own arithmetic. When an AI provider is configured,
 * the model only rephrases the already-computed data into prose — its
 * system prompt explicitly forbids adding or changing any figure — and
 * unconfigured deployments fall back to a template answer built from the
 * same data, so the feature degrades gracefully rather than failing.
 */
export async function answerQuestion(params: {
  companyId: string;
  membershipId: string;
  userId: string;
  question: string;
}): Promise<CopilotAnswer> {
  await requirePermission(params.membershipId, "ai_copilot", "VIEW");

  const q = params.question.toLowerCase();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59));

  let data: unknown;
  let template: string;

  if (/why.*(profit|margin).*(decrease|drop|down|fell)|profit.*decrease/.test(q)) {
    const [thisMonth, lastMonth] = await Promise.all([
      profitAndLoss(params.companyId, monthStart, now),
      profitAndLoss(params.companyId, lastMonthStart, lastMonthEnd),
    ]);
    const delta = thisMonth.netProfit.minus(lastMonth.netProfit);
    data = { thisMonth, lastMonth, delta: delta.toNumber() };
    template = `This month's net profit is ${thisMonth.netProfit.toFixed(2)} vs ${lastMonth.netProfit.toFixed(2)} last month, a change of ${delta.toFixed(2)}. Revenue: ${thisMonth.totalRevenue.toFixed(2)} (was ${lastMonth.totalRevenue.toFixed(2)}). Expenses: ${thisMonth.totalExpense.toFixed(2)} (was ${lastMonth.totalExpense.toFixed(2)}).`;
  } else if (/overdue/.test(q) && /customer|invoice/.test(q)) {
    const ar = await arAging(params.companyId, now);
    const overdue = ar.filter((r) => r.bucket !== "current");
    data = overdue;
    template = overdue.length === 0
      ? "No overdue customer invoices right now."
      : `${overdue.length} overdue invoice(s), totaling ${overdue.reduce((a, r) => a + r.balance, 0).toFixed(2)}: ` +
        overdue.slice(0, 10).map((r) => `${r.partyName} — ${r.number} (${r.balance.toFixed(2)}, ${r.bucket})`).join("; ");
  } else if (/vat|tax.*owe|how much.*tax/.test(q)) {
    const vat = await vatReturn(params.companyId, monthStart, now);
    data = vat;
    template = vat.netPayable.isNegative()
      ? `You have a net VAT refund position of ${vat.netPayable.abs().toFixed(2)} this month (output tax ${vat.outputTax.toFixed(2)}, input tax ${vat.inputTax.toFixed(2)}).`
      : `You owe ${vat.netPayable.toFixed(2)} in VAT this month (output tax ${vat.outputTax.toFixed(2)} minus input tax ${vat.inputTax.toFixed(2)}).`;
  } else if (/paying late|payment behavior|slow.*pay/.test(q)) {
    const behavior = await customerPaymentBehavior(params.companyId);
    data = behavior;
    const late = behavior.filter((b) => b.avgDaysLate > 0);
    template = late.length === 0
      ? "No customers with a history of late payment yet."
      : `Customers paying late, worst first: ` + late.slice(0, 10).map((b) => `${b.customerName} (avg ${b.avgDaysLate} days late, ${b.invoiceCount} invoice(s))`).join("; ");
  } else if (/largest expense/.test(q)) {
    const expenses = await largestExpenses(params.companyId, monthStart, now);
    data = expenses;
    template = expenses.length === 0
      ? "No expenses posted this month yet."
      : `Largest expenses this month: ` + expenses.map((e) => `${e.accountName} — ${e.amount.toFixed(2)} (${e.memo ?? "no memo"})`).join("; ");
  } else if (/forecast|cash.*(next|90|60|30)|next.*days.*cash/.test(q)) {
    const forecast = await cashFlowForecast(params.companyId);
    data = forecast;
    template = `Current cash: ${forecast.currentCash.toFixed(2)}. ` +
      forecast.buckets.map((b) => `In ${b.days} days: projected ${b.projectedCash.toFixed(2)} (expected in ${b.expectedInflow.toFixed(2)}, out ${b.expectedOutflow.toFixed(2)})`).join(". ");
  } else if (/duplicate/.test(q)) {
    const [dupBills, dupInvoices] = await Promise.all([
      findDuplicateBills(params.companyId),
      findDuplicateInvoices(params.companyId),
    ]);
    data = { dupBills, dupInvoices };
    const total = dupBills.length + dupInvoices.length;
    template = total === 0
      ? "No likely duplicate invoices or bills found (same party, same amount, within 7 days of each other)."
      : `Found ${dupBills.length} possible duplicate bill pair(s) and ${dupInvoices.length} possible duplicate invoice pair(s): ` +
        [...dupBills.map((d) => `Bills ${d.billNumbers.join(" & ")} — ${d.supplierName}, ${d.amount.toFixed(2)}`),
         ...dupInvoices.map((d) => `Invoices ${d.invoiceNumbers.join(" & ")} — ${d.customerName}, ${d.amount.toFixed(2)}`)].join("; ");
  } else if (/explain.*p&l|explain.*profit.*loss|this month'?s p&l/.test(q)) {
    const pnl = await profitAndLoss(params.companyId, monthStart, now);
    data = pnl;
    template = `Revenue ${pnl.totalRevenue.toFixed(2)}, expenses ${pnl.totalExpense.toFixed(2)}, net profit ${pnl.netProfit.toFixed(2)}. ` +
      (pnl.revenue.length ? `Revenue by account: ${pnl.revenue.map((r) => `${r.accountName} ${r.amount.toFixed(2)}`).join(", ")}. ` : "") +
      (pnl.expense.length ? `Expenses by account: ${pnl.expense.map((e) => `${e.accountName} ${e.amount.toFixed(2)}`).join(", ")}.` : "");
  } else {
    data = null;
    template =
      "I can answer questions like: \"Show my overdue customers\", \"How much VAT do I owe?\", " +
      "\"Which customers are paying late?\", \"What are my largest expenses?\", " +
      "\"Forecast my cash balance for the next 90 days\", \"Find duplicate supplier invoices\", " +
      "\"Explain this month's P&L\", and \"Why did profit decrease this month?\" — try rephrasing " +
      "your question closer to one of these; broader natural-language understanding is a follow-up " +
      "improvement to this first version of the copilot.";
  }

  const provider = getAiProvider();
  let answer = template;
  let aiPhrased = false;

  if (provider && data !== null) {
    try {
      answer = await provider.complete({
        system:
          "You are Finloraq's finance copilot. You are given a user's question and the EXACT, " +
          "already-computed data that answers it, as JSON. Write a clear, concise, professional " +
          "answer (2-5 sentences) using ONLY the numbers and facts present in the JSON. Never " +
          "compute, estimate, or add any figure that is not already in the JSON. If the JSON is " +
          "empty or shows no results, say so plainly.",
        prompt: `Question: ${params.question}\n\nData:\n${JSON.stringify(data)}`,
        maxTokens: 400,
      });
      aiPhrased = true;
    } catch {
      // Fall back to the deterministic template — never fail the whole
      // answer because the AI call failed; the data-backed answer still
      // stands on its own.
      answer = template;
    }
  }

  await recordAuditEvent({
    companyId: params.companyId,
    userId: params.userId,
    action: "ai.copilot_query",
    entityType: "AiUsageEvent",
    entityId: params.companyId,
    newValue: { question: params.question, aiPhrased },
    source: "ai",
  });

  return { answer, data, aiPhrased };
}
